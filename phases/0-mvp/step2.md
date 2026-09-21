# Step 2: youtube-service

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `CLAUDE.md`
- `docs/ARCHITECTURE.md` (특히 "API 할당량" 절)
- `docs/ADR.md` (ADR-002: SDK 없이 fetch 직접 호출)
- `src/types/index.ts` (step 1 산출물 — 여기 정의된 타입을 그대로 쓴다)
- `src/lib/errors.ts`, `src/lib/stats.ts` (step 1 산출물 — `AppError`, `parseDurationSec` 재사용)
- `tests/viral.test.ts` (step 1 산출물 — 테스트 스타일 참고)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업

`src/services/youtube.ts` 하나만 만든다. YouTube Data API v3를 `fetch`로 직접 호출하고, 응답을 step 1의 도메인 타입으로 정규화해서 반환한다.

베이스 URL: `https://www.googleapis.com/youtube/v3`

### 함수 1 — `fetchChannel`

```ts
export async function fetchChannel(q: ChannelQuery): Promise<ChannelSummary | null>
```

- `GET /channels?part=snippet,statistics,contentDetails` + (`forHandle=@xxx` 또는 `id=UCxxx`)
- `items`가 비어 있으면 `null` 반환 (예외를 던지지 않는다 — 라우트가 404로 매핑한다)
- `uploadsPlaylistId`는 `contentDetails.relatedPlaylists.uploads`
- `subscriberCount`는 문자열로 오므로 `Number()` 변환. `hiddenSubscriberCount`인 채널은 `0`
- 비용: 1 unit

### 함수 2 — `fetchRecentVideos`

```ts
export async function fetchRecentVideos(uploadsPlaylistId: string): Promise<VideoStat[]>
```

- `GET /playlistItems?part=contentDetails&playlistId=...&maxResults=30` → videoId 배열
- `GET /videos?part=snippet,statistics,contentDetails&id=<콤마로 묶은 30개>` → 통계
- `durationSec`는 `contentDetails.duration`을 step 1의 `parseDurationSec`로 변환
- 업로드 최신순으로 반환
- 비용: 2 units

### 함수 3 — `searchViralCandidates`

```ts
export async function searchViralCandidates(keywords: string[]): Promise<ViralCandidate[]>
```

1. `keywords.slice(0, 3)` — **반드시 3개로 자른다.** 이유: `search.list`는 호출당 100 units이고 일일 무료 할당량이 10,000이다. 4개 이상이면 하루 분석 횟수가 무너진다.
2. 키워드마다 `GET /search?part=snippet&q=<kw>&type=video&order=viewCount&regionCode=KR&relevanceLanguage=ko&publishedAfter=<30일 전 ISO>&maxResults=15`
3. 모든 videoId를 모아 **중복 제거**
4. `GET /videos?part=snippet,statistics,contentDetails&id=...` — id는 50개씩 끊어서 호출
5. 등장한 channelId를 **중복 제거**한 뒤 `GET /channels?part=statistics&id=...` — 50개씩 끊어서 호출
6. 영상과 채널 구독자 수를 합쳐 `ViralCandidate[]` 반환

- 점수 계산·필터링·정렬은 여기서 하지 않는다. step 1의 `rankViral`이 담당한다.
- 비용: 300 + 1 + 1 units

### 공통 규칙

**API 키 접근**

```ts
function apiKey(): string {
  const key = process.env.YOUTUBE_API_KEY
  if (!key) throw new AppError("UPSTREAM_ERROR", "YOUTUBE_API_KEY가 설정되지 않았습니다.")
  return key
}
```

- 반드시 **함수 안에서** 읽는다. 모듈 최상위에서 `const KEY = process.env.X`로 읽지 마라. 이유: `next build` 시점에 모듈이 평가되면서 빌드가 깨진다.

**에러 매핑** — 모든 fetch 응답에 대해:

| 응답 | 던질 것 |
|---|---|
| HTTP 403 | `new AppError("QUOTA_EXCEEDED", "YouTube API 일일 할당량을 초과했습니다.")` |
| 그 외 non-2xx | `new AppError("UPSTREAM_ERROR", "YouTube API 호출에 실패했습니다. (status)")` |

- 에러 메시지에 **API 키나 전체 URL을 절대 넣지 마라.** 이유: 라우트가 이 메시지를 그대로 클라이언트에 내려보내므로 키가 브라우저로 새어나간다.

### 테스트 — `tests/youtube.test.ts`

`vi.stubGlobal("fetch", vi.fn())`으로 `fetch`를 mock한다. 최소 아래를 덮는다:

- `fetchChannel`: 정상 응답 → `ChannelSummary` 정규화 확인 / `items: []` → `null`
- `fetchRecentVideos`: playlistItems → videos 두 번 호출되는지, `durationSec` 변환 확인
- `searchViralCandidates`: 키워드 5개를 넣어도 **`search` 호출이 정확히 3번**인지 확인 (할당량 보호 회귀 테스트)
- 403 응답 → `AppError`의 `code`가 `"QUOTA_EXCEEDED"`인지

테스트에서 `process.env.YOUTUBE_API_KEY`는 `vi.stubEnv`로 더미 값을 넣는다.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
```

## 검증 절차

1. 위 AC 커맨드를 순서대로 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - `googleapis` 패키지를 설치하지 않고 `fetch`만 썼는가? (ADR-002)
   - `process.env`를 모듈 최상위가 아니라 함수 안에서 읽는가?
   - 에러 메시지에 API 키가 포함되지 않는가?
   - 테스트에서 실제 네트워크 호출이 일어나지 않는가? (CLAUDE.md CRITICAL)
3. 결과에 따라 `phases/0-mvp/index.json`의 step 2를 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- `googleapis` 패키지를 설치하지 마라. 이유: 쓰는 엔드포인트가 4개뿐인데 수십 MB 의존성이 붙는다. (ADR-002)
- 실제 네트워크를 호출하는 테스트를 쓰지 마라. 이유: 테스트를 돌릴 때마다 실제 할당량이 소모되고, 오프라인에서 깨진다.
- 재시도·백오프·캐싱·rate limit 로직을 넣지 마라. 이유: MVP다. 실패하면 사용자가 버튼을 다시 누른다.
- `ApiClient` 클래스나 제네릭 요청 래퍼를 만들지 마라. 이유: `export async function` 3개로 끝나는 일이다.
- `src/lib/`, `src/components/`, `src/app/`을 수정하지 마라. 이유: 이 step의 범위는 `src/services/youtube.ts`와 그 테스트뿐이다.
- 점수 계산이나 정렬을 `services/`에서 하지 마라. 이유: step 1의 `rankViral`과 로직이 두 벌이 된다.
- 기존 테스트를 깨뜨리지 마라.
