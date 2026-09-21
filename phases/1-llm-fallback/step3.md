# Step 3: llm-toggle

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `CLAUDE.md` (CRITICAL: API 키는 서버에서 `process.env`로만 읽는다. `NEXT_PUBLIC_` 금지)
- `docs/ARCHITECTURE.md`
- `docs/ADR.md` (ADR-004: Claude 구조화 출력)
- `src/services/claude.ts` (**이 step에서 수정할 유일한 소스 파일**)
- `src/services/youtube.ts` (`apiKey()`가 왜 모듈 최상위가 아니라 함수 안에서 `process.env`를 읽는지)
- `tests/claude.test.ts` (**이 step에서 수정할 테스트 파일**. SDK mock 구조를 먼저 이해하라)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 배경

Anthropic 크레딧이 소진되거나 키가 없을 때 앱이 규칙 기반 경로로 내려가야 한다
(`src/lib/rule-profile.ts`, `src/lib/rule-ideas.ts` — step 1·2에서 이미 만들어져 있다).

키가 아예 없는데도 매 요청마다 Claude를 2번 호출해서 실패를 기다리는 건 낭비다.
**호출하기 전에 LLM을 쓸 수 있는 상태인지 판단하는 함수**가 필요하다. 이 step은 그 함수 하나만 추가한다.

`process.env`는 `src/lib/`에서 읽을 수 없다(ARCHITECTURE.md: `lib/`는 순수 함수). 그래서 이 함수는 `src/services/claude.ts`에 둔다.

## 작업

`src/services/claude.ts`에 **함수 하나를 추가**한다. 기존 `extractProfile`·`generateIdeas`의 동작은 건드리지 않는다.

```ts
/** Claude를 호출해볼 수 있는 상태인지. false면 호출을 건너뛰고 규칙 기반 경로로 간다. */
export function isLlmEnabled(): boolean;
```

판정 규칙 (순서대로):

1. `process.env.LLM_MODE`를 소문자로 바꿨을 때 `"off"`면 `false`. 수동 스위치다.
2. `process.env.ANTHROPIC_API_KEY`가 없거나 빈 문자열(공백만 있는 경우 포함)이면 `false`.
3. 그 외에는 `true`.

핵심 규칙:

- **`process.env`를 모듈 최상위에서 읽지 마라.** 반드시 함수 안에서 읽는다.
  이유: 최상위에서 읽으면 `next build`가 모듈을 평가하는 단계에서 값이 고정되고, 키가 없을 때 빌드가 깨진다. `src/services/youtube.ts`의 `apiKey()`가 같은 이유로 그렇게 되어 있다.
- **키 값 자체를 반환하거나 로그로 남기지 마라.** 이 함수는 `boolean`만 반환한다.
- `LLM_MODE`의 기본값은 "켜짐"이다. 값이 없으면 `true`로 취급한다. 이유: 기존 사용자가 아무것도 설정하지 않아도 지금까지와 똑같이 동작해야 한다.

## 테스트 — `tests/claude.test.ts`에 추가

**TDD다. 테스트를 먼저 쓰고, 통과하는 구현을 써라** (CLAUDE.md CRITICAL).

기존 `tests/claude.test.ts` 안에 `describe("isLlmEnabled", ...)` 블록을 추가한다. 새 파일을 만들지 마라.
환경변수는 `vi.stubEnv`로 다루고, 블록이 끝나면 `vi.unstubAllEnvs()`로 되돌려라.
**기존 `describe` 블록들의 `beforeEach`/`afterEach`(SDK mock, fetch 네트워크 가드)를 건드리지 마라.**

최소한 아래를 덮어라:

- `ANTHROPIC_API_KEY`가 있고 `LLM_MODE`가 없으면 `true`
- `LLM_MODE=off`면 키가 있어도 `false`
- `LLM_MODE=OFF`(대문자)도 `false` (대소문자 무시)
- `LLM_MODE=auto`면 `true`
- `ANTHROPIC_API_KEY`가 비어 있거나 공백뿐이면 `false`
- 호출해도 SDK의 `messages.parse` mock이 불리지 않는다 (판정만 하고 네트워크를 타지 않는다)

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
```

## 검증 절차

1. 위 AC 커맨드를 순서대로 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - `process.env` 읽기가 모듈 최상위가 아니라 함수 안에 있는가?
   - 키 값이 반환값·로그·에러 메시지 어디에도 노출되지 않는가? (CLAUDE.md CRITICAL)
   - `extractProfile`·`generateIdeas`의 기존 동작과 시그니처가 그대로인가?
   - 기존 `tests/claude.test.ts`의 테스트가 전부 그대로 통과하는가?
3. 결과에 따라 `phases/1-llm-fallback/index.json`의 step 3을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- `NEXT_PUBLIC_` 접두사가 붙은 환경변수를 만들거나 읽지 마라. 이유: 클라이언트 번들에 들어간다. CLAUDE.md CRITICAL 위반이다.
- 잔액·크레딧을 조회하는 별도 API를 호출하지 마라. 이유: 그 자체가 네트워크 왕복이고, 실패 시 어차피 규칙 경로로 내려가므로 사전 조회의 실익이 없다.
- 모듈 스코프에 `const ENABLED = ...` 같은 캐시 변수를 두지 마라. 이유: 빌드 시점에 값이 굳어 런타임 환경변수 변경이 반영되지 않는다.
- 이 step에서 `src/app/`, `src/lib/`, `src/types/`, `src/components/`를 수정하지 마라. 이유: 라우트 연결은 step 4의 범위다. 여기서 같이 고치면 두 step이 겹친다.
- `extractProfile`·`generateIdeas`의 에러 처리를 바꾸지 마라. 이유: 어떤 이유로 실패하든 라우트가 규칙 경로로 폴백할 것이므로, 에러를 세분화할 필요가 없다.
- 기존 테스트를 깨뜨리지 마라.
