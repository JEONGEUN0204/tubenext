import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import type {
  ChannelProfile,
  ChannelSummary,
  ContentIdea,
  ProfileCore,
  VideoStat,
  ViralVideo,
} from "@/types";

const MODEL = "claude-opus-5";
const MAX_TOKENS = 16_000;
// search.list가 호출당 100 units다. 모델이 4개를 주면 검색이 1회 더 돌아간다.
const SEARCH_KEYWORD_COUNT = 3;
const IDEA_COUNT = 5;
const VIRAL_PROMPT_COUNT = 8;

const ProfileSchema = z.object({
  niche: z.string(),
  audience: z.string(),
  formats: z.array(z.string()),
  searchKeywords: z.array(z.string()),
});

const IdeasSchema = z.object({
  ideas: z.array(
    z.object({
      title: z.string(),
      hook: z.string(),
      outline: z.array(z.string()),
      whyNow: z.string(),
      referenceVideoId: z.string(),
      // z.tuple은 items: false를 내보내고 SDK 스키마 검증이 이를 거부한다.
      // 길이 2로 고정한 배열을 받아 아래에서 [최소, 최대] 튜플로 좁힌다.
      estimatedMinutes: z.array(z.number()).length(2),
    }),
  ),
});

export async function extractProfile(
  channel: ChannelSummary,
  videos: VideoStat[],
): Promise<ProfileCore> {
  const videoLines = videos
    .map(
      (v, i) =>
        `${i + 1}. ${v.title} / 조회수 ${v.viewCount} / 길이 ${v.durationSec}초`,
    )
    .join("\n");

  try {
    const response = await createClient().messages.parse({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: [
        "너는 유튜브 채널 분석가다. 최근 업로드 목록만 보고 채널의 콘텐츠 정체성을 뽑아낸다.",
        "",
        "- niche: 무슨 콘텐츠를 하는 채널인지 한 줄. 소재와 각도를 함께 적는다.",
        "- audience: 이 영상을 찾아보는 시청자가 누구인지 한 줄.",
        "- formats: 반복되는 제작 포맷 2~4개. 영상 길이대나 촬영·편집 방식처럼 목록에서 실제로 관찰되는 것만 적는다.",
        "- searchKeywords: 정확히 3개. YouTube 검색창에 그대로 입력할 한국어 키워드다.",
        "  · 채널명·진행자 이름·시리즈명 같은 고유명사를 넣지 마라. 이 채널 영상만 다시 검색된다.",
        "  · 이 채널과 같은 주제를 다루는 다른 채널의 영상이 검색될 일반 키워드여야 한다.",
        "  · 한 단어보다 실제로 검색에 쓰이는 2~3어절 구가 좋다.",
      ].join("\n"),
      messages: [
        {
          role: "user",
          content: [
            `채널명: ${channel.title}`,
            `구독자 수: ${channel.subscriberCount}`,
            "",
            `최근 업로드 ${videos.length}개:`,
            videoLines,
          ].join("\n"),
        },
      ],
      output_config: {
        // 단순 추출이다. 지연과 비용을 줄인다.
        effort: "low",
        format: zodOutputFormat(ProfileSchema),
      },
    });

    const parsed = requireParsed(response.parsed_output);

    return {
      niche: parsed.niche,
      audience: parsed.audience,
      formats: parsed.formats,
      searchKeywords: parsed.searchKeywords.slice(0, SEARCH_KEYWORD_COUNT),
    };
  } catch (error) {
    throw toUpstreamError(error);
  }
}

