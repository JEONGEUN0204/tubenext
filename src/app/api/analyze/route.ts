import { AppError } from "@/lib/errors";
import { parseChannelInput } from "@/lib/handle";
import { buildRuleIdeas } from "@/lib/rule-ideas";
import { buildRuleProfile } from "@/lib/rule-profile";
import { summarizeUploads } from "@/lib/stats";
import { rankViral } from "@/lib/viral";
import { extractProfile, generateIdeas, isLlmEnabled } from "@/services/claude";
import {
  fetchChannel,
  fetchRecentVideos,
  searchViralCandidates,
} from "@/services/youtube";
import type {
  AnalysisMode,
  AnalyzeResponse,
  ChannelProfile,
  ChannelSummary,
  ContentIdea,
  ErrorCode,
  ProfileCore,
  VideoStat,
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

    // 게이트는 요청당 한 번만 본다. 이 판정도, 뒤에 이어지는 "Claude가 죽었다"는
    // 기록도 요청 하나 안에서만 유효하다. 모듈 스코프에 남기면 무상태 원칙이 깨진다 (ADR-006).
    const llmEnabled = isLlmEnabled();

    const channel = await fetchChannel(query);
    if (!channel) throw appError("CHANNEL_NOT_FOUND");

    const videos = await fetchRecentVideos(channel.uploadsPlaylistId);
    if (videos.length < MIN_VIDEO_COUNT) throw appError("TOO_FEW_VIDEOS");

    const profileStep = await resolveProfile(channel, videos, llmEnabled);
    // 통계는 프로필이 LLM이든 규칙이든 똑같이 붙는다.
    const profile: ChannelProfile = {
      ...profileStep.value,
      ...summarizeUploads(videos),
    };

    const candidates = await searchViralCandidates(profile.searchKeywords);
    const viral = rankViral(candidates, channel.id);

    // 프로필이 llm으로 나왔다는 건 게이트를 통과했고 실패도 없었다는 뜻이다.
    // 한 번 실패했으면 남은 호출도 실패한다고 보고 건너뛴다. 매 요청 2번씩
    // 타임아웃을 기다리면 응답만 수 초 느려지고 결과는 어차피 규칙 경로다.
    const claudeAlive = profileStep.mode === "llm";
    const ideasStep = await resolveIdeas(profile, viral, claudeAlive);

    const body: AnalyzeResponse = {
      channel,
      profile,
      viral,
      ideas: ideasStep.value,
      mode: { profile: profileStep.mode, ideas: ideasStep.mode },
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

// 어느 경로가 값을 만들었는지는 추측하지 않는다. 실제로 값을 만든 자리에서 같이 들고 나온다.
interface Step<T> {
  value: T;
  mode: AnalysisMode;
}

// Claude 실패는 폴백 대상이다(크레딧 소진·401·429·파싱 실패 전부).
// YouTube 실패는 여기까지 오지 않고 그대로 밖으로 나간다 — 채널을 못 찾은 상황에서
// 규칙 기반으로 만들 수 있는 게 없고, 사용자가 원인을 알아야 하는 에러다.
async function resolveProfile(
  channel: ChannelSummary,
  videos: VideoStat[],
  llmEnabled: boolean,
): Promise<Step<ProfileCore>> {
  if (!llmEnabled) {
    return { value: buildRuleProfile(channel, videos), mode: "rule" };
  }

  try {
    return { value: await extractProfile(channel, videos), mode: "llm" };
  } catch (error) {
    // 원본 메시지에는 API 키나 요청 본문이 섞일 수 있다. 서버 로그에만 남긴다.
    console.error("[analyze] extractProfile 실패 — 규칙 기반으로 대체", error);
    return { value: buildRuleProfile(channel, videos), mode: "rule" };
  }
}

async function resolveIdeas(
  profile: ChannelProfile,
  viral: ViralVideo[],
  claudeAlive: boolean,
): Promise<Step<ContentIdea[]>> {
  // 근거로 지목할 영상이 없는데 기획안을 지어내라고 시키면 비용만 쓰고
  // 근거 없는 결과가 나온다. buildRuleIdeas가 빈 배열을 돌려준다.
  if (!claudeAlive || viral.length === 0) {
    return { value: buildRuleIdeas(profile, viral), mode: "rule" };
  }

  try {
    return { value: await generateIdeas(profile, viral), mode: "llm" };
  } catch (error) {
    console.error("[analyze] generateIdeas 실패 — 규칙 기반으로 대체", error);
    return { value: buildRuleIdeas(profile, viral), mode: "rule" };
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
