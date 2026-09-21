import type { UploadStats, VideoStat } from "@/types";

const ISO_DURATION = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/;
const MS_PER_DAY = 86_400_000;
const TOP_PERFORMER_COUNT = 3;

export function parseDurationSec(iso8601: string): number {
  const match = ISO_DURATION.exec(iso8601);
  if (!match) return 0;

  const [, days, hours, minutes, seconds] = match;
  return (
    Number(days ?? 0) * 86_400 +
    Number(hours ?? 0) * 3_600 +
    Number(minutes ?? 0) * 60 +
    Number(seconds ?? 0)
  );
}

export function summarizeUploads(videos: VideoStat[]): UploadStats {
  if (videos.length === 0) {
    return {
      avgViews: 0,
      medianViews: 0,
      uploadIntervalDays: 0,
      avgDurationSec: 0,
      topPerformers: [],
    };
  }

  const views = videos.map((v) => v.viewCount);
  const times = videos.map((v) => new Date(v.publishedAt).getTime());
  const spanDays = (Math.max(...times) - Math.min(...times)) / MS_PER_DAY;

  return {
    avgViews: Math.round(average(views)),
    medianViews: Math.round(median(views)),
    uploadIntervalDays:
      videos.length === 1
        ? 0
        : Math.round((spanDays / (videos.length - 1)) * 10) / 10,
    avgDurationSec: Math.round(average(videos.map((v) => v.durationSec))),
    topPerformers: [...videos]
      .sort((a, b) => b.viewCount - a.viewCount)
      .slice(0, TOP_PERFORMER_COUNT)
      .map((v) => v.title),
  };
}

function average(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}