export async function generateIdeas(
  profile: ChannelProfile,
  viral: ViralVideo[],
): Promise<ContentIdea[]> {
  const picked = viral.slice(0, VIRAL_PROMPT_COUNT);
  const viralLines = picked
    .map(
      (v, i) =>
        `${i + 1}. [${v.id}] ${v.title} / 업로더 구독자 ${v.subscriberCount}명 대비 ${v.multiple}배 / 조회수 ${v.viewCount}`,
    )
    .join("\n");

  try {
    const response = await createClient().messages.parse({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: [
        "너는 유튜브 채널의 콘텐츠 기획자다. 채널 프로필과 지금 터지고 있는 영상을 근거로 다음에 만들 영상 기획안 5개를 쓴다.",
        "",
        `- title: 그대로 영상 제목으로 업로드할 수 있는 수준으로 쓴다. "새로운 요리 기획" 같은 기획서 항목명은 안 된다.`,
        "- hook: 영상 첫 5초에 말할 한 문장.",
        "- outline: 3~5개의 촬영 단계. 각 항목은 그날 무엇을 찍는지다.",
        "- whyNow: 제시된 바이럴 영상 중 하나를 근거로 지목해서 지금 이걸 만들어야 하는 이유를 쓴다.",
        "- referenceVideoId: 반드시 입력으로 준 대괄호 안의 영상 id 중 하나. 새로 만들지 마라.",
        "- estimatedMinutes: [최소, 최대] 분. 이 채널의 평균 길이에서 크게 벗어나지 않게 한다.",
        "",
        "이 채널이 실제로 찍을 수 있는 포맷과 길이 안에서만 제안한다. 장비·출연자·예산이 새로 필요한 기획은 쓰지 마라.",
        "5개는 서로 다른 소재여야 한다. 같은 아이디어의 제목만 바꾼 변형을 넣지 마라.",
      ].join("\n"),
      messages: [
        {
          role: "user",
          content: [
            "[내 채널 프로필]",
            `니치: ${profile.niche}`,
            `타깃 시청자: ${profile.audience}`,
            `주력 포맷: ${profile.formats.join(", ")}`,
            `평균 조회수: ${profile.avgViews} (중간값 ${profile.medianViews})`,
            `업로드 주기: ${profile.uploadIntervalDays}일`,
            `평균 길이: ${profile.avgDurationSec}초`,
            `잘 나온 영상: ${profile.topPerformers.join(" / ")}`,
            "",
            "[지금 터지고 있는 영상 — 배율 = 조회수 / 업로더 구독자 수]",
            viralLines,
          ].join("\n"),
        },
      ],
      output_config: {
        // 실제 기획을 쓰는 작업이다.
        effort: "medium",
        format: zodOutputFormat(IdeasSchema),
      },
    });

    const parsed = requireParsed(response.parsed_output);

    // 없는 id가 들어오면 UI에서 참고 영상 링크가 깨진다.
    const allowedIds = new Set(picked.map((v) => v.id));
    const fallbackId = picked[0]?.id ?? "";

    return parsed.ideas.slice(0, IDEA_COUNT).map((idea) => ({
      ...idea,
      referenceVideoId: allowedIds.has(idea.referenceVideoId)
        ? idea.referenceVideoId
        : fallbackId,
      // 스키마가 길이 2를 보장한다. 아니면 parsed_output이 null로 떨어진다.
      estimatedMinutes: [idea.estimatedMinutes[0], idea.estimatedMinutes[1]],
    }));
  } catch (error) {
    throw toUpstreamError(error);
  }
}

/** Claude를 호출해볼 수 있는 상태인지. false면 호출을 건너뛰고 규칙 기반 경로로 간다. */
export function isLlmEnabled(): boolean {
  // process.env는 apiKey()와 같은 이유로 모듈 최상위가 아니라 호출 시점에 읽는다.
  // 최상위에서 읽으면 next build가 모듈을 평가할 때 값이 굳는다.
  // 수동 스위치다. 값이 없으면 "켜짐"으로 본다.
  if (process.env.LLM_MODE?.toLowerCase() === "off") return false;
  // 키가 있는지만 본다. 값 자체는 반환하지도 로그로 남기지도 않는다. (CLAUDE.md CRITICAL)
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

// 클라이언트는 호출 시점에 만든다. 모듈 최상위에서 만들면 키가 없을 때
// next build가 모듈을 평가하는 단계에서 깨진다.
// ANTHROPIC_API_KEY는 SDK가 직접 읽는다. 키를 인자로 넘기지 않는다.
function createClient(): Anthropic {
  return new Anthropic();
}

function requireParsed<T>(parsedOutput: T | null | undefined): T {
  if (!parsedOutput) {
    throw new AppError("UPSTREAM_ERROR", "콘텐츠 분석에 실패했습니다.");
  }
  return parsedOutput;
}

function toUpstreamError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  // 원본 SDK 에러 메시지에는 API 키나 요청 본문이 섞일 수 있다.
  // 이 메시지는 라우트를 통해 클라이언트로 나가므로 고정 문구로 덮는다.
  return new AppError("UPSTREAM_ERROR", "콘텐츠 분석에 실패했습니다.");
}
