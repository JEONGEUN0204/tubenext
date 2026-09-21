import { AppError } from "@/lib/errors";
import { parseChannelInput } from "@/lib/handle";
import { summarizeUploads } from "@/lib/stats";
import { rankViral } from "@/lib/viral";
import { extractProfile, generateIdeas } from "@/services/claude";
import {
  fetchChannel,
  fetchRecentVideos,
  searchViralCandidates,
} from "@/services/youtube";
import type {
  AnalyzeResponse,
  ChannelProfile,
  ContentIdea,
  ErrorCode,
  ViralVideo,
} from "@/types";

// 한 요청 안에서 YouTube 호출과 Claude 호출 2회가 전부 끝난다 (ADR-001).
export const maxDuration = 120;

const MIN_VIDEO_COUNT = 5;

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  BAD_INPUT: 400,
  CHANNEL_NOT_FOUND: 404,
  TOO_FEW_VIDEOS: 422,
  QUOTA_EXCEEDED: 429,
  UPSTREAM_ERROR: 502,
};

// 사용자에게 보일 문구는 여기서만 정한다. 서비스 내부 메시지는 그대로 내보내지 않는다.
const MESSAGE_BY_CODE: Record<ErrorCode, string> = {
  BAD_INPUT: "채널 URL의 @핸들 주소를 넣어주세요.",
  CHANNEL_NOT_FOUND: "채널을 찾을 수 없습니다. @핸들을 확인해주세요.",
  TOO_FEW_VIDEOS: "분석할 영상이 부족합니다. (최소 5개 필요)",
  QUOTA_EXCEEDED:
    "오늘 YouTube API 할당량을 다 썼습니다. 내일 다시 시도해주세요.",
  UPSTREAM_ERROR: "분석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
};

const UNKNOWN_ERROR_MESSAGE = "분석 중 오류가 발생했습니다.";

export async function POST(req: Request): Promise<Response> {
  try {
    const query = parseChannelInput(await readHandle(req));
    if (!query) throw badInput();

    const channel = await fetchChannel(query);
    if (!channel) throw appError("CHANNEL_NOT_FOUND");

    const videos = await fetchRecentVideos(channel.uploadsPlaylistId);
    if (videos.length < MIN_VIDEO_COUNT) throw appError("TOO_FEW_VIDEOS");

    const profile: ChannelProfile = {
      ...(await extractProfile(channel, videos)),
      ...summarizeUploads(videos),
    };

    const candidates = await searchViralCandidates(profile.searchKeywords);
    const viral = rankViral(candidates, channel.id);

    const body: AnalyzeResponse = {
      channel,
      profile,
      viral,
      ideas: await ideasOrEmpty(profile, viral),
    };
    return Response.json(body);
  } catch (error) {
    return errorResponse(error);
  }
}

async function readHandle(req: Request): Promise<string> {
  const body: unknown = await req.json().catch(() => null);
  const handle = (body as { handle?: unknown } | null)?.handle;

  if (typeof handle !== "string" || handle.trim() === "") throw badInput();
  return handle;
}

// 기획안 생성만 실패를 삼킨다. 여기까지 왔으면 YouTube 할당량 306 units를 이미 썼고,
// 프로필과 바이럴 결과는 그대로 쓸 수 있다. 나머지 단계의 실패는 전부 밖으로 던진다.
async function ideasOrEmpty(
  profile: ChannelProfile,
  viral: ViralVideo[],
): Promise<ContentIdea[]> {
  try {
    return await generateIdeas(profile, viral);
  } catch (error) {
    console.error("[analyze] generateIdeas 실패", error);
    return [];
  }
}

function errorResponse(error: unknown): Response {
  if (error instanceof AppError) {
    return Response.json(
      { error: MESSAGE_BY_CODE[error.code], code: error.code },
      { status: STATUS_BY_CODE[error.code] },
    );
  }

  // 원본 메시지에는 API 키나 내부 URL이 섞일 수 있다. 서버 로그에만 남긴다.
  console.error("[analyze] 처리되지 않은 예외", error);
  return Response.json(
    { error: UNKNOWN_ERROR_MESSAGE, code: "UPSTREAM_ERROR" },
    { status: 500 },
  );
}

function appError(code: ErrorCode): AppError {
  return new AppError(code, MESSAGE_BY_CODE[code]);
}

function badInput(): AppError {
  return appError("BAD_INPUT");
}
