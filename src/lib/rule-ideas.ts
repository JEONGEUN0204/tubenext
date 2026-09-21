import { extractKeywords } from "@/lib/keywords";
import type { ChannelProfile, ContentIdea, ViralVideo } from "@/types";

// LLM 없이 도는 폴백이다. 제목·훅 문장은 템플릿이라 LLM보다 확실히 투박하다.
// 대신 whyNow는 입력으로 받은 수치만 쓰므로 지어낸 트렌드 해설이 섞이지 않는다.
// 그게 이 경로의 유일한 강점이다. 없는 숫자나 해설을 여기에 덧붙이지 마라.

const IDEA_COUNT = 5;
const VIRAL_KEYWORD_COUNT = 3;
// 소재 후보가 떨어졌을 때 제목을 통째로 넣으면 남의 영상 제목이 그대로 노출된다.
const TITLE_SNIPPET_LENGTH = 20;
const WHY_NOW_TITLE_LENGTH = 40;
const ELLIPSIS = "…";
const DEFAULT_MY_KEYWORD = "우리 채널 주제";

const SHORTS_MAX_SEC = 60;
const LOWER_RATIO = 0.8;
const UPPER_RATIO = 1.2;
const SEC_PER_MIN = 60;

// 키워드 바로 뒤에 조사를 붙이지 않는다. 받침 유무로 은/는·을/를·으로/로가 갈리는데
// 그 처리를 하지 않으므로 `김치볶음밥를` 같은 문장이 영상 제목 후보로 나간다.
const TEMPLATES: Array<{
  title: (v: string, m: string) => string;
  hook: (v: string, m: string) => string;
}> = [
  {
    title: (v, m) => `요즘 터지는 '${v}', ${m} 채널이 해보면`,
    hook: (v) => `${v} 영상이 지금 왜 이렇게 도는지 직접 확인해봤습니다.`,
  },
  {
    title: (v, m) => `${m} 하는 사람이 ${v} 따라 해봤습니다`,
    hook: (v) => `${v} 영상 보고 바로 따라 했습니다. 결과부터 보여드릴게요.`,
  },
  {
    title: (v, m) => `${v} 진짜 되는지 ${m} 기준으로 검증`,
    hook: (v) => `${v} 이거 실제로 되는지 오늘 끝까지 해봅니다.`,
  },
  {
    title: (v, m) => `${m} 입문자를 위한 ${v} 정리`,
    hook: (v) => `${v} 처음 보는 분들만 보세요. 3분이면 됩니다.`,
  },
  {
    title: (v, m) => `${v} vs ${m}, 뭐가 더 나을까`,
    hook: (v, m) => `${v} 그리고 ${m}. 둘 다 해보고 결론 냈습니다.`,
  },
];

/** LLM 없이 바이럴 영상 목록만으로 기획안을 만든다 (generateIdeas 폴백) */
export function buildRuleIdeas(
  profile: ChannelProfile,
  viral: ViralVideo[],
): ContentIdea[] {
  // 근거로 지목할 영상이 없으면 기획안을 만들지 않는다.
  if (viral.length === 0) return [];

  const myKeyword = profile.searchKeywords[0] ?? DEFAULT_MY_KEYWORD;
  // 5개가 같은 단어로 시작하면 제목만 바꾼 변형이 된다. 쓴 단어는 다시 쓰지 않는다.
  const usedKeywords = new Set<string>();

  return viral.slice(0, IDEA_COUNT).map((video, i) => {
    const viralKeyword = pickViralKeyword(video, usedKeywords);
    usedKeywords.add(viralKeyword);
    const template = TEMPLATES[i];

    return {
      title: template.title(viralKeyword, myKeyword),
      hook: template.hook(viralKeyword, myKeyword),
      outline: buildOutline(viralKeyword, myKeyword),
      whyNow: buildWhyNow(video),
      referenceVideoId: video.id,
      estimatedMinutes: estimateMinutes(profile.avgDurationSec),
    };
  });
}

function pickViralKeyword(video: ViralVideo, used: Set<string>): string {
  const candidates = extractKeywords([video.title], {
    limit: VIRAL_KEYWORD_COUNT,
  });
  const fresh = candidates.find((candidate) => !used.has(candidate));

  return fresh ?? video.title.slice(0, TITLE_SNIPPET_LENGTH);
}

function buildOutline(viralKeyword: string, myKeyword: string): string[] {
  return [
    `도입: '${viralKeyword}' 영상이 지금 어떻게 퍼지고 있는지 보여준다`,
    `본편: ${myKeyword} 방식으로 직접 해본다`,
    "비교: 참고 영상과 결과가 어디서 갈리는지 짚는다",
    "마무리: 다음 영상 예고",
  ];
}

function buildWhyNow(video: ViralVideo): string {
  return [
    `참고 영상 '${truncate(video.title)}' —`,
    `구독자 ${withCommas(video.subscriberCount)}명 채널에서`,
    `조회수 ${withCommas(video.viewCount)}회,`,
    `구독자 대비 ${withCommas(video.multiple)}배,`,
    `하루 평균 ${withCommas(video.viewsPerDay)}회.`,
  ].join(" ");
}

function truncate(title: string): string {
  if (title.length <= WHY_NOW_TITLE_LENGTH) return title;
  return `${title.slice(0, WHY_NOW_TITLE_LENGTH)}${ELLIPSIS}`;
}

// toLocaleString·Intl.NumberFormat은 실행 환경의 ICU 로케일 데이터에 따라 결과가
// 달라진다. 출력이 환경에 따라 흔들리면 안 되므로 직접 끊는다.
function withCommas(value: number): string {
  const [whole, fraction] = String(value).split(".");
  let grouped = "";
  for (let i = 0; i < whole.length; i++) {
    if (i > 0 && (whole.length - i) % 3 === 0) grouped += ",";
    grouped += whole[i];
  }

  return fraction ? `${grouped}.${fraction}` : grouped;
}

function estimateMinutes(avgDurationSec: number): [number, number] {
  if (avgDurationSec < SHORTS_MAX_SEC) return [1, 2];

  const lo = Math.max(
    1,
    Math.round((avgDurationSec * LOWER_RATIO) / SEC_PER_MIN),
  );
  const hi = Math.max(
    lo + 1,
    Math.round((avgDurationSec * UPPER_RATIO) / SEC_PER_MIN),
  );

  return [lo, hi];
}
