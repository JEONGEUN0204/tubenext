import { describe, expect, it } from "vitest";
import { buildRuleProfile } from "@/lib/rule-profile";
import type { ChannelSummary, VideoStat } from "@/types";

function channel(overrides: Partial<ChannelSummary> = {}): ChannelSummary {
  return {
    id: "UC_channel",
    title: "김프로 자취요리",
    subscriberCount: 12_000,
    thumbnailUrl: "https://i.ytimg.com/ch.jpg",
    uploadsPlaylistId: "UU_channel",
    ...overrides,
  };
}

function video(title: string, overrides: Partial<VideoStat> = {}): VideoStat {
  return {
    id: "v1",
    title,
    publishedAt: "2026-01-01T00:00:00Z",
    viewCount: 1000,
    durationSec: 600,
    ...overrides,
  };
}

const PLAIN_TITLES = [
  "자취 요리 브이로그 하나",
  "자취 요리 브이로그 둘",
  "자취 요리 브이로그 셋",
  "자취 요리 브이로그 넷",
  "자취 요리 브이로그 다섯",
  "자취 요리 브이로그 여섯",
];

/** 길이만 다른 영상들. 제목 패턴 조건은 하나도 걸리지 않게 둔다. */
function videosOfDuration(durations: number[]): VideoStat[] {
  return durations.map((durationSec, i) =>
    video(PLAIN_TITLES[i], { durationSec }),
  );
}

const cookingVideos: VideoStat[] = [
  "김프로 자취 김치찌개 끓이기",
  "김프로 자취 김치찌개 다시 끓이기",
  "김프로 자취 김치찌개 남은 재료로",
  "김프로 자취 된장찌개 끓이기",
  "김프로 자취 된장찌개 맛있게",
  "김프로 혼밥 라면 끓이기",
  "김프로 혼밥 라면 계란 넣기",
  "김프로 자취 계란말이 도전",
  "김프로 자취 김치볶음밥 만들기",
  "김프로 혼밥 김밥 싸기",
  "김프로 자취 미역국 끓이기",
  "김프로 자취 제육볶음 만들기",
].map((title) => video(title));

describe("buildRuleProfile - searchKeywords", () => {
  it("반복 소재가 있는 제목에서 키워드 3개를 뽑는다", () => {
    const profile = buildRuleProfile(channel(), cookingVideos);

    expect(profile.searchKeywords).toHaveLength(3);
    expect(profile.searchKeywords.some((k) => k.includes("김치찌개"))).toBe(
      true,
    );
  });

  it("채널명 토큰은 키워드에 들어가지 않는다", () => {
    const profile = buildRuleProfile(channel(), cookingVideos);

    for (const keyword of profile.searchKeywords) {
      expect(keyword).not.toContain("김프로");
      expect(keyword).not.toContain("자취요리");
    }
  });

  it("후보가 모자라면 3개를 채우지 않는다", () => {
    const profile = buildRuleProfile(channel(), [video("라면")]);

    expect(profile.searchKeywords).toEqual(["라면"]);
  });

  it("키워드가 0개여도 채널명이나 고정 문자열로 채우지 않는다", () => {
    const profile = buildRuleProfile(channel(), [
      video("!!! ---"),
      video("???"),
    ]);

    expect(profile.searchKeywords).toEqual([]);
  });
});

