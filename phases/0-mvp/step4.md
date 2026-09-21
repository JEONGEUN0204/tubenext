# Step 4: analyze-route

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `CLAUDE.md`
- `docs/ARCHITECTURE.md` (특히 "데이터 흐름" 절 — 이 step이 그 흐름을 그대로 구현한다)
- `docs/PRD.md`
- `src/types/index.ts` (step 1 — `AnalyzeResponse`, `ErrorCode`)
- `src/lib/handle.ts`, `src/lib/stats.ts`, `src/lib/viral.ts`, `src/lib/errors.ts` (step 1)
- `src/services/youtube.ts` (step 2)
- `src/services/claude.ts` (step 3)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업

`src/app/api/analyze/route.ts` 하나만 만든다. **새 로직을 작성하지 않는다.** step 1~3의 함수를 순서대로 엮고, 에러를 HTTP로 번역하는 것이 전부다.

```ts
export const maxDuration = 120   // Claude 호출 2회 + YouTube 호출로 1분 이상 걸릴 수 있다
export async function POST(req: Request): Promise<Response>
```

### 파이프라인 (이 순서 그대로)

```
요청 본문 { handle: string } 파싱
  |  handle이 문자열이 아니거나 비어 있음 -> BAD_INPUT
  v
parseChannelInput(handle)                     [lib/handle]
  |  null -> BAD_INPUT
  v
fetchChannel(query)                           [services/youtube]
  |  null -> CHANNEL_NOT_FOUND
  v
fetchRecentVideos(channel.uploadsPlaylistId)  [services/youtube]
  |  길이 < 5 -> TOO_FEW_VIDEOS
  v
summarizeUploads(videos)                      [lib/stats]
extractProfile(channel, videos)               [services/claude]
  |  -> 둘을 합쳐 ChannelProfile 완성
  v
searchViralCandidates(profile.searchKeywords) [services/youtube]
  v
rankViral(candidates, channel.id)             [lib/viral]
  v
generateIdeas(profile, viral)                 [services/claude]
  |  <- 이 호출만 try/catch로 감싼다. 실패하면 ideas = []
  v
200 { channel, profile, viral, ideas }
```

`generateIdeas`만 실패를 삼키는 이유: 여기까지 오면 YouTube 할당량 306 units를 이미 썼다. 기획안 생성 하나가 실패했다고 프로필과 바이럴 결과까지 버리면 사용자는 할당량만 날린다. 그 외 단계의 실패는 전부 밖으로 던진다.

### 에러 -> HTTP 매핑

라우트 전체를 try/catch로 감싸고, `AppError`의 `code`로 상태 코드를 정한다.

| code | HTTP | 응답 본문 |
|---|---|---|
| `BAD_INPUT` | 400 | `{ error, code }` |
| `CHANNEL_NOT_FOUND` | 404 | `{ error, code }` |
| `TOO_FEW_VIDEOS` | 422 | `{ error, code }` |
| `QUOTA_EXCEEDED` | 429 | `{ error, code }` |
| `UPSTREAM_ERROR` | 502 | `{ error, code }` |
| `AppError`가 아닌 예외 | 500 | `{ error: "분석 중 오류가 발생했습니다.", code: "UPSTREAM_ERROR" }` |

사용자에게 보일 한국어 메시지:

- `BAD_INPUT` — "채널 URL의 @핸들 주소를 넣어주세요."
- `CHANNEL_NOT_FOUND` — "채널을 찾을 수 없습니다. @핸들을 확인해주세요."
- `TOO_FEW_VIDEOS` — "분석할 영상이 부족합니다. (최소 5개 필요)"
- `QUOTA_EXCEEDED` — "오늘 YouTube API 할당량을 다 썼습니다. 내일 다시 시도해주세요."
- `UPSTREAM_ERROR` — "분석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요."

**알 수 없는 예외의 원본 메시지를 응답 본문에 넣지 마라.** 이유: API 키나 내부 URL이 섞여 브라우저로 나간다. 원본은 `console.error`로만 남긴다.

### 테스트 — `tests/analyze-route.test.ts`

`vi.mock`으로 `@/services/youtube`와 `@/services/claude`를 mock한다. `lib/`는 mock하지 않는다(순수 함수라 실제로 돌려도 된다). 최소 아래를 덮는다:

- 정상 흐름 -> 200, 응답에 `channel` / `profile` / `viral` / `ideas` 4개 키가 있는지
- `fetchChannel`이 null -> 404 + `code: "CHANNEL_NOT_FOUND"`
- 영상 4개 -> 422 + `code: "TOO_FEW_VIDEOS"`
- `searchViralCandidates`가 `AppError("QUOTA_EXCEEDED")` -> 429
- **`generateIdeas`만 throw -> 200이고 `ideas`가 빈 배열**인지 (부분 실패 폴백 회귀 테스트)
- 본문에 `handle`이 없음 -> 400

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
```

## 검증 절차

1. 위 AC 커맨드를 순서대로 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - 라우트에 계산 로직이 새로 생기지 않았는가? (전부 lib/services 호출이어야 한다)
   - `AnalyzeResponse` 타입과 실제 응답 형태가 일치하는가?
   - 에러 응답에 원본 예외 메시지가 섞이지 않는가?
   - ARCHITECTURE.md의 데이터 흐름 순서와 동일한가?
3. 결과에 따라 `phases/0-mvp/index.json`의 step 4를 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- `src/lib/`나 `src/services/`를 수정하지 마라. 이유: 이 step은 조립만 한다. 그쪽을 고쳐야 한다면 설계가 어긋난 것이니 `blocked`로 기록하라.
- 새 계산 로직(점수, 정렬, 통계)을 라우트에 작성하지 마라. 이유: 로직이 두 곳에 생겨 step 1의 테스트가 무의미해진다.
- 캐싱, rate limit, 인증 미들웨어를 넣지 마라. 이유: MVP다. (ADR-003, ADR-006)
- GET 핸들러나 다른 라우트를 추가하지 마라. 이유: 엔드포인트는 `POST /api/analyze` 하나다.
- 실제 네트워크를 타는 테스트를 쓰지 마라. 이유: 테스트 1회당 실제 할당량 306 units가 소모된다.
- `src/components/`나 `src/app/page.tsx`를 건드리지 마라. 이유: step 5의 범위다.
- 기존 테스트를 깨뜨리지 마라.
