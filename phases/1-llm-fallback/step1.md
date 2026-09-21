# Step 1: rule-profile

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `CLAUDE.md`
- `docs/ARCHITECTURE.md` (`lib/`는 순수 함수만. 네트워크·`process.env` 접근 금지)
- `docs/PRD.md` (핵심 기능 1 — 채널 프로필에 뭐가 들어가야 하는지)
- `src/types/index.ts` (`ChannelSummary`, `VideoStat`, `ProfileCore`)
- `src/lib/keywords.ts` (**step 0 산출물** — `tokenizeTitle`, `extractKeywords`. 이 step에서 그대로 쓴다)
- `tests/keywords.test.ts` (step 0 산출물 — 테스트 스타일)
- `src/lib/stats.ts` (`summarizeUploads`가 이미 평균 조회수·업로드 주기·평균 길이를 계산한다. **중복 구현하지 마라**)
- `src/services/claude.ts` (`extractProfile`의 system 프롬프트 — 이 step이 대체하려는 LLM이 어떤 기준으로 프로필을 뽑는지 읽어라)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 배경

Anthropic 크레딧이 소진되거나 키가 없을 때 `src/services/claude.ts`의 `extractProfile`을 대신할
**규칙 기반 채널 프로필 추출기**를 만든다. 같은 `ProfileCore`를 반환하므로 라우트에서 그대로 갈아끼울 수 있다.

품질이 LLM보다 떨어지는 것은 전제된 사실이다. 숨기지 않고 step 5에서 UI에 "규칙 기반" 배지를 단다.
그러니 여기서는 **그럴듯한 문장을 지어내지 말고, 제목에서 실제로 관찰되는 것만** 써라.

## 작업

`src/lib/rule-profile.ts` 하나만 만든다. 순수 함수만 둔다.

### 공개 API

```ts
export function buildRuleProfile(
  channel: ChannelSummary,
  videos: VideoStat[],
): ProfileCore;
```

반환 타입은 `src/types/index.ts`의 `ProfileCore`다. 새 타입을 만들지 마라.

```ts
interface ProfileCore {
  niche: string;
  audience: string;
  formats: string[];
  searchKeywords: string[]; // 정확히 3개 (모자라면 있는 만큼)
}
```

### `searchKeywords`

`src/lib/keywords.ts`의 `extractKeywords`를 쓴다.

```ts
extractKeywords(
  videos.map((v) => v.title),
  { excludeTokens: tokenizeTitle(channel.title), limit: 3 },
)
```

- 채널명 토큰을 반드시 `excludeTokens`로 넘겨라. 이유: 채널명이 키워드에 들어가면 내 채널 영상만 다시 검색되어 바이럴 탐색이 무의미해진다. 이건 LLM 프롬프트에도 있는 규칙이다.
- 결과가 3개 미만일 수 있다. 그대로 둔다. 빈 배열이면 `searchViralCandidates`가 빈 배열을 돌려주고 바이럴 섹션이 비는데, 그건 허용된 결과다. **억지로 채우려고 채널명이나 고정 문자열을 넣지 마라.**

### `formats`

영상 길이 분포와 제목 패턴에서 **실제로 관찰되는 것만** 만든다. 1개 이상 4개 이하로 반환한다.

길이 기준 (하나만 고른다. `durationSec` 중앙값을 쓴다):

| 조건 | 라벨 |
|------|------|
| 60초 미만 영상이 전체의 50% 이상 | `쇼츠 중심 (60초 이하)` |
| 중앙 길이 < 300초 | `5분 내외 숏폼` |
| 중앙 길이 < 900초 | `10분대 미드폼` |
| 중앙 길이 < 1800초 | `20분대 롱폼` |
| 그 외 | `30분 이상 롱폼` |

쇼츠 비율 조건이 맞으면 길이 라벨 대신 쇼츠 라벨을 쓴다.

제목 패턴 (조건을 만족하는 것을 전부 추가한다):

