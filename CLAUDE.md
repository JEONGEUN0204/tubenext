# 프로젝트: TubeNext

내 유튜브 채널을 분석하고, 같은 주제에서 지금 바이럴한 영상을 찾아 다음 콘텐츠를 추천하는 MVP.

## 기술 스택
- Next.js 15 (App Router)
- TypeScript strict mode
- Tailwind CSS v4
- Vitest (단위 테스트)
- 외부 API: YouTube Data API v3 (fetch 직접 호출), Anthropic Claude (@anthropic-ai/sdk)

## 아키텍처 규칙
- CRITICAL: 모든 외부 API 호출(YouTube, Anthropic)은 `src/services/` 래퍼 안에서만 한다. 컴포넌트나 `src/lib/`에서 직접 호출 금지.
- CRITICAL: 서비스 호출은 `src/app/api/` 라우트 핸들러에서만 실행한다. 클라이언트 컴포넌트에서 외부 API를 직접 호출하지 말 것.
- CRITICAL: API 키는 서버에서 `process.env`로만 읽는다. `NEXT_PUBLIC_` 접두사를 붙이거나 클라이언트 번들로 넘기지 말 것.
- 순수 계산 로직(점수 계산, 포맷팅)은 `src/lib/`에 두고 네트워크·환경변수에 의존하지 않게 한다.
- 컴포넌트는 `src/components/`, 타입은 `src/types/`에 분리한다.
- DB·인증·세션 없음. 모든 요청은 무상태로 처리한다.

## 개발 프로세스
- CRITICAL: 새 기능 구현 시 반드시 테스트를 먼저 작성하고, 테스트가 통과하는 구현을 작성할 것 (TDD)
- CRITICAL: 테스트에서 실제 네트워크 호출 금지. `fetch`와 Anthropic SDK는 반드시 mock한다.
- 커밋 메시지는 conventional commits 형식을 따를 것 (feat:, fix:, docs:, refactor:)

## 명령어
npm run dev      # 개발 서버
npm run build    # 프로덕션 빌드
npm run lint     # ESLint
npm run test     # 테스트 (vitest run)
