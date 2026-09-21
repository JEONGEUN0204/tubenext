# Step 4: fallback-route

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `CLAUDE.md` (CRITICAL: 서비스 호출은 라우트 핸들러에서만)
- `docs/ARCHITECTURE.md` (데이터 흐름 다이어그램 — 파이프라인 순서를 바꾸지 마라)
- `docs/ADR.md`
- `src/app/api/analyze/route.ts` (**이 step에서 수정할 라우트**)
- `src/types/index.ts` (**이 step에서 수정할 타입**)
- `src/lib/rule-profile.ts` (**step 1 산출물** — `buildRuleProfile(channel, videos): ProfileCore`)
- `src/lib/rule-ideas.ts` (**step 2 산출물** — `buildRuleIdeas(profile, viral): ContentIdea[]`)
- `src/services/claude.ts` (**step 3 산출물** — `isLlmEnabled(): boolean`)
- `tests/analyze-route.test.ts` (**이 step에서 수정할 테스트**. 기존 테스트 3개를 반드시 고쳐야 한다. 아래에 어떤 것인지 적혀 있다)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 배경

지금은 `extractProfile`(Claude)이 실패하면 검색 키워드가 없어 **요청 전체가 502로 죽는다.**
Anthropic 크레딧이 떨어지면 앱이 아무 결과도 못 낸다는 뜻이다.

step 1~3에서 규칙 기반 대체 경로와 판정 함수가 준비됐다. 이 step은 **라우트를 그 경로에 연결**한다.

## 작업

### 1. `src/types/index.ts`

아래를 추가하고 `AnalyzeResponse`에 `mode`를 **필수 필드**로 넣는다.

```ts
export type AnalysisMode = "llm" | "rule";

export interface AnalysisModes {
  profile: AnalysisMode;
  ideas: AnalysisMode;
}

export interface AnalyzeResponse {
  channel: ChannelSummary;
  profile: ChannelProfile;
  viral: ViralVideo[];
  ideas: ContentIdea[];
  mode: AnalysisModes; // 각 단계가 무엇으로 만들어졌는지
}
```

프로필과 기획안을 **따로** 기록하는 이유: 프로필은 Claude로 뽑았는데 그다음 기획안 생성에서 크레딧이 떨어질 수 있다. 하나의 플래그로 뭉치면 UI가 사실과 다른 배지를 단다.

이 step에서만 `types/`와 `app/`을 함께 수정한다. 이유: `mode`를 필수 필드로 추가하는 순간 라우트가 같은 변경 안에서 값을 채우지 않으면 `npm run build`가 타입 에러로 깨진다. 두 파일을 쪼갤 수 없다.

### 2. `src/app/api/analyze/route.ts`

파이프라인 순서(ARCHITECTURE.md 데이터 흐름)는 그대로 두고, Claude를 쓰는 두 지점만 폴백 가능하게 바꾼다.

폴백 규칙:

1. 요청 시작 시 `isLlmEnabled()`를 **한 번** 호출한다. `false`면 Claude를 한 번도 호출하지 않고 처음부터 규칙 경로로 간다.
2. `extractProfile`이 **어떤 이유로든** 실패하면(크레딧 소진, 401, 429, 파싱 실패 전부) 그 에러를 삼키고 `buildRuleProfile(channel, videos)`로 대체한다. `console.error`로 서버 로그에만 남긴다.
3. **한 요청 안에서 Claude가 한 번이라도 실패하면, 그 요청의 남은 Claude 호출을 건너뛴다.**
   이유: 크레딧이 없는 상태에서 매 요청마다 2번씩 실패를 기다리면 응답이 수 초씩 느려진다. 첫 실패가 곧 두 번째 실패라고 봐도 되고, 어차피 규칙 경로 결과가 있다.
4. `generateIdeas`가 실패하면 `buildRuleIdeas(profile, viral)`로 대체한다.
5. `viral`이 빈 배열이면 Claude를 호출하지 않고 규칙 경로로 간다(`buildRuleIdeas`가 빈 배열을 돌려준다).
   이유: 근거 영상이 없는데 기획안을 지어내라고 시키는 건 비용만 쓰고 근거 없는 결과를 만든다.
6. `mode.profile`·`mode.ideas`에 실제로 쓰인 경로를 채운다. **추측해서 채우지 마라. 실제로 어느 코드가 값을 만들었는지 그대로 기록한다.**

바꾸지 않는 것:

- YouTube 쪽 에러(`fetchChannel`·`fetchRecentVideos`·`searchViralCandidates`)는 지금처럼 **그대로 밖으로 던진다.** 404/422/429/502 응답은 유지된다.
  이유: 채널을 못 찾았는데 규칙 기반으로 뭘 만들 수 있는 게 아니다. 폴백은 Claude 실패에만 적용한다.
- `MIN_VIDEO_COUNT` 검사, `STATUS_BY_CODE`, `MESSAGE_BY_CODE`, `maxDuration`.
- `summarizeUploads`로 업로드 통계를 합치는 부분. 프로필이 LLM이든 규칙이든 통계는 똑같이 붙는다.
- `ErrorCode`에 새 코드를 추가하지 마라. 폴백은 에러가 아니라 정상 200 응답이다.

기존 `ideasOrEmpty` 헬퍼는 역할이 바뀌므로 폴백 로직으로 대체한다.

## 테스트 — `tests/analyze-route.test.ts`

