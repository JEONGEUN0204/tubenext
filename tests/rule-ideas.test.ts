import { describe, expect, it } from "vitest";
import { buildRuleIdeas } from "@/lib/rule-ideas";
import type { ChannelProfile, ViralVideo } from "@/types";

function profile(overrides: Partial<ChannelProfile> = {}): ChannelProfile {
  return {
    niche: "자취 요리 중심 콘텐츠",
    audience: "'자취 요리' 관련 영상을 찾아보는 시청자",
    formats: ["10분대 미드폼"],
    searchKeywords: ["자취 요리", "김치찌개", "혼밥"],
    avgViews: 12_000,
    medianViews: 9_000,
    uploadIntervalDays: 4,
    avgDurationSec: 600,
    topPerformers: ["김치찌개 끓이기", "혼밥 라면", "계란말이 도전"],
    ...overrides,
  };
}

function viral(
  id: string,
  title: string,
  overrides: Partial<ViralVideo> = {},
): ViralVideo {
  return {
    id,
    title,
    channelId: `UC_${id}`,
    channelTitle: "다른 채널",
    subscriberCount: 3_000,
    viewCount: 300_000,
    publishedAt: "2026-09-01T00:00:00Z",
    thumbnailUrl: `https://i.ytimg.com/vi/${id}/hq.jpg`,
    durationSec: 420,
    multiple: 100,
    viewsPerDay: 15_000,
    isShort: false,
    ...overrides,
  };
}

/** 첫 키워드가 전부 다른 영상 5개. 템플릿 5종이 서로 다른 소재를 받는다. */
const FIVE_VIRAL: ViralVideo[] = [
  viral("v0", "탕후루 만들기 대유행"),
  viral("v1", "마라탕 먹방 신기록"),
  viral("v2", "두바이 초콜릿 직접 만들기"),
  viral("v3", "요아정 조합 추천"),
  viral("v4", "밀크티 레시피 공개"),
];

describe("buildRuleIdeas - 개수와 근거", () => {
  it("viral이 비면 빈 배열을 반환한다", () => {
    expect(buildRuleIdeas(profile(), [])).toEqual([]);
  });

  it("바이럴이 7개여도 기획안은 5개다", () => {
    const seven = [
      ...FIVE_VIRAL,
      viral("v5", "약과 쿠키 만들기"),
      viral("v6", "크로플 레시피 정리"),
    ];

    expect(buildRuleIdeas(profile(), seven)).toHaveLength(5);
  });

  it("바이럴이 2개면 기획안 2개이고 referenceVideoId가 그 영상의 id다", () => {
    const ideas = buildRuleIdeas(profile(), FIVE_VIRAL.slice(0, 2));

    expect(ideas).toHaveLength(2);
    expect(ideas.map((idea) => idea.referenceVideoId)).toEqual(["v0", "v1"]);
  });

  it("배율 내림차순으로 들어온 순서를 그대로 유지한다", () => {
    const ideas = buildRuleIdeas(profile(), FIVE_VIRAL);

    expect(ideas.map((idea) => idea.referenceVideoId)).toEqual([
      "v0",
      "v1",
      "v2",
      "v3",
      "v4",
    ]);
  });

  it("같은 입력으로 두 번 호출하면 같은 결과가 나온다", () => {
    const first = buildRuleIdeas(profile(), FIVE_VIRAL);
    const second = buildRuleIdeas(profile(), FIVE_VIRAL);

    expect(first).toEqual(second);
  });
});

