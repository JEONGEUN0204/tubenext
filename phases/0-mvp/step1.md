# Step 1: core-types

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `CLAUDE.md`
- `docs/ARCHITECTURE.md`
- `docs/ADR.md` (특히 ADR-005: 바이럴 지표)
- `package.json`, `tsconfig.json`, `vitest.config.ts` (step 0 산출물)
- `tests/smoke.test.ts` (step 0 산출물 — 테스트 작성 스타일 참고)

## 작업

도메인 타입과 **순수 함수**만 만든다. 이 step의 모든 코드는 네트워크와 `process.env`를 모른다.

CLAUDE.md의 TDD 규칙에 따라 **각 파일마다 테스트를 먼저 쓰고, 그 테스트를 통과시키는 구현을 쓴다.**

### 1. `src/types/index.ts`

앱 전체가 공유하는 타입의 단일 소스. 아래 타입을 export한다.

```ts
export type ChannelQuery = { by: "handle"; value: string } | { by: "id"; value: string }

export interface ChannelSummary {
  id: string
  title: string
  subscriberCount: number
  thumbnailUrl: string
  uploadsPlaylistId: string
}

export interface VideoStat {
  id: string
  title: string
  publishedAt: string      // ISO 8601
  viewCount: number
  durationSec: number
}

export interface UploadStats {
  avgViews: number
  medianViews: number
  uploadIntervalDays: number
  avgDurationSec: number
  topPerformers: string[]  // 조회수 상위 3개 제목
}

export interface ProfileCore {         // Claude가 추출하는 부분
  niche: string
  audience: string
  formats: string[]
  searchKeywords: string[]             // 정확히 3개
}

export type ChannelProfile = ProfileCore & UploadStats

export interface ViralCandidate {      // YouTube에서 긁어온 원본
  id: string
  title: string
  channelId: string
  channelTitle: string
  subscriberCount: number
  viewCount: number
  publishedAt: string
  thumbnailUrl: string
  durationSec: number
}

export interface ViralVideo extends ViralCandidate {
  multiple: number        // viewCount / subscriberCount
  viewsPerDay: number
  isShort: boolean        // durationSec < 60
}

export interface ContentIdea {
  title: string
  hook: string
  outline: string[]
  whyNow: string
  referenceVideoId: string
  estimatedMinutes: [number, number]
}

export interface AnalyzeResponse {
  channel: ChannelSummary
  profile: ChannelProfile
  viral: ViralVideo[]
  ideas: ContentIdea[]     // 생성 실패 시 빈 배열
}

export type ErrorCode =
  | "CHANNEL_NOT_FOUND" | "TOO_FEW_VIDEOS" | "QUOTA_EXCEEDED" | "UPSTREAM_ERROR" | "BAD_INPUT"
```

### 2. `src/lib/errors.ts`

```ts
export class AppError extends Error {
  constructor(public code: ErrorCode, message: string)
}
```

10줄 내외로 끝낸다. 에러 계층이나 팩토리 함수를 만들지 마라.

### 3. `src/lib/handle.ts`

```ts
export function parseChannelInput(raw: string): ChannelQuery | null
```

동작 (테스트로 전부 고정할 것):

| 입력 | 결과 |
|---|---|
| `"@mychannel"` | `{ by: "handle", value: "@mychannel" }` |
| `"mychannel"` | `{ by: "handle", value: "@mychannel" }` |
| `"youtube.com/@mychannel"` | `{ by: "handle", value: "@mychannel" }` |
| `"https://www.youtube.com/@mychannel/videos"` | `{ by: "handle", value: "@mychannel" }` |
| `"https://youtube.com/channel/UCabc123"` | `{ by: "id", value: "UCabc123" }` |
| `"  @mychannel  "` | `{ by: "handle", value: "@mychannel" }` (trim) |
| `"youtube.com/c/legacy"` | `null` |
| `"youtube.com/user/legacy"` | `null` |
| `""` / `"   "` | `null` |