describe("buildRuleProfile - formats (길이)", () => {
  it("60초 미만 영상이 과반이면 쇼츠 라벨을 쓴다", () => {
    const profile = buildRuleProfile(
      channel(),
      videosOfDuration([30, 30, 45, 1200, 1500]),
    );

    expect(profile.formats).toContain("쇼츠 중심 (60초 이하)");
    expect(profile.formats).not.toContain("20분대 롱폼");
  });

  it("쇼츠가 과반에 못 미치면 길이 라벨을 쓴다", () => {
    const profile = buildRuleProfile(
      channel(),
      videosOfDuration([30, 30, 600, 700, 800]),
    );

    expect(profile.formats).not.toContain("쇼츠 중심 (60초 이하)");
    expect(profile.formats).toContain("10분대 미드폼");
  });

  const durationCases: Array<[number[], string]> = [
    [[100, 200, 250], "5분 내외 숏폼"],
    [[299, 299, 299], "5분 내외 숏폼"],
    [[300, 300, 300], "10분대 미드폼"],
    [[400, 600, 900], "10분대 미드폼"],
    [[899, 899, 899], "10분대 미드폼"],
    [[900, 900, 900], "20분대 롱폼"],
    [[1799, 1799, 1799], "20분대 롱폼"],
    [[1800, 1800, 1800], "30분 이상 롱폼"],
    [[3600, 4000, 5000], "30분 이상 롱폼"],
  ];

  for (const [durations, label] of durationCases) {
    it(`중앙 길이 ${durations[1]}초 → ${label}`, () => {
      const profile = buildRuleProfile(channel(), videosOfDuration(durations));

      expect(profile.formats).toContain(label);
    });
  }

  it("길이는 평균이 아니라 중앙값으로 고른다", () => {
    // 평균은 5000초를 넘지만 대부분의 영상은 10분대다.
    const profile = buildRuleProfile(
      channel(),
      videosOfDuration([600, 650, 700, 20_000]),
    );

    expect(profile.formats).toContain("10분대 미드폼");
  });
});

describe("buildRuleProfile - formats (제목 패턴)", () => {
  it("숫자가 든 제목이 30% 이상이면 숫자 강조 라벨이 붙는다", () => {
    const profile = buildRuleProfile(channel(), [
      video("3000원 자취 요리"),
      video("5000원 한 끼"),
      video("김치찌개 끓이기"),
    ]);

    expect(profile.formats).toContain("숫자 강조 제목 (가격·개수)");
  });

  it("숫자가 든 제목이 30% 미만이면 붙지 않는다", () => {
    const profile = buildRuleProfile(channel(), [
      video("3000원 자취 요리"),
      video("김치찌개 끓이기"),
      video("된장찌개 끓이기"),
      video("라면 끓이기"),
    ]);

    expect(profile.formats).not.toContain("숫자 강조 제목 (가격·개수)");
  });

  it("대괄호로 시작하는 제목이 30% 이상이면 시리즈 라벨이 붙는다", () => {
    const profile = buildRuleProfile(channel(), [
      video("[자취일기] 김치찌개"),
      video("[자취일기] 된장찌개"),
      video("라면 끓이기"),
    ]);

    expect(profile.formats).toContain("시리즈 연재물");
  });

  it("N화·EP N이 든 제목이 30% 이상이면 시리즈 라벨이 붙는다", () => {
    const profile = buildRuleProfile(channel(), [
      video("자취요리 3화 김치찌개"),
      video("자취요리 EP 4 된장찌개"),
      video("라면 끓이기"),
    ]);

    expect(profile.formats).toContain("시리즈 연재물");
  });

  it("앞에 숫자가 없는 화는 시리즈로 세지 않는다", () => {
    const profile = buildRuleProfile(channel(), [
      video("영화 보면서 먹는 야식"),
      video("영화관 음식 따라하기"),
      video("라면 끓이기"),
    ]);

    expect(profile.formats).not.toContain("시리즈 연재물");
  });

  it("물음표로 끝나는 제목이 30% 이상이면 질문형 라벨이 붙는다", () => {
    const profile = buildRuleProfile(channel(), [
      video("자취 요리 이게 되네?"),
      video("김치찌개 물 얼마나 넣어야 할까?"),
      video("된장찌개 끓이기"),
    ]);

    expect(profile.formats).toContain("질문형 제목");
  });

  it("물음표가 중간에만 있으면 질문형이 아니다", () => {
    const profile = buildRuleProfile(channel(), [
      video("이게 되네? 자취 요리 도전"),
      video("김치찌개 끓이기"),
      video("된장찌개 끓이기"),
    ]);

    expect(profile.formats).not.toContain("질문형 제목");
  });

  it("조건을 전부 만족하면 길이 라벨 뒤에 패턴 라벨이 붙는다", () => {
    const profile = buildRuleProfile(channel(), [
      video("[자취일기] 3화 3000원으로 되나?", { durationSec: 30 }),
      video("[자취일기] 4화 5000원으로 되나?", { durationSec: 40 }),
      video("[자취일기] 5화 7000원으로 되나?", { durationSec: 50 }),
    ]);

    expect(profile.formats).toEqual([
      "쇼츠 중심 (60초 이하)",
      "숫자 강조 제목 (가격·개수)",
      "시리즈 연재물",
      "질문형 제목",
    ]);
  });

  const formatInputs: Array<[string, VideoStat[]]> = [
    ["빈 배열", []],
    ["영상 1개", [video("김치찌개 끓이기")]],
    ["특수문자뿐인 제목", [video("!!! ---"), video("???")]],
    ["모든 조건 충족", [video("[자취] 1화 1000원 되나?", { durationSec: 20 })]],
    ["긴 영상만", videosOfDuration([7200, 7200])],
    ["반복 소재", cookingVideos],
  ];

  for (const [label, videos] of formatInputs) {
    it(`formats는 1개 이상 4개 이하다 — ${label}`, () => {
      const { formats } = buildRuleProfile(channel(), videos);

      expect(formats.length).toBeGreaterThanOrEqual(1);
      expect(formats.length).toBeLessThanOrEqual(4);
    });
  }
});

