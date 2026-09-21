# TubeNext

내 유튜브 채널을 분석하고, 같은 주제에서 **지금 터지고 있는 영상**을 근거로 다음에 만들 영상을 추천합니다.

채널 주제를 정하는 데 시간을 쓰는 1인 크리에이터를 위한 도구입니다. 로그인 없이 공개 데이터만 읽습니다.

## 무엇을 하나

1. **채널 분석** — `@핸들` 또는 채널 URL을 넣으면 최근 업로드 30개의 제목·조회수·길이·업로드 주기에서 채널 프로필(니치, 타깃, 주력 포맷, 평균 조회수, 검색 키워드)을 뽑아냅니다.
2. **바이럴 탐색** — 뽑아낸 키워드로 최근 30일 국내(`regionCode=KR`) 영상을 검색하고, **구독자 대비 조회수 배율**로 랭킹해 상위 영상을 보여줍니다. 조회수 절대값이 아니라 배율로 보기 때문에 작은 채널의 떡상 영상도 잡힙니다.
3. **다음 콘텐츠 추천** — 채널 프로필과 바이럴 영상 목록을 근거로 제목·훅·구성, 그리고 **어떤 바이럴 영상을 참고했는지**가 붙은 기획안 5개를 생성합니다.

## 기술 스택

- **Next.js 15** (App Router) / **React 19**
- **TypeScript** strict mode
- **Tailwind CSS v4**
- **Vitest** — 테스트 85개
- **YouTube Data API v3** (fetch 직접 호출), **Anthropic Claude** (`@anthropic-ai/sdk`)

## 시작하기

### 1. API 키 준비

```bash
cp .env.local.example .env.local
```

`.env.local`에 두 개의 키를 채웁니다. 발급 방법은 파일 안 주석에 적어뒀습니다.

| 키 | 발급처 | 비고 |
|---|---|---|
| `YOUTUBE_API_KEY` | [Google Cloud Console](https://console.cloud.google.com/apis/credentials) | 무료 할당량 10,000 units/day |
| `ANTHROPIC_API_KEY` | [Anthropic Console](https://console.anthropic.com/settings/keys) | |

두 키 모두 서버에서만 읽습니다. 클라이언트 번들에 들어가지 않습니다.

### 2. 실행

```bash
npm install
npm run dev      # 개발 서버
npm run test     # 테스트
npm run build    # 프로덕션 빌드
npm run lint     # ESLint
```

## 프로젝트 구조

```
src/
├── app/
│   ├── api/analyze/route.ts   # 유일한 API 라우트. 서비스 호출은 여기서만
│   ├── layout.tsx
│   └── page.tsx
├── components/                # AnalyzeForm, ChannelProfileCard, ViralVideoList, IdeaCard
├── lib/                       # 순수 계산 로직 — 네트워크·환경변수 의존 없음
│   ├── handle.ts              # @핸들 / URL 파싱
│   ├── stats.ts               # 채널 통계 집계
│   ├── viral.ts               # 구독자 대비 배율 랭킹
│   └── errors.ts
├── services/                  # 외부 API 래퍼 — 모든 외부 호출은 여기 안에서만
│   ├── youtube.ts
│   └── claude.ts
└── types/
```

### 아키텍처 규칙

- 모든 외부 API 호출은 `src/services/` 래퍼 안에서만. 컴포넌트나 `src/lib/`에서 직접 호출하지 않습니다.
- 서비스 호출은 `src/app/api/` 라우트 핸들러에서만 실행합니다.
- API 키는 서버에서 `process.env`로만 읽습니다. `NEXT_PUBLIC_` 접두사를 쓰지 않습니다.
- DB·인증·세션 없음. 모든 요청은 무상태로 처리합니다.

## 개발 방식

[Harness 프레임워크](https://github.com/jha0313/harness_framework)를 사용해 단계별로 개발했습니다. 각 단계의 계획과 산출물은 `phases/0-mvp/`에, 설계 문서는 `docs/`(PRD, ARCHITECTURE, ADR, UI_GUIDE)에 있습니다.

기능 구현은 **TDD**로 진행했습니다 — 테스트를 먼저 쓰고 통과하는 구현을 작성합니다. 테스트에서는 실제 네트워크를 타지 않고 `fetch`와 Anthropic SDK를 모두 mock합니다.

## MVP 제외 사항

로그인/OAuth, DB·히스토리 저장, 썸네일 이미지 분석, 댓글 분석, 경쟁 채널 추적, 업로드 스케줄링, 다중 채널 비교, 시계열 차트 대시보드.