**TDD다. 테스트를 먼저 고치고/쓰고, 통과하는 구현을 써라** (CLAUDE.md CRITICAL).

mock 설정에 `isLlmEnabled`를 추가해야 한다. 빠뜨리면 `isLlmEnabled is not a function`으로 전부 깨진다.

```ts
vi.mock("@/services/claude", () => ({
  extractProfile: vi.fn(),
  generateIdeas: vi.fn(),
  isLlmEnabled: vi.fn(),
}));
```

기본값은 `true`로 두고(기존 테스트가 그대로 통과해야 한다), 폴백 테스트에서만 `false`로 바꿔라.
`src/lib/`은 **mock하지 마라.** 순수 함수이므로 실제로 돌려서 폴백 결과가 진짜 채워지는지 확인한다.

### 반드시 고쳐야 하는 기존 테스트 3개

새 동작에 맞게 고치는 것이 **의도된 변경**이다. 억지로 예전 기대값을 살리려 하지 마라.

1. `"정상 흐름이면 200과 네 개의 키를 돌려준다"` — 응답 키가 5개가 된다. `mode`를 포함하도록 고치고, 제목도 그에 맞게 바꾼다. `mode`는 `{ profile: "llm", ideas: "llm" }`이어야 한다.
2. `"업스트림 에러는 502를 돌려준다"` — 지금은 `extractProfile`을 실패시켜 502를 검증한다. 이제 그 경로는 200 + 규칙 폴백이다. **YouTube 서비스 실패(예: `fetchRecentVideos`가 `AppError("UPSTREAM_ERROR")`)로 바꿔서** 502가 유지되는지 검증하도록 고쳐라.
3. `"generateIdeas만 실패하면 200에 빈 ideas로 돌려준다"` — 이제 빈 배열이 아니라 규칙 기반 기획안이 채워진다. 제목과 기대값을 새 동작으로 고쳐라.

### 새로 추가할 테스트

- `isLlmEnabled()`가 `false`면 `extractProfile`·`generateIdeas`가 **한 번도 호출되지 않고**, 200 응답에 `mode: { profile: "rule", ideas: "rule" }`이며 `profile.searchKeywords`가 비어 있지 않다
- `extractProfile`이 실패하면 200이고 `mode.profile === "rule"`, 그리고 **`generateIdeas`가 호출되지 않으며** `mode.ideas === "rule"`이다 (규칙 3 검증)
- `generateIdeas`만 실패하면 `mode`가 `{ profile: "llm", ideas: "rule" }`이고 `ideas.length > 0`이며 각 `referenceVideoId`가 `viral`에 있는 id다
- `extractProfile` 폴백 후에도 `searchViralCandidates`가 **규칙 기반 키워드로** 호출된다 (파이프라인이 끊기지 않는다)
- `viral`이 빈 배열이면(`searchViralCandidates`가 `[]` 또는 필터에 다 걸리는 후보만 반환) `generateIdeas`가 호출되지 않고 `ideas`가 빈 배열이다
- YouTube 실패는 여전히 404/422/429/502로 나간다 (기존 테스트 유지)

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
```

## 검증 절차

1. 위 AC 커맨드를 순서대로 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - 외부 API 호출이 여전히 `src/services/` 안에서만 일어나는가? (CLAUDE.md CRITICAL)
   - 라우트가 `process.env`를 직접 읽고 있지 않은가? (`isLlmEnabled()`를 통해서만 판단한다)
   - ARCHITECTURE.md의 파이프라인 순서가 유지되는가?
   - `mode` 값이 실제로 실행된 경로와 일치하는가?
   - Claude 실패 시 원본 에러 메시지가 응답 본문에 섞여 나가지 않는가? (서버 로그에만)
3. 결과에 따라 `phases/1-llm-fallback/index.json`의 step 4를 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- YouTube 실패까지 폴백하지 마라. 이유: 채널을 못 찾았거나 할당량이 끝난 상황에서 규칙 기반으로 만들 수 있는 게 없다. 사용자가 원인을 알아야 하는 에러다.
- 모듈 스코프 변수나 전역 캐시로 "LLM이 죽었다"를 요청 사이에 기억하지 마라. 이유: ADR-006(저장소·캐시 없음)과 CLAUDE.md의 무상태 원칙 위반이다. 실패 기억은 **요청 하나 안에서만** 유효하다.
- `ErrorCode`에 새 코드를 추가하지 마라. 이유: 폴백은 200 정상 응답이다. 에러 코드를 늘리면 `STATUS_BY_CODE`·`MESSAGE_BY_CODE`·클라이언트 처리까지 번진다.
- 폴백이 일어난 사실을 사용자에게 숨기지 마라. 이유: 규칙 기반 결과는 품질이 다르다. `mode`를 응답에 반드시 넣는다.
- `src/lib/`의 step 1·2 산출물을 수정하지 마라. 이유: 테스트까지 끝난 모듈이다. 필요한 동작이 없으면 라우트에서 해결하라.
- `src/components/`, `src/app/page.tsx`를 수정하지 마라. 이유: UI는 step 5의 범위다.
- 기존 테스트를 위에 적힌 3개 외에는 고치지 마라. 이유: 그 3개 말고 깨지는 게 있다면 폴백 로직이 기존 동작을 바꾼 것이다. 테스트가 아니라 구현을 고쳐라.