describe("buildRuleProfile - niche/audience", () => {
  it("키워드에서 만든 템플릿 문장을 쓴다", () => {
    const profile = buildRuleProfile(channel(), cookingVideos);
    const [first, second] = profile.searchKeywords;

    expect(profile.niche).toBe(`${first} · ${second} 중심 콘텐츠`);
    expect(profile.audience).toBe(`'${first}' 관련 영상을 찾아보는 시청자`);
  });

  it("키워드가 1개면 니치 문장에 그 1개만 들어간다", () => {
    const profile = buildRuleProfile(channel(), [video("라면")]);

    expect(profile.niche).toBe("라면 중심 콘텐츠");
    expect(profile.audience).toBe("'라면' 관련 영상을 찾아보는 시청자");
  });

  it("키워드가 0개면 근거 부족 문구를 쓴다", () => {
    const profile = buildRuleProfile(channel(), [
      video("!!! ---"),
      video("???"),
    ]);

    expect(profile.niche).toBe(
      "최근 업로드 제목에서 반복되는 주제를 찾지 못했습니다",
    );
    expect(profile.audience).toBe("추정할 근거가 부족합니다");
  });
});

describe("buildRuleProfile - 빈 입력", () => {
  it("videos가 비면 예외 없이 빈 키워드와 분석 불가 포맷을 반환한다", () => {
    const profile = buildRuleProfile(channel(), []);

    expect(profile).toEqual({
      niche: "최근 업로드 제목에서 반복되는 주제를 찾지 못했습니다",
      audience: "추정할 근거가 부족합니다",
      formats: ["분석할 영상 없음"],
      searchKeywords: [],
    });
  });

  it("채널 제목이 비어 있어도 동작한다", () => {
    const profile = buildRuleProfile(channel({ title: "" }), cookingVideos);

    expect(profile.searchKeywords).toHaveLength(3);
  });
});

describe("buildRuleProfile - 결정성", () => {
  it("같은 입력에 항상 같은 결과를 낸다", () => {
    expect(buildRuleProfile(channel(), cookingVideos)).toEqual(
      buildRuleProfile(channel(), cookingVideos),
    );
  });

  it("입력 배열을 변형하지 않는다", () => {
    const videos = videosOfDuration([900, 100, 500]);
    const before = videos.map((v) => v.durationSec);

    buildRuleProfile(channel(), videos);

    expect(videos.map((v) => v.durationSec)).toEqual(before);
  });
});
