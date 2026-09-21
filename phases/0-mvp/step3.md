# Step 3: claude-service

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `CLAUDE.md`
- `docs/ARCHITECTURE.md`
- `docs/ADR.md` (ADR-004: Claude 구조화 출력 사용 이유)
- `docs/PRD.md` (기획안에 뭐가 들어가야 하는지)
- `src/types/index.ts` (step 1 산출물 — `ProfileCore`, `ContentIdea`, `ViralVideo`)
- `src/lib/errors.ts` (step 1 산출물 — `AppError`)
- `src/services/youtube.ts` (step 2 산출물 — 서비스 작성 스타일, 에러 처리 방식을 맞춘다)
- `tests/youtube.test.ts` (step 2 산출물 — mock 테스트 스타일 참고)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업

`src/services/claude.ts` 하나만 만든다. Anthropic SDK의 **구조화 출력**으로 JSON을 받는다.

### SDK 사용법 (이 형태를 그대로 따를 것)

```ts
import Anthropic from "@anthropic-ai/sdk"
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"
import { z } from "zod"

const response = await client.messages.parse({
  model: "claude-opus-5",
  max_tokens: 16000,
  system: "...",
  messages: [{ role: "user", content: "..." }],
  output_config: {
    effort: "low",                        // 함수마다 지정값 다름. 아래 참조
    format: zodOutputFormat(SomeSchema),
  },
})

// parsed_output은 파싱 실패 시 null이다. 반드시 가드하라.
if (!response.parsed_output) throw new AppError("UPSTREAM_ERROR", "...")
```

- 모델 ID는 **정확히 `"claude-opus-5"`**. 날짜 접미사를 붙이지 마라.
- `thinking` 파라미터를 넘기지 마라. 이 모델은 생략 시 adaptive thinking이 기본이고, `budget_tokens`는 400 에러다.
- 클라이언트는 `new Anthropic()`로 만든다. `ANTHROPIC_API_KEY`를 SDK가 알아서 읽는다. 키를 코드에 하드코딩하거나 인자로 넘기지 마라.
- 클라이언트 생성도 **함수 안에서** 한다. 모듈 최상위에서 만들면 키가 없을 때 `next build`가 깨진다.

### 함수 1 — `extractProfile`

```ts
export async function extractProfile(
  channel: ChannelSummary,
  videos: VideoStat[],
): Promise<ProfileCore>
```

- `output_config.effort: "low"` — 단순 추출 작업이다. 지연과 비용을 줄인다.
- 입력 프롬프트에 채널명, 구독자 수, 그리고 영상 30개의 **제목 / 조회수 / 길이(초)** 를 넣는다.
- zod 스키마:

```ts
z.object({
  niche: z.string(),          // 예: "1인가구 자취요리 · 저예산 간편식"
  audience: z.string(),       // 예: "요리 안 해본 20~30대 자취생"
  formats: z.array(z.string()),      // 2~4개. 예: ["5분 내외", "조리과정 풀샷"]
  searchKeywords: z.array(z.string()), // 정확히 3개
})
```

- `searchKeywords`는 **YouTube 검색창에 그대로 칠 한국어 키워드 3개**여야 한다. 시스템 프롬프트에 명시하라: 채널명이나 고유명사를 넣지 말고, 이 채널과 같은 주제의 다른 영상이 검색될 일반 키워드일 것.
- 반환 전에 `searchKeywords`를 `slice(0, 3)`으로 자른다. 이유: 모델이 4개를 주면 step 2에서 검색이 1회 더 돌아 할당량 100 units가 더 나간다.

### 함수 2 — `generateIdeas`

```ts
export async function generateIdeas(
  profile: ChannelProfile,
  viral: ViralVideo[],
): Promise<ContentIdea[]>
```

- `output_config.effort: "medium"` — 실제 기획을 쓰는 작업이다.
- 입력 프롬프트에 채널 프로필 전체 + 바이럴 영상 8개의 **videoId / 제목 / 배율 / 채널 구독자 수**를 넣는다.
- zod 스키마: `ContentIdea` 5개 배열.