describe("buildRuleIdeas - 템플릿", () => {
  it("인덱스마다 고정된 템플릿 문장을 쓴다", () => {
    const ideas = buildRuleIdeas(profile(), FIVE_VIRAL);

    expect(ideas[0].title).toBe("요즘 터지는 '탕후루', 자취 요리 채널이 해보면");
    expect(ideas[1].title).toBe("자취 요리 하는 사람이 마라탕 따라 해봤습니다");
    expect(ideas[2].title).toBe("두바이 진짜 되는지 자취 요리 기준으로 검증");
    expect(ideas[3].title).toBe("자취 요리 입문자를 위한 요아정 정리");
    expect(ideas[4].title).toBe("밀크티 vs 자취 요리, 뭐가 더 나을까");
  });

  it("훅도 인덱스마다 고정된 템플릿 문장을 쓴다", () => {
    const ideas = buildRuleIdeas(profile(), FIVE_VIRAL);

    expect(ideas[0].hook).toBe(
      "탕후루 영상이 지금 왜 이렇게 도는지 직접 확인해봤습니다.",
    );
    expect(ideas[1].hook).toBe(
      "마라탕 영상 보고 바로 따라 했습니다. 결과부터 보여드릴게요.",
    );
    expect(ideas[2].hook).toBe("두바이 이거 실제로 되는지 오늘 끝까지 해봅니다.");
    expect(ideas[3].hook).toBe("요아정 처음 보는 분들만 보세요. 3분이면 됩니다.");
    expect(ideas[4].hook).toBe(
      "밀크티 그리고 자취 요리. 둘 다 해보고 결론 냈습니다.",
    );
  });

  it("5개 기획안의 제목이 서로 다르다", () => {
    const titles = buildRuleIdeas(profile(), FIVE_VIRAL).map((i) => i.title);

    expect(new Set(titles).size).toBe(5);
  });

  it("title·hook에 미치환 자리표시자가 남지 않는다", () => {
    const ideas = buildRuleIdeas(profile(), FIVE_VIRAL);

    for (const idea of ideas) {
      expect(idea.title).not.toMatch(/\{[vm]\}/);
      expect(idea.hook).not.toMatch(/\{[vm]\}/);
      expect(idea.outline.join(" ")).not.toMatch(/\{[vm]\}/);
    }
  });

  it("바이럴 영상 제목을 그대로 복사하지 않는다", () => {
    const ideas = buildRuleIdeas(profile(), FIVE_VIRAL);

    ideas.forEach((idea, i) => {
      expect(idea.title).not.toBe(FIVE_VIRAL[i].title);
    });
  });
});

describe("buildRuleIdeas - 소재 단어", () => {
  it("같은 소재 단어를 두 기획안에서 쓰지 않는다", () => {
    const sameLead = [
      viral("a", "탕후루 만들기 대유행"),
      viral("b", "탕후루 레시피 공개"),
    ];

    const ideas = buildRuleIdeas(profile(), sameLead);

    expect(ideas[0].title).toContain("탕후루");
    expect(ideas[1].title).toContain("레시피");
    expect(ideas[1].title).not.toContain("탕후루");
  });

  it("후보가 모두 소진되면 그 영상 제목의 앞 20자를 쓴다", () => {
    const title = "탕후루 만들기 대유행";
    const repeated = [
      viral("a", title),
      viral("b", title),
      viral("c", title),
      viral("d", title),
    ];

    const ideas = buildRuleIdeas(profile(), repeated);

    expect(ideas[3].title).toContain(title.slice(0, 20));
  });

  it("뽑을 후보가 0개인 제목이면 제목 앞 20자를 쓴다", () => {
    const ideas = buildRuleIdeas(profile(), [viral("a", "오늘 영상 공개")]);

    expect(ideas[0].title).toContain("오늘 영상 공개");
  });

  it("후보가 없고 제목이 길면 앞 20자까지만 소재로 쓴다", () => {
    // 전부 STOPWORDS라 뽑을 후보가 하나도 없는 긴 제목.
    const longTitle = "오늘 영상 진짜 정말 완전 그냥 대박 레전드 역대급 실화 근황";
    const ideas = buildRuleIdeas(profile(), [viral("a", longTitle)]);

    expect(ideas[0].title).toContain(longTitle.slice(0, 20));
    expect(ideas[0].title).not.toContain(longTitle);
    expect(ideas[0].title).not.toContain("레전드");
  });

  it("searchKeywords가 비어도 예외 없이 5개가 나오고 기본 문구를 쓴다", () => {
    const ideas = buildRuleIdeas(
      profile({ searchKeywords: [] }),
      FIVE_VIRAL,
    );

    expect(ideas).toHaveLength(5);
    for (const idea of ideas) {
      expect(idea.title).toContain("우리 채널 주제");
    }
  });
});