### 4. `src/lib/stats.ts`

```ts
export function parseDurationSec(iso8601: string): number
export function summarizeUploads(videos: VideoStat[]): UploadStats
```

`parseDurationSec` — ISO 8601 duration을 초로. `"PT6M12S"` → `372`, `"PT1H2M3S"` → `3723`, `"PT45S"` → `45`, 파싱 불가 → `0`.

`summarizeUploads` — 전부 정수로 반올림.
- `avgViews`: 평균 조회수
- `medianViews`: 중앙값. 개수가 짝수면 가운데 두 값의 평균
- `uploadIntervalDays`: (가장 최근 업로드 - 가장 오래된 업로드) / (개수 - 1), 일 단위, 소수 1자리. 영상이 1개면 `0`
- `avgDurationSec`: 평균 길이
- `topPerformers`: 조회수 내림차순 상위 3개의 **제목**. 3개 미만이면 있는 만큼

빈 배열이 들어오면 모든 수치 `0`, `topPerformers: []`를 반환한다. 예외를 던지지 마라.

### 5. `src/lib/viral.ts`

```ts
export function rankViral(candidates: ViralCandidate[], myChannelId: string): ViralVideo[]
```

순서대로 수행한다:

1. **중복 제거** — 같은 `id`는 첫 번째만 남긴다 (키워드 3개 검색 결과가 겹친다)
2. **제외** — 아래 중 하나라도 해당하면 버린다
   - `viewCount < 10_000` (표본 부족)
   - `subscriberCount < 100` (배율 뻥튀기 방지)
   - `channelId === myChannelId` (내 채널 영상)
3. **점수 계산**
   - `multiple = viewCount / subscriberCount`, 소수 1자리 반올림
   - `viewsPerDay = viewCount / max(1, 오늘까지 경과일)`, 정수 반올림
   - `isShort = durationSec < 60`
4. **정렬** — `multiple` 내림차순
5. **상한** — 상위 8개만 반환

임계값 `10_000`, `100`, `8`은 파일 상단에 named constant로 둔다.

시간 의존 테스트는 `vi.setSystemTime()`으로 고정하라. 이유: `viewsPerDay`가 실행 날짜에 따라 변하면 테스트가 내일 깨진다.

### 6. 테스트

`tests/handle.test.ts`, `tests/stats.test.ts`, `tests/viral.test.ts` 3개를 만든다. 위 표와 규칙의 모든 케이스를 덮는다.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
```

## 검증 절차

1. 위 AC 커맨드를 순서대로 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - `src/lib/`의 어떤 파일도 `fetch`, `process.env`, `@anthropic-ai/sdk`를 import하지 않는가?
   - 테스트가 mock 없이 도는가?
   - ARCHITECTURE.md의 의존 방향(`types ← lib`)을 지키는가?
   - CLAUDE.md CRITICAL 규칙(TDD)을 지켰는가?
3. 결과에 따라 `phases/0-mvp/index.json`의 step 1을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- `src/services/`, `src/components/`, `src/app/api/`에 파일을 만들지 마라. 이유: step 2~5의 작업 범위다.
- `lib/`에서 `fetch`나 `process.env`를 쓰지 마라. 이유: 순수 함수여야 mock 없이 테스트된다. 이 경계가 무너지면 step 2 이후 테스트가 전부 mock 지옥이 된다.
- zod 스키마를 `types/`에 만들지 마라. 이유: zod는 step 3의 Claude 구조화 출력에서만 쓴다. 여기서 만들면 타입 정의가 두 벌이 된다.
- 유효성 검증 유틸, 제네릭 헬퍼, 배럴 파일(`index.ts` re-export)을 추가하지 마라. 이유: MVP다. 지금 화면에 보이는 기능에 직접 기여하지 않는 코드는 만들지 않는다.
- 기존 테스트를 깨뜨리지 마라.
