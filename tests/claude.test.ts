import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";
import { extractProfile, generateIdeas } from "@/services/claude";
import type {
  ChannelProfile,
  ChannelSummary,
  VideoStat,
  ViralVideo,
} from "@/types";

const { parseMock } = vi.hoisted(() => ({ parseMock: vi.fn() }));

// SDK 전체를 대체한다. 테스트에서 실제 네트워크 호출이 일어나면 안 된다. (CLAUDE.md CRITICAL)
vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = { parse: parseMock };
  },
}));

const channel: ChannelSummary = {
  id: "UCme",
  title: "자취요리연구소",
  subscriberCount: 12_000,
  thumbnailUrl: "https://i.ytimg.com/ch/hq.jpg",
  uploadsPlaylistId: "UUme",
};

const videos: VideoStat[] = [
  {
    id: "v1",
    title: "3천원 자취 김치볶음밥",
    publishedAt: "2026-09-10T00:00:00Z",
    viewCount: 48_000,
    durationSec: 312,
  },
  {
    id: "v2",
    title: "에어프라이어 하나로 끝내는 저녁",
    publishedAt: "2026-09-03T00:00:00Z",
    viewCount: 21_000,
    durationSec: 405,
  },
];

const profile: ChannelProfile = {
  niche: "1인가구 자취요리 · 저예산 간편식",
  audience: "요리 안 해본 20~30대 자취생",
  formats: ["5분 내외", "조리과정 풀샷"],
  searchKeywords: ["자취요리", "간단 저녁", "에어프라이어 요리"],
  avgViews: 34_500,
  medianViews: 34_500,
  uploadIntervalDays: 7,
  avgDurationSec: 358,
  topPerformers: ["3천원 자취 김치볶음밥"],
};

function viralVideo(id: string, multiple: number): ViralVideo {
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
    multiple,
    viewsPerDay: 50_000,
    isShort: false,
  };
}

const viral: ViralVideo[] = [
  viralVideo("hit1", 100),
  viralVideo("hit2", 40),
  viralVideo("hit3", 12),
];

function idea(referenceVideoId: string, title = "제목") {
  return {
    title,
    hook: "이거 하나면 저녁 끝납니다.",
    outline: ["재료 소개", "조리", "완성 컷"],
    whyNow: "같은 주제 영상이 구독자 100배로 터졌다.",
    referenceVideoId,
    estimatedMinutes: [4, 6] as [number, number],
  };
}

function parsed(output: unknown) {
  return { parsed_output: output };
}

function lastCallParams() {
  return parseMock.mock.calls.at(-1)?.[0];
}

function lastUserPrompt(): string {
  return String(lastCallParams().messages[0].content);
}

// SDK mock이 뚫리면 여기서 걸린다. 테스트는 절대 네트워크를 타지 않는다.
const fetchGuard = vi.fn(() => {
  throw new Error("테스트에서 네트워크 호출이 발생했다");
});

