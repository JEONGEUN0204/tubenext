import { extractKeywords, tokenizeTitle } from "@/lib/keywords";
import type { ChannelSummary, ProfileCore, VideoStat } from "@/types";

// LLM 없이 도는 폴백이다. 제목에서 실제로 세어진 것만 문장으로 만든다.
// 추정을 그럴듯한 문장으로 포장하면 UI의 "규칙 기반" 배지가 무의미해진다.

const SEARCH_KEYWORD_COUNT = 3;
const SHORTS_MAX_SEC = 60;
// 절반이 쇼츠면 길이 중앙값이 뭐든 이 채널의 주력은 쇼츠다.
const SHORTS_RATIO = 0.5;
// 10개 중 3개면 우연이 아니라 반복되는 제목 습관으로 본다.
const PATTERN_RATIO = 0.3;

const DURATION_LABELS: Array<[maxSec: number, label: string]> = [
  [300, "5분 내외 숏폼"],
  [900, "10분대 미드폼"],
  [1800, "20분대 롱폼"],
];
const LONGEST_LABEL = "30분 이상 롱폼";
const SHORTS_LABEL = "쇼츠 중심 (60초 이하)";
const NO_VIDEO_LABEL = "분석할 영상 없음";

const HAS_DIGIT = /\d/;
// `[자취일기] 3화` 처럼 여는 대괄호로 시작하는 제목.
const LEADING_BRACKET = /^\s*\[[^\]]*\]/;
// `영화`가 걸리지 않게 앞에 숫자를 요구하고, 뒤에 한글이 붙으면 회차가 아니다.
const EPISODE_NUMBER = /\d+화(?![가-힣])/;
const EPISODE_EP = /\bep\s*\.?\s*\d+/i;
const TRAILING_QUESTION = /\?\s*$/;

const TITLE_PATTERNS: Array<[test: (title: string) => boolean, label: string]> =
  [
    [(title) => HAS_DIGIT.test(title), "숫자 강조 제목 (가격·개수)"],
    [
      (title) =>
        LEADING_BRACKET.test(title) ||
        EPISODE_NUMBER.test(title) ||
        EPISODE_EP.test(title),
      "시리즈 연재물",
    ],
    [(title) => TRAILING_QUESTION.test(title), "질문형 제목"],
  ];

const NO_KEYWORD_NICHE = "최근 업로드 제목에서 반복되는 주제를 찾지 못했습니다";
const NO_KEYWORD_AUDIENCE = "추정할 근거가 부족합니다";

/** LLM 없이 최근 업로드 목록만으로 채널 프로필을 만든다 (extractProfile 폴백) */
export function buildRuleProfile(
  channel: ChannelSummary,
  videos: VideoStat[],
): ProfileCore {
  // 채널명이 키워드에 남으면 내 채널 영상만 다시 검색되어 바이럴 탐색이 무의미해진다.
  const searchKeywords = extractKeywords(
    videos.map((v) => v.title),
    { excludeTokens: tokenizeTitle(channel.title), limit: SEARCH_KEYWORD_COUNT },
  );

  return {
    niche: buildNiche(searchKeywords),
    audience: buildAudience(searchKeywords),
    formats: buildFormats(videos),
    searchKeywords,
  };
}

function buildNiche(keywords: string[]): string {
  if (keywords.length === 0) return NO_KEYWORD_NICHE;
  return `${keywords.slice(0, 2).join(" · ")} 중심 콘텐츠`;
}

function buildAudience(keywords: string[]): string {
  if (keywords.length === 0) return NO_KEYWORD_AUDIENCE;
  return `'${keywords[0]}' 관련 영상을 찾아보는 시청자`;
}

function buildFormats(videos: VideoStat[]): string[] {
  if (videos.length === 0) return [NO_VIDEO_LABEL];

  const formats = [lengthLabel(videos)];
  for (const [matches, label] of TITLE_PATTERNS) {
    const count = videos.filter((v) => matches(v.title)).length;
    if (count / videos.length >= PATTERN_RATIO) formats.push(label);
  }

  return formats;
}

function lengthLabel(videos: VideoStat[]): string {
  const shorts = videos.filter((v) => v.durationSec < SHORTS_MAX_SEC).length;
  if (shorts / videos.length >= SHORTS_RATIO) return SHORTS_LABEL;

  // 평균은 특집 한두 개에 끌려간다. 실제로 매주 올리는 길이는 중앙값 쪽이다.
  // summarizeUploads는 avgDurationSec만 주므로 길이 중앙값은 여기서 구한다.
  const median = medianDuration(videos);
  const matched = DURATION_LABELS.find(([maxSec]) => median < maxSec);

  return matched ? matched[1] : LONGEST_LABEL;
}

function medianDuration(videos: VideoStat[]): number {
  const sorted = videos.map((v) => v.durationSec).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}
