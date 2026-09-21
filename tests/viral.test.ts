import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rankViral } from "@/lib/viral";
import type { ViralCandidate } from "@/types";

const NOW = new Date("2026-03-01T00:00:00Z");
const TEN_DAYS_AGO = "2026-02-19T00:00:00Z";
const MY_CHANNEL_ID = "UCmine";

function candidate(overrides: Partial<ViralCandidate> = {}): ViralCandidate {
  return {
    id: "v1",
    title: "영상",
    channelId: "UCother",
    channelTitle: "다른 채널",
    subscriberCount: 1000,
    viewCount: 50000,
    publishedAt: TEN_DAYS_AGO,
    thumbnailUrl: "https://i.ytimg.com/vi/v1/hqdefault.jpg",
    durationSec: 600,
    ...overrides,
  };
}

describe("rankViral", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("배율·일 평균 조회수·쇼츠 여부를 계산한다", () => {
    const [video] = rankViral([candidate()], MY_CHANNEL_ID);

    expect(video.multiple).toBe(50);
    expect(video.viewsPerDay).toBe(5000);
    expect(video.isShort).toBe(false);
  });

  it("원본 후보의 필드를 그대로 유지한다", () => {
    const [video] = rankViral([candidate()], MY_CHANNEL_ID);

    expect(video.id).toBe("v1");
    expect(video.title).toBe("영상");
    expect(video.channelId).toBe("UCother");
    expect(video.channelTitle).toBe("다른 채널");
    expect(video.subscriberCount).toBe(1000);
    expect(video.viewCount).toBe(50000);
    expect(video.publishedAt).toBe(TEN_DAYS_AGO);
    expect(video.thumbnailUrl).toBe("https://i.ytimg.com/vi/v1/hqdefault.jpg");
    expect(video.durationSec).toBe(600);
  });

  it("배율을 소수 1자리로 반올림한다", () => {
    const [video] = rankViral(
      [candidate({ viewCount: 12345, subscriberCount: 1000 })],
      MY_CHANNEL_ID,
    );

    expect(video.multiple).toBe(12.3);
  });

  it("오늘 올라온 영상은 경과일을 1일로 보고 계산한다", () => {
    const [video] = rankViral(
      [candidate({ viewCount: 40000, publishedAt: NOW.toISOString() })],
      MY_CHANNEL_ID,
    );

    expect(video.viewsPerDay).toBe(40000);
  });

  it("60초 미만이면 쇼츠로 본다", () => {
    const [short] = rankViral([candidate({ durationSec: 59 })], MY_CHANNEL_ID);
    const [long] = rankViral([candidate({ durationSec: 60 })], MY_CHANNEL_ID);

    expect(short.isShort).toBe(true);
    expect(long.isShort).toBe(false);
  });

  it("같은 id는 첫 번째 항목만 남긴다", () => {
    const result = rankViral(
      [
        candidate({ id: "a", viewCount: 50000 }),
        candidate({ id: "a", viewCount: 900000 }),
      ],
      MY_CHANNEL_ID,
    );

    expect(result).toHaveLength(1);
    expect(result[0].viewCount).toBe(50000);
  });

  it("조회수가 10,000 미만이면 제외한다", () => {
    const result = rankViral(
      [
        candidate({ id: "low", viewCount: 9999 }),
        candidate({ id: "ok", viewCount: 10000 }),
      ],
      MY_CHANNEL_ID,
    );

    expect(result.map((v) => v.id)).toEqual(["ok"]);
  });

  it("구독자가 100명 미만이면 제외한다", () => {
    const result = rankViral(
      [
        candidate({ id: "tiny", subscriberCount: 99 }),
        candidate({ id: "ok", subscriberCount: 100 }),
      ],
      MY_CHANNEL_ID,
    );

    expect(result.map((v) => v.id)).toEqual(["ok"]);
  });

  it("내 채널의 영상은 제외한다", () => {
    const result = rankViral(
      [
        candidate({ id: "mine", channelId: MY_CHANNEL_ID }),
        candidate({ id: "other", channelId: "UCother" }),
      ],
      MY_CHANNEL_ID,
    );

    expect(result.map((v) => v.id)).toEqual(["other"]);
  });

  it("배율 내림차순으로 정렬한다", () => {
    const result = rankViral(
      [
        candidate({ id: "mid", viewCount: 50000, subscriberCount: 1000 }),
        candidate({ id: "high", viewCount: 50000, subscriberCount: 100 }),
        candidate({ id: "low", viewCount: 50000, subscriberCount: 10000 }),
      ],
      MY_CHANNEL_ID,
    );

    expect(result.map((v) => v.id)).toEqual(["high", "mid", "low"]);
  });

  it("상위 8개까지만 반환한다", () => {
    const candidates = Array.from({ length: 12 }, (_, i) =>
      candidate({ id: `v${i}`, viewCount: 10000 * (i + 1) }),
    );

    const result = rankViral(candidates, MY_CHANNEL_ID);

    expect(result).toHaveLength(8);
    expect(result[0].id).toBe("v11");
    expect(result[7].id).toBe("v4");
  });

  it("후보가 없으면 빈 배열을 반환한다", () => {
    expect(rankViral([], MY_CHANNEL_ID)).toEqual([]);
  });
});
