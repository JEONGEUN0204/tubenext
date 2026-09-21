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

// 프로필과 기획안을 따로 기록한다. 프로필은 Claude로 뽑고 기획안 생성에서 크레딧이
// 떨어질 수 있다. 한 플래그로 뭉치면 UI가 사실과 다른 배지를 단다.
export type AnalysisMode = "llm" | "rule";

export interface AnalysisModes {
  profile: AnalysisMode;
  ideas: AnalysisMode;
}

export interface AnalyzeResponse {
  channel: ChannelSummary;
  profile: ChannelProfile;
  viral: ViralVideo[];
  ideas: ContentIdea[]; // 근거로 쓸 바이럴 영상이 없으면 빈 배열
  mode: AnalysisModes; // 각 단계가 무엇으로 만들어졌는지
}

export type ErrorCode =
  | "CHANNEL_NOT_FOUND"
  | "TOO_FEW_VIDEOS"
  | "QUOTA_EXCEEDED"
  | "UPSTREAM_ERROR"
  | "BAD_INPUT";
