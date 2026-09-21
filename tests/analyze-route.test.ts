import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/analyze/route";
import { AppError } from "@/lib/errors";
import { buildRuleProfile } from "@/lib/rule-profile";
import { extractProfile, generateIdeas, isLlmEnabled } from "@/services/claude";
import {
  fetchChannel,
  fetchRecentVideos,
  searchViralCandidates,
} from "@/services/youtube";
import type {
  ChannelSummary,
  ContentIdea,
  ProfileCore,
  VideoStat,
  ViralCandidate,
} from "@/types";

// 외부 API를 타는 두 서비스만 mock한다. lib/은 순수 함수라 실제로 돌린다.
vi.mock("@/services/youtube", () => ({
  fetchChannel: vi.fn(),
  fetchRecentVideos: vi.fn(),
  searchViralCandidates: vi.fn(),
}));

vi.mock("@/services/claude", () => ({
  extractProfile: vi.fn(),
  generateIdeas: vi.fn(),
  isLlmEnabled: vi.fn(),
}));

const fetchChannelMock = vi.mocked(fetchChannel);
const fetchRecentVideosMock = vi.mocked(fetchRecentVideos);
const searchViralCandidatesMock = vi.mocked(searchViralCandidates);
const extractProfileMock = vi.mocked(extractProfile);
const generateIdeasMock = vi.mocked(generateIdeas);
const isLlmEnabledMock = vi.mocked(isLlmEnabled);

const channel: ChannelSummary = {
  id: "UCme",
  title: "자취요리연구소",
  subscriberCount: 12_000,
  thumbnailUrl: "https://i.ytimg.com/ch/hq.jpg",
  uploadsPlaylistId: "UUme",
};

function video(index: number): VideoStat {
  return {
    id: `v${index}`,
    title: `내 영상 ${index}`,
    publishedAt: `2026-09-0${index}T00:00:00Z`,
    viewCount: 10_000 * index,
    durationSec: 300,
  };
}

const videos: VideoStat[] = [1, 2, 3, 4, 5, 6].map(video);

// 규칙 기반 폴백은 제목에서 키워드를 실제로 뽑는다. `내 영상 N`에서는 한 개도 안 나온다.
const ruleVideos: VideoStat[] = [
  "자취 김치찌개 끓이기",
  "자취 김치찌개 다시 끓이기",
  "자취 된장찌개 끓이기",
  "자취 된장찌개 맛있게",
  "혼밥 라면 끓이기",
  "혼밥 김밥 싸기",
].map((title, i) => ({ ...video(i + 1), title }));

const core: ProfileCore = {
  niche: "1인가구 자취요리 · 저예산 간편식",
  audience: "요리 안 해본 20~30대 자취생",
  formats: ["5분 내외", "조리과정 풀샷"],
  searchKeywords: ["자취요리", "간단 저녁", "에어프라이어 요리"],
};

function candidate(
  id: string,
  overrides: Partial<ViralCandidate> = {},
): ViralCandidate {
  return {
    id,
    title: `바이럴 영상 ${id}`,
    channelId: `UC-${id}`,
    channelTitle: `채널 ${id}`,
    subscriberCount: 3_000,
    viewCount: 300_000,
    publishedAt: "2026-09-15T00:00:00Z",
    thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    durationSec: 240,
    ...overrides,
  };
}

const candidates: ViralCandidate[] = [
  candidate("hit1"),
  candidate("hit2", { subscriberCount: 30_000 }),
];

const ideas: ContentIdea[] = [
  {
    title: "3천원으로 끝내는 자취 저녁",
    hook: "이거 하나면 저녁 끝납니다.",
    outline: ["재료 소개", "조리", "완성 컷"],
    whyNow: "같은 주제 영상이 구독자 100배로 터졌다.",
    referenceVideoId: "hit1",
    estimatedMinutes: [4, 6],
  },
];

