# 아키텍처

## 디렉토리 구조
```
src/
├── app/
│   ├── page.tsx              # 단일 화면 (분석 폼 + 결과)
│   ├── layout.tsx
│   ├── globals.css
│   └── api/analyze/route.ts  # POST /api/analyze — 전체 파이프라인 오케스트레이션
├── components/               # AnalyzeForm, ChannelProfileCard, ViralVideoList, IdeaCard
├── types/                    # index.ts — 도메인 타입 단일 소스
├── lib/                      # viral.ts (점수 계산), format.ts — 순수 함수만
└── services/
    ├── youtube.ts            # YouTube Data API v3 래퍼
    └── claude.ts             # Anthropic SDK 래퍼
```

## 패턴
- Server Components 기본. 상태와 이벤트가 필요한 폼/결과 영역만 Client Component(`"use client"`).
- 외부 API는 `services/`에서만 호출한다. `services/`는 입출력을 `types/`의 도메인 타입으로 정규화해서 반환하고, 외부 API의 원시 응답 형태를 바깥으로 흘리지 않는다.
- `lib/`는 순수 함수만 둔다. 네트워크·`process.env` 접근 금지 → 테스트가 mock 없이 돈다.
- 에러는 라우트 핸들러 경계에서 `{ error: string }` + 적절한 HTTP 상태로 변환한다. 서비스 내부 에러 메시지에 API 키를 절대 포함하지 않는다.

## 데이터 흐름
```
@handle 입력 (Client Component)
  → POST /api/analyze { handle }
      → services/youtube.getChannel(handle)        : 채널 메타 + 구독자 수
      → services/youtube.getRecentVideos(channel)  : 최근 업로드 30개 + 통계
      → services/claude.buildProfile(videos)       : 니치·타깃·포맷·검색 키워드 추출
      → services/youtube.searchViral(keywords)     : 최근 30일 KR 영상 + 업로더 구독자 수
      → lib/viral.rankViral(candidates)            : 배율 점수 계산 + 정렬 (순수)
      → services/claude.recommendIdeas(profile, viral) : 기획안 5개 생성
  → AnalyzeResponse(JSON) → UI 렌더
```

## 상태 관리
- 서버 상태: 없음(무상태). 매 요청마다 계산한다.
- 클라이언트 상태: `useState`로 `idle | loading | success | error` 4가지만 관리한다. 상태 관리 라이브러리 도입 금지.

## API 할당량 (설계 제약)
YouTube Data API v3 무료 할당량은 하루 10,000 units. `search.list`가 호출당 100 units로 가장 비싸므로 **검색 키워드는 최대 3개**로 제한한다. 1회 분석 예산: 채널/영상 조회 약 4 units + 검색 300 units ≈ 304 units (하루 약 30회 분석).
