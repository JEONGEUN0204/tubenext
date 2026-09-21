export type ChannelQuery =
  | { by: "handle"; value: string }
  | { by: "id"; value: string };

export interface ChannelSummary {
  id: string;
  title: string;
  subscriberCount: number;
  thumbnailUrl: string;
  uploadsPlaylistId: string;
}

export interface VideoStat {
  id: string;
  title: string;
  publishedAt: string; // ISO 8601
  viewCount: number;
  durationSec: number;
}

export interface UploadStats {
  avgViews: number;
  medianViews: number;
  uploadIntervalDays: number;
  avgDurationSec: number;
  topPerformers: string[]; // 조회수 상위 3개 제목
}

export interface ProfileCore {
  niche: string;
  audience: string;
  formats: string[];
  searchKeywords: string[]; // 정확히 3개
}

export type ChannelProfile = ProfileCore & UploadStats;

export interface ViralCandidate {
  id: string;
  title: string;
  channelId: string;
  channelTitle: string;
  subscriberCount: number;
  viewCount: number;
  publishedAt: string;
  thumbnailUrl: string;
  durationSec: number;
}

export interface ViralVideo extends ViralCandidate {
  multiple: number; // viewCount / subscriberCount
  viewsPerDay: number;
  isShort: boolean; // durationSec < 60
}

export interface ContentIdea {
  title: string;
  hook: string;
  outline: string[];
  whyNow: string;
  referenceVideoId: string;
  estimatedMinutes: [number, number];
}

export interface AnalyzeResponse {
  channel: ChannelSummary;
  profile: ChannelProfile;
  viral: ViralVideo[];
  ideas: ContentIdea[]; // 생성 실패 시 빈 배열
}

export type ErrorCode =
  | "CHANNEL_NOT_FOUND"
  | "TOO_FEW_VIDEOS"
  | "QUOTA_EXCEEDED"
  | "UPSTREAM_ERROR"
  | "BAD_INPUT";