describe("buildRuleIdeas - outline", () => {
  it("모든 기획안의 outline이 4단계다", () => {
    const ideas = buildRuleIdeas(profile(), FIVE_VIRAL);

    for (const idea of ideas) {
      expect(idea.outline).toHaveLength(4);
    }
  });

  it("outline에 소재 단어와 내 채널 키워드가 들어간다", () => {
    const [idea] = buildRuleIdeas(profile(), FIVE_VIRAL);

    expect(idea.outline[0]).toContain("탕후루");
    expect(idea.outline[1]).toContain("자취 요리");
    expect(idea.outline[3]).toBe("마무리: 다음 영상 예고");
  });
});

describe("buildRuleIdeas - whyNow", () => {
  it("입력 수치를 콤마 포함 숫자로 그대로 쓴다", () => {
    const [idea] = buildRuleIdeas(profile(), [FIVE_VIRAL[0]]);

    expect(idea.whyNow).toBe(
      "참고 영상 '탕후루 만들기 대유행' — 구독자 3,000명 채널에서 조회수 300,000회, 구독자 대비 100배, 하루 평균 15,000회.",
    );
  });

  it("배율 소수점은 그대로 두고 정수부에만 콤마를 넣는다", () => {
    const [idea] = buildRuleIdeas(profile(), [
      viral("a", "탕후루 만들기 대유행", {
        subscriberCount: 1_234_567,
        viewCount: 12_345,
        multiple: 1234.5,
        viewsPerDay: 987,
      }),
    ]);

    expect(idea.whyNow).toContain("구독자 1,234,567명");
    expect(idea.whyNow).toContain("조회수 12,345회");
    expect(idea.whyNow).toContain("1,234.5배");
    expect(idea.whyNow).toContain("하루 평균 987회");
  });

  it("제목이 40자를 넘으면 잘라내고 말줄임표를 붙인다", () => {
    const longTitle = "가".repeat(45);
    const [idea] = buildRuleIdeas(profile(), [viral("a", longTitle)]);

    expect(idea.whyNow).toContain("…");
    expect(idea.whyNow).toContain("가".repeat(40));
    expect(idea.whyNow).not.toContain("가".repeat(41));
  });

  it("제목이 40자 이하면 말줄임표를 붙이지 않는다", () => {
    const [idea] = buildRuleIdeas(profile(), [FIVE_VIRAL[0]]);

    expect(idea.whyNow).not.toContain("…");
  });
});

describe("buildRuleIdeas - estimatedMinutes", () => {
  it("평균 길이가 60초 미만이면 [1, 2]다", () => {
    const [idea] = buildRuleIdeas(profile({ avgDurationSec: 30 }), [
      FIVE_VIRAL[0],
    ]);

    expect(idea.estimatedMinutes).toEqual([1, 2]);
  });

  it("평균 길이 600초면 앞뒤 20% 구간을 분 단위로 준다", () => {
    const [idea] = buildRuleIdeas(profile({ avgDurationSec: 600 }), [
      FIVE_VIRAL[0],
    ]);
    const [lo, hi] = idea.estimatedMinutes;

    expect(lo).toBeGreaterThanOrEqual(1);
    expect(hi).toBeGreaterThan(lo);
    expect(idea.estimatedMinutes).toEqual([8, 12]);
  });

  it("짧은 미드폼에서도 최소·최대가 같아지지 않는다", () => {
    const [idea] = buildRuleIdeas(profile({ avgDurationSec: 70 }), [
      FIVE_VIRAL[0],
    ]);
    const [lo, hi] = idea.estimatedMinutes;

    expect(lo).toBeGreaterThanOrEqual(1);
    expect(hi).toBeGreaterThan(lo);
  });
});
