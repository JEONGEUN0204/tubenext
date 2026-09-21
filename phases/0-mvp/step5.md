# Step 5: result-ui

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `CLAUDE.md`
- `docs/UI_GUIDE.md` — **이 step의 기준 문서다. 색상·간격·타이포·금지 패턴을 전부 여기서 가져온다.**
- `docs/PRD.md` (디자인 방향)
- `docs/ARCHITECTURE.md` (상태 관리 규칙)
- `src/types/index.ts` (step 1 — 렌더할 데이터 모양)
- `src/app/api/analyze/route.ts` (step 4 — 요청/응답 계약, 에러 코드)
- `src/app/layout.tsx`, `src/app/globals.css`, `src/app/page.tsx` (step 0 — page.tsx는 교체 대상)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업

화면을 완성한다. 파일은 5개다.

### 1. `src/app/page.tsx` — 상태 머신 + fetch

- 파일 첫 줄 `"use client"`.
- 상태는 정확히 4개: `idle` / `loading` / `success` / `error`. `useState`만 쓴다.
- 제출 시 `POST /api/analyze`에 `{ handle }`을 보낸다. 응답이 non-2xx면 본문의 `error` 문자열을 에러 상태로 저장한다.
- **로딩 라벨** — 아래 5개를 배열로 두고 `useEffect` + `setInterval`로 6초마다 교체한다. 마지막 라벨에 도달하면 멈추고 고정한다.

```
"채널 찾는 중"
"최근 영상 읽는 중"
"콘텐츠 정체성 파악 중"
"바이럴 영상 찾는 중"
"기획안 쓰는 중"
```

  이것은 진행률이 아니라 **수행 순서 안내**다. 퍼센트나 프로그레스 바를 만들지 마라.
  완료·언마운트 시 `clearInterval`을 반드시 호출한다.

- 로딩 중에는 결과 영역에 `animate-pulse` 스켈레톤 카드 3개를 깐다.
- 결과는 세로로 쌓는다: 채널 프로필 → 바이럴 영상 → 기획안. (UI_GUIDE 레이아웃)
- `ideas`가 빈 배열이면 기획안 섹션에 한 줄: "기획안 생성에 실패했습니다. 다시 시도해주세요."
- `viral`이 3개 미만이면 바이럴 섹션 위에 한 줄: "이 주제는 최근 30일 표본이 적습니다."

### 2. `src/components/AnalyzeForm.tsx`

- 입력 1개 + 버튼 1개. placeholder는 `@핸들 또는 채널 URL`, 아래 보조 텍스트는 `예: @mychannel · youtube.com/@mychannel`.
- Enter 키로도 제출된다.
- 로딩 중에는 입력과 버튼을 `disabled` 처리한다.
- 에러 문자열이 있으면 입력창 바로 아래 한 줄로 표시한다(UI_GUIDE의 에러 색). **입력값은 지우지 않는다.**

### 3. `src/components/ChannelProfileCard.tsx`

표시 항목: 채널명, 구독자 수, 니치, 타깃, 주력 포맷, 지표 4칸(평균 조회 / 중앙값 / 업로드 주기 / 평균 길이), 잘 된 영상 3개, 검색 키워드 3개.

- 큰 수는 한국어 단위로 축약한다: `42000` → `4.2만`, `124000` → `12.4만`. 축약 함수는 이 컴포넌트 파일 안에 둔다. 다른 곳에서 쓰지 않으므로 `lib/`로 빼지 마라.
- 길이는 `mm:ss`로 표시한다.
- 숫자에는 `tabular-nums`를 적용한다.

### 4. `src/components/ViralVideoList.tsx`

영상당 한 줄: 썸네일, 제목, 채널명, 구독자 수, 조회수, **배율**, 일 평균 조회수.

- **배율이 이 리스트의 주인공이다.** UI_GUIDE의 강조색(`#eab308`)으로 `114배` 형태로 표시한다.
- `isShort`가 true면 제목 옆에 `Shorts` 텍스트 라벨을 둔다. 이유: 6분짜리 영상을 만드는 채널에 60초 영상을 근거로 들이대면 추천이 어긋나므로 사용자가 구분할 수 있어야 한다.
- 제목 클릭 시 `https://www.youtube.com/watch?v={id}`를 새 탭으로 연다.
- 썸네일은 API가 준 URL을 `<img>`로 그대로 쓴다.

### 5. `src/components/IdeaCard.tsx`

기획안 1개: 번호, 제목, 훅, 구성(`outline` 목록), 왜 지금(`whyNow`), 참고 영상 링크, 예상 길이.

- **복사 버튼** — `navigator.clipboard.writeText()`로 제목·훅·구성을 평문으로 복사한다. 복사 후 2초간 버튼 텍스트를 `복사됨`으로 바꾼다.
- 참고 영상 링크는 `referenceVideoId`로 YouTube URL을 만들어 새 탭으로 연다.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
```

세 개 모두 exit code 0이어야 한다. step 5는 새 테스트를 추가하지 않는다 (아래 금지사항 참조).

## 검증 절차

1. 위 AC 커맨드를 순서대로 실행한다.
2. UI_GUIDE 체크리스트를 확인한다 — 아래가 코드에 하나도 없어야 한다:
   - `backdrop-blur` / `backdrop-filter`
   - 그라데이션 텍스트, 배경 gradient orb (`blur-3xl` 원형)
   - 보라·인디고 계열 색상 (`purple`, `indigo`, `violet`)
   - 글로우 `box-shadow` 애니메이션
   - 이모지 아이콘
   - "Powered by AI" 류 배지
3. 아키텍처 체크리스트를 확인한다:
   - 컴포넌트에서 `@/services/*`를 import하지 않는가? (CLAUDE.md CRITICAL — UI는 `/api/analyze`만 안다)
   - `process.env`나 API 키가 클라이언트 코드에 없는가?
   - 상태 관리 라이브러리 없이 `useState`만 썼는가?
4. 결과에 따라 `phases/0-mvp/index.json`의 step 5를 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- `@/services/youtube`나 `@/services/claude`를 컴포넌트에서 import하지 마라. 이유: API 키가 클라이언트 번들에 포함된다. (CLAUDE.md CRITICAL)
- `next/image`를 쓰지 마라. 이유: 외부 도메인(`i.ytimg.com`)을 `next.config.ts`에 등록해야 하고, 누락되면 썸네일이 통째로 렌더링 실패한다. MVP에서는 `<img>`로 충분하다.
- 컴포넌트 테스트를 추가하지 마라. `@testing-library/react`와 `jsdom`을 설치하지 마라. 이유: 설정과 의존성이 테스트 대상 코드보다 커진다. UI 검증은 `npm run dev`로 직접 본다.
- zustand·redux·context·react-query·SWR을 추가하지 마라. 이유: 상태가 4개고 요청이 1종류다. (ARCHITECTURE.md 상태 관리)
- 진행률 퍼센트나 프로그레스 바를 만들지 마라. 이유: 서버가 진행률을 주지 않으므로 가짜 숫자가 된다.
- 라우팅·탭·모달·토스트 라이브러리를 추가하지 마라. 이유: 화면이 하나다.
- 다크/라이트 테마 토글을 만들지 마라. 이유: 다크 고정이다. (PRD 디자인)
- `src/lib/`, `src/services/`, `src/app/api/`를 수정하지 마라. 이유: step 1~4에서 완료됐다. 고쳐야 한다면 `blocked`로 기록하라.
- 기존 테스트를 깨뜨리지 마라.
