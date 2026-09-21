import { AppError } from "@/lib/errors";
import { parseDurationSec } from "@/lib/stats";
import type {
  ChannelQuery,
  ChannelSummary,
  VideoStat,
  ViralCandidate,
} from "@/types";

const BASE_URL = "https://www.googleapis.com/youtube/v3";
const VIDEO_PARTS = "snippet,statistics,contentDetails";
const RECENT_VIDEO_COUNT = 30;
// search.list는 호출당 100 units, 일일 무료 할당량은 10,000 units다.
// 키워드가 4개 이상이면 하루 분석 횟수가 무너지므로 여기서 반드시 잘라낸다.
const MAX_SEARCH_KEYWORDS = 3;
const SEARCH_RESULTS_PER_KEYWORD = 15;
const SEARCH_WINDOW_DAYS = 30;
// videos.list / channels.list의 id 파라미터 상한
const ID_BATCH_SIZE = 50;
const MS_PER_DAY = 86_400_000;

interface ListResponse<T> {
  items?: T[];
}

interface RawThumbnails {
  default?: { url?: string };
  medium?: { url?: string };
  high?: { url?: string };
}

interface RawChannel {
  id: string;
  snippet?: { title?: string; thumbnails?: RawThumbnails };
  // 구독자 수를 숨긴 채널은 subscriberCount 자체가 내려오지 않는다.
  statistics?: { subscriberCount?: string };
  contentDetails?: { relatedPlaylists?: { uploads?: string } };
}

interface RawPlaylistItem {
  contentDetails?: { videoId?: string };
}

interface RawSearchItem {
  id?: { videoId?: string };
}

interface RawVideo {
  id: string;
  snippet?: {
    title?: string;
    publishedAt?: string;
    channelId?: string;
    channelTitle?: string;
    thumbnails?: RawThumbnails;
  };
  statistics?: { viewCount?: string };
  contentDetails?: { duration?: string };
}

export async function fetchChannel(
  q: ChannelQuery,
): Promise<ChannelSummary | null> {
  const data = await youtubeGet<ListResponse<RawChannel>>("channels", {
    part: VIDEO_PARTS,
    ...(q.by === "handle" ? { forHandle: q.value } : { id: q.value }),
  });

  const item = data.items?.[0];
  if (!item) return null;

  return {
    id: item.id,
    title: item.snippet?.title ?? "",
    subscriberCount: toCount(item.statistics?.subscriberCount),
    thumbnailUrl: pickThumbnail(item.snippet?.thumbnails),
    uploadsPlaylistId: item.contentDetails?.relatedPlaylists?.uploads ?? "",
  };
}

export async function fetchRecentVideos(
  uploadsPlaylistId: string,
): Promise<VideoStat[]> {
  const playlist = await youtubeGet<ListResponse<RawPlaylistItem>>(
    "playlistItems",
    {
      part: "contentDetails",
      playlistId: uploadsPlaylistId,
      maxResults: String(RECENT_VIDEO_COUNT),
    },
  );

  const videoIds = pickIds(
    playlist.items ?? [],
    (item) => item.contentDetails?.videoId,
  );
  if (videoIds.length === 0) return [];

  const videos = await fetchVideos(videoIds);

  return videos
    .map((v) => ({
      id: v.id,
      title: v.snippet?.title ?? "",
      publishedAt: v.snippet?.publishedAt ?? "",
      viewCount: toCount(v.statistics?.viewCount),
      durationSec: parseDurationSec(v.contentDetails?.duration ?? ""),
    }))
    .sort(
      (a, b) =>
        new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
    );
}

