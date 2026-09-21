// 검색창에 넣어도 같은 주제 영상이 안 나오는 일반어만 넣는다.
// 브이로그·리뷰·먹방·챌린지 같은 포맷 단어는 실제 검색어라 여기 없다.
const STOPWORDS = new Set([
  "영상", "채널", "구독", "좋아요", "댓글", "오늘", "어제", "내일", "진짜",
  "정말", "완전", "그냥", "이거", "저거", "우리", "내가", "제가", "너무",
  "이번", "다음", "여러분", "사람", "시간", "마지막", "최초", "공개", "대박",
  "레전드", "역대급", "실화", "근황", "shorts", "short", "vlog", "ep", "part",
  "full", "official", "mv", "tv",
]);

// 이 음절쌍으로 끝나는 한국어 명사는 사실상 없어서 조건 없이 뗀다.
// 긴 조사가 먼저 와야 한다. `사람이라는`에서 `라는`이 먼저 걸리면 `사람이`가 남는다.
const TWO_CHAR_PARTICLES = [
  "이라는", "라는", "에서", "으로", "에게", "한테", "부터", "까지", "처럼",
  "보다", "라도",
];
// 명사의 끝 음절과 구분되지 않는다. 어간이 다른 제목에 단독으로 있을 때만 뗀다.
const ONE_CHAR_PARTICLES = [
  "은", "는", "이", "가", "을", "를", "의", "에", "도", "만", "로", "와", "과",
];

const NON_TOKEN_CHARS = /[^가-힣a-zA-Z0-9]+/g;
const DIGITS_ONLY = /^\d+$/;
const MIN_TOKEN_LENGTH = 2;
const MIN_STEM_LENGTH = 2;
const TWO_CHAR_PARTICLE_MIN_LENGTH = 4;
const ONE_CHAR_PARTICLE_MIN_LENGTH = 3;
// 우연히 붙은 두 단어를 검색어로 쓰지 않는다.
const MIN_BIGRAM_COUNT = 2;
// search.list가 호출당 100 units다.
const DEFAULT_LIMIT = 3;

export interface ExtractOptions {
  excludeTokens?: string[]; // 이 토큰들은 후보에서 뺀다 (채널명 토큰 등)
  limit?: number; // 반환 개수. 기본 3
}

/** 제목 1개 → 원시 토큰 배열 (조사 정규화 전) */
export function tokenizeTitle(title: string): string[] {
  return title
    .replace(NON_TOKEN_CHARS, " ")
    .split(" ")
    .filter((token) => token !== "")
    .map((token) => token.toLowerCase())
    .filter(isKeywordToken);
}

/** 제목 여러 개 → 조사 정규화까지 끝난 토큰 배열들 */
export function tokenizeTitles(titles: string[]): string[][] {
  const rawTokens = titles.map((title) => tokenizeTitle(title));
  // 조사를 뗄 근거는 전체 제목에서 모은 토큰 집합뿐이다.
  const seen = new Set(rawTokens.flat());

  return rawTokens.map((tokens) =>
    tokens.map((token) => stripParticle(token, seen)).filter(isKeywordToken),
  );
}

/** 제목 여러 개 → 검색에 쓸 키워드 상위 N개 */
export function extractKeywords(
  titles: string[],
  options: ExtractOptions = {},
): string[] {
  const { excludeTokens = [], limit = DEFAULT_LIMIT } = options;
  const excluded = new Set(excludeTokens.map((token) => token.toLowerCase()));

  // 채널명·진행자 이름이 남으면 내 채널 영상만 다시 검색된다.
  const tokensPerTitle = tokenizeTitles(titles).map((tokens) =>
    tokens.filter((token) => !excluded.has(token)),
  );

  const bigrams = new Map<string, number>();
  const unigrams = new Map<string, number>();
  for (const tokens of tokensPerTitle) {
    tokens.forEach((token, i) => {
      increment(unigrams, token);
      if (i > 0) increment(bigrams, `${tokens[i - 1]} ${token}`);
    });
  }

  // 한 단어보다 2어절 구가 실제 검색어에 가깝다. 바이그램을 먼저 본다.
  const candidates = [
    ...rankByCount(bigrams, MIN_BIGRAM_COUNT),
    ...rankByCount(unigrams, 1),
  ];

  const keywords: string[] = [];
  for (const candidate of candidates) {
    if (keywords.length >= limit) break;
    // 사실상 같은 검색이 되면 search.list 100 units를 낭비한다.
    if (keywords.some((keyword) => keyword.includes(candidate))) continue;
    keywords.push(candidate);
  }

  return keywords;
}

function isKeywordToken(token: string): boolean {
  return (
    token.length >= MIN_TOKEN_LENGTH &&
    !DIGITS_ONLY.test(token) &&
    !STOPWORDS.has(token)
  );
}

function stripParticle(token: string, seen: Set<string>): string {
  if (token.length >= TWO_CHAR_PARTICLE_MIN_LENGTH) {
    for (const particle of TWO_CHAR_PARTICLES) {
      if (!token.endsWith(particle)) continue;
      const stem = token.slice(0, -particle.length);
      if (stem.length >= MIN_STEM_LENGTH) return stem;
    }
  }

  if (token.length >= ONE_CHAR_PARTICLE_MIN_LENGTH) {
    for (const particle of ONE_CHAR_PARTICLES) {
      if (!token.endsWith(particle)) continue;
      const stem = token.slice(0, -1);
      // `고양이`는 `고양`이 단독으로 등장한 적이 없으므로 그대로 둔다.
      if (stem.length >= MIN_STEM_LENGTH && seen.has(stem)) return stem;
    }
  }

  return token;
}

function increment(counts: Map<string, number>, key: string): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function rankByCount(counts: Map<string, number>, minCount: number): string[] {
  // Map은 첫 등장 순서를 지키고 sort는 안정 정렬이다 → 빈도가 같으면 먼저 나온 쪽이 앞이다.
  return [...counts.entries()]
    .filter(([, count]) => count >= minCount)
    .sort((a, b) => b[1] - a[1])
    .map(([token]) => token);
}
