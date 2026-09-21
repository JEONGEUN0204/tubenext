import { describe, expect, it } from "vitest";
import { parseDurationSec, summarizeUploads } from "@/lib/stats";
import type { VideoStat } from "@/types";

function video(overrides: Partial<VideoStat> = {}): VideoStat {
  return {
    id: "v1",
    title: "제목",
    publishedAt: "2026-01-01T00:00:00Z",
    viewCount: 1000,
    durationSec: 600,
    ...overrides,
  };
}

describe("parseDurationSec", () => {
  const cases: Array<[string, number]> = [
    ["PT6M12S", 372],
    ["PT1H2M3S", 3723],
    ["PT45S", 45],
    ["PT1H", 3600],
    ["PT10M", 600],
    ["P1DT2H", 93600],
    ["PT", 0],
    ["", 0],
    ["6분 12초", 0],
    ["1H2M", 0],
  ];

  for (const [input, expected] of cases) {
    it(`${JSON.stringify(input)} → ${expected}`, () => {
      expect(parseDurationSec(input)).toBe(expected);
    });
  }
});

describe("summarizeUploads", () => {
  it("빈 배열이면 모든 수치가 0이고 topPerformers가 비어 있다", () => {
    expect(summarizeUploads([])).toEqual({
      avgViews: 0,
      medianViews: 0,
      uploadIntervalDays: 0,
      avgDurationSec: 0,
      topPerformers: [],
    });
  });

  it("개수가 홀수면 중앙값은 가운데 값이다", () => {
    const stats = summarizeUploads([
      video({ id: "a", title: "A", viewCount: 100, durationSec: 100, publishedAt: "2026-01-01T00:00:00Z" }),
      video({ id: "b", title: "B", viewCount: 300, durationSec: 200, publishedAt: "2026-01-11T00:00:00Z" }),
      video({ id: "c", title: "C", viewCount: 200, durationSec: 300, publishedAt: "2026-01-21T00:00:00Z" }),
    ]);

    expect(stats.avgViews).toBe(200);
    expect(stats.medianViews).toBe(200);
    expect(stats.avgDurationSec).toBe(200);
    expect(stats.uploadIntervalDays).toBe(10);
    expect(stats.topPerformers).toEqual(["B", "C", "A"]);
  });

  it("개수가 짝수면 중앙값은 가운데 두 값의 평균이고, 평균은 정수로 반올림된다", () => {
    const stats = summarizeUploads([
      video({ id: "a", title: "A", viewCount: 30 }),
      video({ id: "b", title: "B", viewCount: 10 }),
      video({ id: "c", title: "C", viewCount: 41 }),
      video({ id: "d", title: "D", viewCount: 20 }),
    ]);

    expect(stats.medianViews).toBe(25);
    expect(stats.avgViews).toBe(25);
  });

  it("업로드 간격은 (최신 - 최초) / (개수 - 1)을 소수 1자리로 반올림한다", () => {
    const stats = summarizeUploads([
      video({ id: "a", publishedAt: "2026-01-01T00:00:00Z" }),
      video({ id: "b", publishedAt: "2026-01-04T00:00:00Z" }),
      video({ id: "c", publishedAt: "2026-01-07T00:00:00Z" }),
      video({ id: "d", publishedAt: "2026-01-11T00:00:00Z" }),
    ]);

    expect(stats.uploadIntervalDays).toBe(3.3);
  });

  it("업로드 간격은 반나절 차이도 소수로 표현한다", () => {
    const stats = summarizeUploads([
      video({ id: "a", publishedAt: "2026-01-01T00:00:00Z" }),
      video({ id: "b", publishedAt: "2026-01-08T12:00:00Z" }),
    ]);

    expect(stats.uploadIntervalDays).toBe(7.5);
  });

  it("영상이 1개면 업로드 간격은 0이다", () => {
    const stats = summarizeUploads([
      video({ id: "a", title: "A", viewCount: 777, durationSec: 333 }),
    ]);

    expect(stats).toEqual({
      avgViews: 777,
      medianViews: 777,
      uploadIntervalDays: 0,
      avgDurationSec: 333,
      topPerformers: ["A"],
    });
  });

  it("영상이 3개 미만이면 topPerformers도 있는 만큼만 반환한다", () => {
    const stats = summarizeUploads([
      video({ id: "a", title: "A", viewCount: 10 }),
      video({ id: "b", title: "B", viewCount: 20 }),
    ]);

    expect(stats.topPerformers).toEqual(["B", "A"]);
  });

  it("평균 길이를 정수로 반올림한다", () => {
    const stats = summarizeUploads([
      video({ id: "a", durationSec: 100 }),
      video({ id: "b", durationSec: 101 }),
      video({ id: "c", durationSec: 102 }),
      video({ id: "d", durationSec: 105 }),
    ]);

    expect(stats.avgDurationSec).toBe(102);
  });

  it("입력 배열을 변형하지 않는다", () => {
    const videos = [
      video({ id: "a", title: "A", viewCount: 10 }),
      video({ id: "b", title: "B", viewCount: 30 }),
      video({ id: "c", title: "C", viewCount: 20 }),
    ];

    summarizeUploads(videos);

    expect(videos.map((v) => v.id)).toEqual(["a", "b", "c"]);
  });
});