export async function searchViralCandidates(
  keywords: string[],
): Promise<ViralCandidate[]> {
  const picked = keywords.slice(0, MAX_SEARCH_KEYWORDS);
  if (picked.length === 0) return [];

  const publishedAfter = new Date(
    Date.now() - SEARCH_WINDOW_DAYS * MS_PER_DAY,
  ).toISOString();

  const pages = await Promise.all(
    picked.map((keyword) =>
      youtubeGet<ListResponse<RawSearchItem>>("search", {
        part: "snippet",
        q: keyword,
        type: "video",
        order: "viewCount",
        regionCode: "KR",
        relevanceLanguage: "ko",
        publishedAfter,
        maxResults: String(SEARCH_RESULTS_PER_KEYWORD),
      }),
    ),
  );

  const videoIds = pickIds(
    pages.flatMap((page) => page.items ?? []),
    (item) => item.id?.videoId,
  );
  if (videoIds.length === 0) return [];

  const videos = await fetchVideos(videoIds);
  const subscribers = await fetchSubscriberCounts(
    pickIds(videos, (v) => v.snippet?.channelId),
  );

  // 점수 계산·필터링·정렬은 lib/rankViral의 몫이다. 여기서는 정규화만 한다.
  return videos.map((v) => {
    const channelId = v.snippet?.channelId ?? "";
    return {
      id: v.id,
      title: v.snippet?.title ?? "",
      channelId,
      channelTitle: v.snippet?.channelTitle ?? "",
      subscriberCount: subscribers.get(channelId) ?? 0,
      viewCount: toCount(v.statistics?.viewCount),
      publishedAt: v.snippet?.publishedAt ?? "",
      thumbnailUrl: pickThumbnail(v.snippet?.thumbnails),
      durationSec: parseDurationSec(v.contentDetails?.duration ?? ""),
    };
  });
}

async function fetchVideos(videoIds: string[]): Promise<RawVideo[]> {
  const pages = await Promise.all(
    batch(videoIds).map((ids) =>
      youtubeGet<ListResponse<RawVideo>>("videos", {
        part: VIDEO_PARTS,
        id: ids.join(","),
      }),
    ),
  );

  return pages.flatMap((page) => page.items ?? []);
}

async function fetchSubscriberCounts(
  channelIds: string[],
): Promise<Map<string, number>> {
  if (channelIds.length === 0) return new Map();

  const pages = await Promise.all(
    batch(channelIds).map((ids) =>
      youtubeGet<ListResponse<RawChannel>>("channels", {
        part: "statistics",
        id: ids.join(","),
      }),
    ),
  );

  return new Map(
    pages
      .flatMap((page) => page.items ?? [])
      .map((c): [string, number] => [c.id, toCount(c.statistics?.subscriberCount)]),
  );
}

// API 키는 모듈 최상위가 아니라 호출 시점에 읽는다.
// 최상위에서 읽으면 next build가 모듈을 평가할 때 키가 없어 빌드가 깨진다.
function apiKey(): string {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    throw new AppError("UPSTREAM_ERROR", "YOUTUBE_API_KEY가 설정되지 않았습니다.");
  }
  return key;
}

async function youtubeGet<T>(
  resource: string,
  params: Record<string, string>,
): Promise<T> {
  const url = new URL(`${BASE_URL}/${resource}`);
  for (const [name, value] of Object.entries(params)) {
    url.searchParams.set(name, value);
  }
  url.searchParams.set("key", apiKey());

  const res = await fetch(url);
  if (!res.ok) {
    // 이 메시지는 라우트를 통해 그대로 클라이언트로 나간다.
    // 키가 붙은 URL이나 키 값 자체를 절대 넣지 않는다.
    if (res.status === 403) {
      throw new AppError(
        "QUOTA_EXCEEDED",
        "YouTube API 일일 할당량을 초과했습니다.",
      );
    }
    throw new AppError(
      "UPSTREAM_ERROR",
      `YouTube API 호출에 실패했습니다. (${res.status})`,
    );
  }

  return (await res.json()) as T;
}

function pickIds<T>(items: T[], select: (item: T) => string | undefined): string[] {
  const ids = items.map(select).filter((id): id is string => Boolean(id));
  return [...new Set(ids)];
}

function batch(ids: string[]): string[][] {
  const batches: string[][] = [];
  for (let i = 0; i < ids.length; i += ID_BATCH_SIZE) {
    batches.push(ids.slice(i, i + ID_BATCH_SIZE));
  }
  return batches;
}

function toCount(raw: string | undefined): number {
  const value = Number(raw ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function pickThumbnail(thumbnails: RawThumbnails | undefined): string {
  return (
    thumbnails?.high?.url ??
    thumbnails?.medium?.url ??
    thumbnails?.default?.url ??
    ""
  );
}