describe("services/claude", () => {
  beforeEach(() => {
    parseMock.mockReset();
    fetchGuard.mockClear();
    vi.stubGlobal("fetch", fetchGuard);
  });

  afterEach(() => {
    expect(fetchGuard).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  describe("extractProfile", () => {
    it("검색 키워드가 4개 오면 3개로 자른다", async () => {
      parseMock.mockResolvedValueOnce(
        parsed({
          niche: "자취요리",
          audience: "자취생",
          formats: ["5분 내외"],
          // 4개를 그대로 쓰면 search.list가 1회 더 돌아 100 units를 더 쓴다.
          searchKeywords: ["자취요리", "간단 저녁", "에어프라이어", "혼밥"],
        }),
      );

      const result = await extractProfile(channel, videos);

      expect(result.searchKeywords).toEqual([
        "자취요리",
        "간단 저녁",
        "에어프라이어",
      ]);
      expect(result.niche).toBe("자취요리");
      expect(result.audience).toBe("자취생");
      expect(result.formats).toEqual(["5분 내외"]);
    });

    it("claude-opus-5를 effort low로 호출한다", async () => {
      parseMock.mockResolvedValueOnce(
        parsed({
          niche: "n",
          audience: "a",
          formats: ["f"],
          searchKeywords: ["k1", "k2", "k3"],
        }),
      );

      await extractProfile(channel, videos);

      const params = lastCallParams();
      expect(params.model).toBe("claude-opus-5");
      expect(params.output_config.effort).toBe("low");
      expect(params.output_config.format).toBeDefined();
      // 이 모델에서 budget_tokens는 400이고, thinking은 생략하면 adaptive다.
      expect(params.thinking).toBeUndefined();
    });

    it("프롬프트에 채널명·구독자 수와 영상별 제목·조회수·길이를 넣는다", async () => {
      parseMock.mockResolvedValueOnce(
        parsed({
          niche: "n",
          audience: "a",
          formats: ["f"],
          searchKeywords: ["k1", "k2", "k3"],
        }),
      );

      await extractProfile(channel, videos);

      const prompt = lastUserPrompt();
      expect(prompt).toContain("자취요리연구소");
      expect(prompt).toContain("12000");
      expect(prompt).toContain("3천원 자취 김치볶음밥");
      expect(prompt).toContain("48000");
      expect(prompt).toContain("312");
    });

    it("parsed_output이 null이면 UPSTREAM_ERROR로 바꾼다", async () => {
      parseMock.mockResolvedValue({ parsed_output: null });

      await expect(extractProfile(channel, videos)).rejects.toBeInstanceOf(
        AppError,
      );
      await expect(extractProfile(channel, videos)).rejects.toMatchObject({
        code: "UPSTREAM_ERROR",
      });
    });
  });

  describe("generateIdeas", () => {
    it("입력에 없는 referenceVideoId는 viral[0].id로 교체한다", async () => {
      parseMock.mockResolvedValueOnce(
        parsed({ ideas: [idea("존재하지않는id"), idea("hit3")] }),
      );

      const ideas = await generateIdeas(profile, viral);

      // UI에서 참고 영상 링크가 깨지지 않도록 반드시 입력 목록 안의 id여야 한다.
      expect(ideas[0].referenceVideoId).toBe("hit1");
      expect(ideas[1].referenceVideoId).toBe("hit3");
      expect(ideas[0].estimatedMinutes).toEqual([4, 6]);
      expect(ideas[0].outline).toEqual(["재료 소개", "조리", "완성 컷"]);
    });

    it("기획안이 6개 와도 5개만 반환한다", async () => {
      parseMock.mockResolvedValueOnce(
        parsed({
          ideas: Array.from({ length: 6 }, (_, i) => idea("hit1", `기획안 ${i}`)),
        }),
      );

      const ideas = await generateIdeas(profile, viral);

      expect(ideas).toHaveLength(5);
      expect(ideas.map((i) => i.title)).toEqual([
        "기획안 0",
        "기획안 1",
        "기획안 2",
        "기획안 3",
        "기획안 4",
      ]);
    });

    it("claude-opus-5를 effort medium으로 호출한다", async () => {
      parseMock.mockResolvedValueOnce(parsed({ ideas: [idea("hit1")] }));

      await generateIdeas(profile, viral);

      const params = lastCallParams();
      expect(params.model).toBe("claude-opus-5");
      expect(params.output_config.effort).toBe("medium");
      expect(params.output_config.format).toBeDefined();
      expect(params.thinking).toBeUndefined();
    });

    it("프롬프트에 프로필과 바이럴 영상의 id·제목·배율·구독자 수를 넣는다", async () => {
      parseMock.mockResolvedValueOnce(parsed({ ideas: [idea("hit1")] }));

      await generateIdeas(profile, viral);

      const prompt = lastUserPrompt();
      expect(prompt).toContain("1인가구 자취요리 · 저예산 간편식");
      expect(prompt).toContain("요리 안 해본 20~30대 자취생");
      expect(prompt).toContain("hit1");
      expect(prompt).toContain("바이럴 영상 hit1");
      expect(prompt).toContain("100배");
      expect(prompt).toContain("3000");
    });

    it("바이럴 영상은 8개까지만 프롬프트에 넣는다", async () => {
      parseMock.mockResolvedValueOnce(parsed({ ideas: [idea("v0")] }));
      const many = Array.from({ length: 12 }, (_, i) => viralVideo(`v${i}`, 10));

      await generateIdeas(profile, many);

      const prompt = lastUserPrompt();
      expect(prompt).toContain("바이럴 영상 v7");
      expect(prompt).not.toContain("바이럴 영상 v8");
    });

    it("parsed_output이 null이면 UPSTREAM_ERROR로 바꾼다", async () => {
      parseMock.mockResolvedValue({ parsed_output: null });

      await expect(generateIdeas(profile, viral)).rejects.toMatchObject({
        code: "UPSTREAM_ERROR",
      });
    });
  });

  describe("에러 처리", () => {
    it("SDK 예외를 AppError로 감싸고 원본 메시지를 노출하지 않는다", async () => {
      parseMock.mockRejectedValue(
        new Error("401 invalid x-api-key: sk-ant-secret"),
      );

      const runs = [
        () => extractProfile(channel, videos),
        () => generateIdeas(profile, viral),
      ];

      for (const run of runs) {
        const error = await run().catch((e: unknown) => e as AppError);

        expect(error).toBeInstanceOf(AppError);
        expect(error.code).toBe("UPSTREAM_ERROR");
        expect(error.message).toBe("콘텐츠 분석에 실패했습니다.");
        expect(error.message).not.toContain("sk-ant-secret");
      }
    });

    it("AppError는 그대로 통과시킨다", async () => {
      parseMock.mockRejectedValue(new AppError("QUOTA_EXCEEDED", "한도 초과"));

      await expect(extractProfile(channel, videos)).rejects.toMatchObject({
        code: "QUOTA_EXCEEDED",
      });
    });
  });
});
