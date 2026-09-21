import type { ViralCandidate, ViralVideo } from "@/types";

const MIN_VIEW_COUNT = 10_000;
const MIN_SUBSCRIBER_COUNT = 100;
const MAX_RESULTS = 8;
const SHORT_MAX_SEC = 60;
const MS_PER_DAY = 86_400_000;

export function rankViral(
  candidates: ViralCandidate[],
  myChannelId: string,
): ViralVideo[] {
  const now = Date.now();
  const seen = new Set<string>();

  return candidates
    .filter((c) => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return (
        c.viewCount >= MIN_VIEW_COUNT &&
        c.subscriberCount >= MIN_SUBSCRIBER_COUNT &&
        c.channelId !== myChannelId
      );
    })
    .map((c) => {
      const elapsedDays = Math.max(
        1,
        (now - new Date(c.publishedAt).getTime()) / MS_PER_DAY,
      );
      return {
        ...c,
        multiple: Math.round((c.viewCount / c.subscriberCount) * 10) / 10,
        viewsPerDay: Math.round(c.viewCount / elapsedDays),
        isShort: c.durationSec < SHORT_MAX_SEC,
      };
    })
    .sort((a, b) => b.multiple - a.multiple)
    .slice(0, MAX_RESULTS);
}