function post(body: unknown): Request {
  return new Request("http://localhost/api/analyze", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// 서비스 mock이 뚫리면 여기서 걸린다. 테스트는 절대 네트워크를 타지 않는다. (CLAUDE.md CRITICAL)
const fetchGuard = vi.fn(() => {
  throw new Error("테스트에서 네트워크 호출이 발생했다");
});

describe("POST /api/analyze", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchGuard);
    vi.spyOn(console, "error").mockImplementation(() => {});

    fetchChannelMock.mockResolvedValue(channel);
    fetchRecentVideosMock.mockResolvedValue(videos);
    extractProfileMock.mockResolvedValue(core);
    searchViralCandidatesMock.mockResolvedValue(candidates);
    generateIdeasMock.mockResolvedValue(ideas);
    // 기본은 LLM이 살아 있는 상태다. 폴백 테스트에서만 끈다.
    isLlmEnabledMock.mockReturnValue(true);
  });

  afterEach(() => {
    expect(fetchGuard).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("정상 흐름이면 200과 다섯 개의 키를 돌려준다", async () => {
    const res = await POST(post({ handle: "@jachwi" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(Object.keys(body).sort()).toEqual([
      "channel",
      "ideas",
      "mode",
      "profile",
      "viral",
    ]);
    expect(body.channel).toEqual(channel);
    expect(body.ideas).toEqual(ideas);
    expect(body.mode).toEqual({ profile: "llm", ideas: "llm" });
  });

  it("프로필은 Claude 추출 결과와 업로드 통계를 합친 값이다", async () => {
    const res = await POST(post({ handle: "@jachwi" }));
    const body = await res.json();

    expect(body.profile.niche).toBe(core.niche);
    expect(body.profile.searchKeywords).toEqual(core.searchKeywords);
    // summarizeUploads(videos)의 결과 — 라우트가 직접 계산하지 않는다.
    expect(body.profile.avgViews).toBe(35_000);
    expect(body.profile.topPerformers[0]).toBe("내 영상 6");
  });

  it("파이프라인을 ARCHITECTURE.md 순서대로 엮는다", async () => {
    const res = await POST(post({ handle: "youtube.com/@jachwi" }));
    const body = await res.json();

    expect(fetchChannelMock).toHaveBeenCalledWith({
      by: "handle",
      value: "@jachwi",
    });
    expect(fetchRecentVideosMock).toHaveBeenCalledWith(
      channel.uploadsPlaylistId,
    );
    expect(extractProfileMock).toHaveBeenCalledWith(channel, videos);
    expect(searchViralCandidatesMock).toHaveBeenCalledWith(core.searchKeywords);
    // 순위는 rankViral이 매긴 배율 순서 그대로여야 한다.
    expect(body.viral.map((v: { id: string }) => v.id)).toEqual([
      "hit1",
      "hit2",
    ]);
    expect(body.viral[0].multiple).toBe(100);
    expect(generateIdeasMock).toHaveBeenCalledWith(body.profile, body.viral);
  });

  it("본문에 handle이 없으면 400을 돌려준다", async () => {
    const res = await POST(post({}));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe("BAD_INPUT");
    expect(body.error).toBe("채널 URL의 @핸들 주소를 넣어주세요.");
    expect(fetchChannelMock).not.toHaveBeenCalled();
  });

  it("파싱할 수 없는 입력이면 400을 돌려준다", async () => {
    const res = await POST(post({ handle: "https://youtube.com/c/legacy" }));

    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("BAD_INPUT");
    expect(fetchChannelMock).not.toHaveBeenCalled();
  });

  it("채널을 못 찾으면 404를 돌려준다", async () => {
    fetchChannelMock.mockResolvedValue(null);

    const res = await POST(post({ handle: "@없는채널" }));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.code).toBe("CHANNEL_NOT_FOUND");
    expect(body.error).toBe("채널을 찾을 수 없습니다. @핸들을 확인해주세요.");
    expect(fetchRecentVideosMock).not.toHaveBeenCalled();
  });

  it("영상이 5개 미만이면 422를 돌려준다", async () => {
    fetchRecentVideosMock.mockResolvedValue(videos.slice(0, 4));

    const res = await POST(post({ handle: "@jachwi" }));
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.code).toBe("TOO_FEW_VIDEOS");
    expect(body.error).toBe("분석할 영상이 부족합니다. (최소 5개 필요)");
    expect(extractProfileMock).not.toHaveBeenCalled();
  });

  it("할당량을 초과하면 429를 돌려준다", async () => {
    searchViralCandidatesMock.mockRejectedValue(
      new AppError("QUOTA_EXCEEDED", "YouTube API 일일 할당량을 초과했습니다."),
    );

    const res = await POST(post({ handle: "@jachwi" }));
    const body = await res.json();

    expect(res.status).toBe(429);
    expect(body.code).toBe("QUOTA_EXCEEDED");
    expect(generateIdeasMock).not.toHaveBeenCalled();
  });

  it("업스트림 에러는 502를 돌려준다", async () => {
    // YouTube 실패는 폴백 대상이 아니다. 채널 데이터가 없으면 규칙 기반으로도 만들 게 없다.
    fetchRecentVideosMock.mockRejectedValue(
      new AppError("UPSTREAM_ERROR", "YouTube 응답을 읽지 못했습니다."),
    );

    const res = await POST(post({ handle: "@jachwi" }));
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body.code).toBe("UPSTREAM_ERROR");
    expect(body.error).toBe(
      "분석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
    );
  });

  it("generateIdeas만 실패하면 200에 규칙 기반 기획안으로 돌려준다", async () => {
    generateIdeasMock.mockRejectedValue(new Error("Claude 500"));

    const res = await POST(post({ handle: "@jachwi" }));
    const body = await res.json();

    // 여기까지 오면 YouTube 할당량을 이미 썼다. 나머지 결과는 살린다.
    expect(res.status).toBe(200);
    expect(body.ideas.length).toBeGreaterThan(0);
    expect(body.channel).toEqual(channel);
    expect(body.viral).toHaveLength(2);
  });

  it("알 수 없는 예외는 500으로 바꾸고 원본 메시지를 노출하지 않는다", async () => {
    fetchChannelMock.mockRejectedValue(
      new Error("key=SECRET_API_KEY 가 섞인 내부 메시지"),
    );

    const res = await POST(post({ handle: "@jachwi" }));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body).toEqual({
      error: "분석 중 오류가 발생했습니다.",
      code: "UPSTREAM_ERROR",
    });
    expect(JSON.stringify(body)).not.toContain("SECRET_API_KEY");
  });

  describe("LLM 폴백", () => {
    it("isLlmEnabled()가 false면 Claude를 한 번도 호출하지 않는다", async () => {
      isLlmEnabledMock.mockReturnValue(false);
      fetchRecentVideosMock.mockResolvedValue(ruleVideos);

      const res = await POST(post({ handle: "@jachwi" }));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(extractProfileMock).not.toHaveBeenCalled();
      expect(generateIdeasMock).not.toHaveBeenCalled();
      expect(body.mode).toEqual({ profile: "rule", ideas: "rule" });
      expect(body.profile.searchKeywords.length).toBeGreaterThan(0);
      expect(body.ideas.length).toBeGreaterThan(0);
    });

    it("extractProfile이 실패하면 200에 규칙 프로필을 돌려준다", async () => {
      extractProfileMock.mockRejectedValue(
        new AppError("UPSTREAM_ERROR", "콘텐츠 분석에 실패했습니다."),
      );
      fetchRecentVideosMock.mockResolvedValue(ruleVideos);

      const res = await POST(post({ handle: "@jachwi" }));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.mode.profile).toBe("rule");
      expect(body.profile.niche).not.toBe(core.niche);
      // 통계는 프로필이 LLM이든 규칙이든 똑같이 붙는다.
      expect(body.profile.avgViews).toBe(35_000);
    });

    it("Claude가 한 번 실패하면 같은 요청의 남은 호출을 건너뛴다", async () => {
      extractProfileMock.mockRejectedValue(new Error("크레딧이 소진되었습니다"));
      fetchRecentVideosMock.mockResolvedValue(ruleVideos);

      const res = await POST(post({ handle: "@jachwi" }));
      const body = await res.json();

      expect(generateIdeasMock).not.toHaveBeenCalled();
      expect(body.mode).toEqual({ profile: "rule", ideas: "rule" });
      // 원본 실패 메시지는 서버 로그에만 남는다.
      expect(JSON.stringify(body)).not.toContain("크레딧이 소진");
    });

    it("extractProfile 폴백 후에도 규칙 기반 키워드로 바이럴 검색이 이어진다", async () => {
      extractProfileMock.mockRejectedValue(new Error("Claude 401"));
      fetchRecentVideosMock.mockResolvedValue(ruleVideos);

      const res = await POST(post({ handle: "@jachwi" }));
      const body = await res.json();

      const ruleKeywords = buildRuleProfile(channel, ruleVideos).searchKeywords;
      expect(ruleKeywords.length).toBeGreaterThan(0);
      expect(searchViralCandidatesMock).toHaveBeenCalledWith(ruleKeywords);
      expect(body.profile.searchKeywords).toEqual(ruleKeywords);
      expect(body.viral).toHaveLength(2);
    });

    it("generateIdeas만 실패하면 mode가 llm·rule이고 기획안이 채워진다", async () => {
      generateIdeasMock.mockRejectedValue(new Error("Claude 529"));

      const res = await POST(post({ handle: "@jachwi" }));
      const body = await res.json();

      expect(body.mode).toEqual({ profile: "llm", ideas: "rule" });
      expect(body.ideas.length).toBeGreaterThan(0);

      const viralIds = body.viral.map((v: { id: string }) => v.id);
      for (const idea of body.ideas as ContentIdea[]) {
        expect(viralIds).toContain(idea.referenceVideoId);
      }
    });

    it("viral이 비면 generateIdeas를 호출하지 않고 ideas가 빈 배열이다", async () => {
      searchViralCandidatesMock.mockResolvedValue([]);

      const res = await POST(post({ handle: "@jachwi" }));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(generateIdeasMock).not.toHaveBeenCalled();
      expect(body.viral).toEqual([]);
      expect(body.ideas).toEqual([]);
      expect(body.mode).toEqual({ profile: "llm", ideas: "rule" });
    });

    it("후보가 전부 필터에 걸려도 generateIdeas를 호출하지 않는다", async () => {
      // rankViral의 최소 조회수 기준(10,000)에 못 미치는 후보들.
      searchViralCandidatesMock.mockResolvedValue([
        candidate("small1", { viewCount: 500 }),
        candidate("small2", { viewCount: 900 }),
      ]);

      const res = await POST(post({ handle: "@jachwi" }));
      const body = await res.json();

      expect(generateIdeasMock).not.toHaveBeenCalled();
      expect(body.viral).toEqual([]);
      expect(body.ideas).toEqual([]);
      expect(body.mode.ideas).toBe("rule");
    });
  });
});