```ts
z.object({
  ideas: z.array(z.object({
    title: z.string(),
    hook: z.string(),
    outline: z.array(z.string()),
    whyNow: z.string(),
    referenceVideoId: z.string(),
    estimatedMinutes: z.tuple([z.number(), z.number()]),
  })),
})
```

- 시스템 프롬프트의 핵심 규칙:
  - `title`은 **그대로 영상 제목으로 쓸 수 있는 수준**이어야 한다. 기획서 항목명이 아니다.
  - `hook`은 영상 첫 5초에 말할 한 문장이다.
  - `outline`은 3~5개의 촬영 단계다.
  - `whyNow`는 **제시된 바이럴 영상 중 하나를 근거로 지목**해야 한다.
  - `referenceVideoId`는 **반드시 입력으로 준 영상 id 중 하나**여야 한다.
  - 이 채널이 실제로 찍을 수 있는 포맷·길이 안에서 제안한다.
- 반환 전 검증: `referenceVideoId`가 입력 목록에 없으면 `viral[0].id`로 교체한다. 이유: UI에서 참고 영상 링크가 깨진다.
- 반환 전 `slice(0, 5)`.

### 에러 처리

- `parsed_output`이 `null`이거나 SDK가 예외를 던지면 `new AppError("UPSTREAM_ERROR", "콘텐츠 분석에 실패했습니다.")`로 변환한다.
- 원본 에러 메시지를 그대로 밖으로 내보내지 마라. 이유: API 키나 요청 본문이 메시지에 섞여 클라이언트로 나갈 수 있다.

### 테스트 — `tests/claude.test.ts`

`vi.mock("@anthropic-ai/sdk")`로 SDK를 mock한다. default export가 클래스이고 `client.messages.parse`가 호출되는 구조다. 최소 아래를 덮는다:

- `extractProfile`: mock이 `searchKeywords` 4개를 반환해도 **결과가 3개로 잘리는지**
- `generateIdeas`: mock이 입력에 없는 `referenceVideoId`를 반환하면 **`viral[0].id`로 교체되는지**
- `generateIdeas`: mock이 기획안 6개를 반환해도 결과가 5개인지
- `parsed_output: null` → `AppError("UPSTREAM_ERROR")`
- 호출 인자 검증: `model`이 `"claude-opus-5"`인지

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
```

## 검증 절차

1. 위 AC 커맨드를 순서대로 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - 모델 ID가 정확히 `"claude-opus-5"`인가?
   - `new Anthropic()` 생성이 함수 안에서 일어나는가?
   - 테스트에서 실제 API 호출이 일어나지 않는가? (CLAUDE.md CRITICAL)
   - 에러 메시지에 원본 SDK 에러나 키가 섞이지 않는가?
3. 결과에 따라 `phases/0-mvp/index.json`의 step 3을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- `thinking` 파라미터나 `budget_tokens`를 넘기지 마라. 이유: 이 모델에서 `budget_tokens`는 400 에러이고, thinking은 생략 시 이미 adaptive로 동작한다.
- 모델 ID에 날짜 접미사(`claude-opus-5-2026xxxx`)를 붙이지 마라. 이유: 존재하지 않는 모델 ID다.
- assistant 메시지 prefill을 쓰지 마라. 이유: 이 모델에서 400 에러다.
- 직접 JSON 문자열을 파싱하지 마라 (`JSON.parse(text)`). 이유: 구조화 출력을 쓰는 이유가 그 파싱을 없애는 것이다.
- 프롬프트 템플릿 엔진이나 프롬프트 파일 분리를 하지 마라. 이유: 프롬프트가 2개뿐이다. 함수 안 문자열로 충분하다.
- 스트리밍을 쓰지 마라. 이유: 라우트가 JSON 한 번에 응답한다. 스트리밍은 UI까지 같이 바꿔야 하는 범위 확장이다.
- `src/lib/`, `src/components/`, `src/app/`, `src/services/youtube.ts`를 수정하지 마라. 이유: 이 step의 범위는 `src/services/claude.ts`와 그 테스트뿐이다.
- 기존 테스트를 깨뜨리지 마라.