| 조건 | 라벨 |
|------|------|
| 숫자가 들어간 제목이 30% 이상 | `숫자 강조 제목 (가격·개수)` |
| `[...]`로 시작하거나 `N화`·`EP N`이 들어간 제목이 30% 이상 | `시리즈 연재물` |
| `?`로 끝나는 제목이 30% 이상 | `질문형 제목` |

라벨 문자열은 위 표 그대로 쓴다. 테스트가 이 문자열을 검증한다.

### `niche` / `audience`

키워드에서 만든 **템플릿 문장**이다. 추측을 문장으로 포장하지 마라.

- 키워드가 1개 이상일 때
  - `niche`: `` `${keywords.slice(0, 2).join(" · ")} 중심 콘텐츠` ``
  - `audience`: `` `'${keywords[0]}' 관련 영상을 찾아보는 시청자` ``
- 키워드가 0개일 때
  - `niche`: `최근 업로드 제목에서 반복되는 주제를 찾지 못했습니다`
  - `audience`: `추정할 근거가 부족합니다`

`videos`가 빈 배열이면 키워드 0개 경로와 같은 값을 반환하고, `formats`는 `["분석할 영상 없음"]`을 반환한다. 예외를 던지지 마라.

## 테스트 — `tests/rule-profile.test.ts`

**TDD다. 테스트를 먼저 쓰고, 통과하는 구현을 써라** (CLAUDE.md CRITICAL).
순수 함수라 mock이 필요 없다.

최소한 아래를 덮어라:

- 반복 소재가 있는 제목 10개 이상을 넣으면 `searchKeywords`가 3개 나오고, 그 안에 **채널명 토큰이 없다**
- 길이 30초짜리 영상이 과반이면 `formats`에 `쇼츠 중심 (60초 이하)`가 들어간다
- 중앙 길이 600초면 `formats`에 `10분대 미드폼`이 들어간다
- 제목 과반에 숫자가 있으면 `숫자 강조 제목 (가격·개수)`이 들어간다
- `formats`는 어떤 입력에서도 1개 이상 4개 이하다
- `videos: []` → 예외 없이 `searchKeywords: []`, `formats: ["분석할 영상 없음"]`
- 키워드가 0개인 입력(특수문자뿐인 제목)에서 `niche`/`audience`가 "근거 부족" 문구가 된다
- 같은 입력에 두 번 호출하면 같은 결과가 나온다 (결정적)

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
```

## 검증 절차

1. 위 AC 커맨드를 순서대로 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - `src/lib/rule-profile.ts`가 `fetch`·`process.env`·`Date.now()`를 쓰지 않는가?
   - `summarizeUploads`(`src/lib/stats.ts`)가 이미 계산하는 평균 조회수·업로드 주기·평균 길이를 다시 계산하고 있지 않은가?
   - 반환 타입이 `ProfileCore` 그대로인가? (새 타입을 만들지 않았는가)
3. 결과에 따라 `phases/1-llm-fallback/index.json`의 step 1을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- `niche`·`audience`에 관찰되지 않은 내용을 지어내지 마라. 이유: LLM 없이 돌았다는 사실을 UI가 배지로 알리는데, 문장까지 LLM처럼 그럴듯하면 사용자가 근거 없는 추정을 사실로 읽는다.
- `searchKeywords`를 고정 문자열이나 채널명으로 채우지 마라. 이유: 내 채널 영상만 검색되어 바이럴 탐색 결과가 통째로 쓸모없어진다.
- `src/lib/keywords.ts`를 수정하지 마라. 이유: step 0에서 테스트까지 끝난 모듈이다. 필요한 동작이 없으면 이 파일 안에서 해결하라.
- `src/services/`, `src/app/`, `src/components/`, `src/types/`를 수정하지 마라. 이유: 이 step의 범위는 `src/lib/rule-profile.ts`와 그 테스트뿐이다.
- 기존 테스트를 깨뜨리지 마라.
