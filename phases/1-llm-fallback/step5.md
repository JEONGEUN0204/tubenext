# Step 5: fallback-ui

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `CLAUDE.md`
- `docs/UI_GUIDE.md` (**전부 읽어라.** 특히 "AI 슬롭 안티패턴" 표와 색상 표)
- `docs/PRD.md` (디자인 — 다크모드 고정, 무채색 기반 + 데이터 강조색 2개만)
- `docs/ADR.md` (**이 step에서 ADR-007을 추가한다.** 기존 ADR들의 서술 형식을 그대로 따라라)
- `src/app/page.tsx` (**이 step에서 수정할 화면**)
- `src/types/index.ts` (**step 4 산출물** — `AnalysisMode`, `AnalysisModes`, `AnalyzeResponse.mode`)
- `src/components/ChannelProfileCard.tsx`, `src/components/IdeaCard.tsx` (기존 컴포넌트 작성 스타일·클래스 사용법)
- `.env.local.example` (**이 step에서 수정한다.** 기존 주석 블록 형식을 그대로 따라라)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 배경

step 4에서 라우트가 `mode: { profile, ideas }`를 응답에 넣게 됐다.
Claude를 쓰지 못한 결과는 문장 품질이 다르다. **그 사실을 화면에서 숨기지 않는다.**

## 작업

### 1. `src/components/ModeBadge.tsx` (새 파일)

```ts
interface ModeBadgeProps {
  mode: AnalysisMode;
}
```

- `mode === "llm"`이면 **`null`을 반환한다.** 정상 경로에는 아무 표시도 하지 않는다.
  이유: 잘 동작할 때 "AI로 분석했습니다" 같은 배지를 다는 건 UI_GUIDE가 금지한 장식이다(`"Powered by AI" 배지` 항목). 이 배지는 **평소와 다르다는 정보**를 줄 때만 존재 이유가 있다.
- `mode === "rule"`이면 `규칙 기반` 텍스트 배지를 그린다.
- 클래스는 무채색만 쓴다. 기준:

```
rounded border border-neutral-800 bg-[#1a1a1a] px-1.5 py-0.5 text-xs text-neutral-500
```

- 아이콘·이모지·색상 강조를 넣지 마라. `#eab308`(배율)과 `#22c55e`(상승)는 데이터 지표 전용이다.

### 2. `src/app/page.tsx`

`status === "success"` 블록의 두 섹션에 배지와 설명을 붙인다. 섹션 구조와 순서는 바꾸지 마라.

**채널 프로필 섹션**
- 섹션 제목 `<h2>` 옆에 `<ModeBadge mode={result.mode.profile} />`를 둔다. 제목과 배지를 `flex items-center gap-2`로 나란히 놓는다.
- `result.mode.profile === "rule"`일 때만 섹션 제목 아래에 보조 설명 한 줄을 띄운다:

```
Claude를 쓰지 못해 최근 제목의 반복 키워드로 분석했습니다.
```

**추천 기획안 섹션**
- `result.ideas.length > 0 && result.mode.ideas === "rule"`일 때만 배지와 설명을 띄운다.
  이유: 기획안이 0개면 "기획안 생성에 실패했습니다" 문구가 이미 뜬다. 거기에 배지까지 붙으면 무엇이 실패한 건지 흐려진다.
- 설명 문구:

```
Claude를 쓰지 못해 바이럴 영상 수치를 템플릿에 넣어 만들었습니다. 제목과 훅은 그대로 쓰지 말고 다듬어서 쓰세요.
```

- 설명 문구 스타일은 기존 보조 문구(`mt-2 text-sm text-neutral-500`)와 맞춘다.

**바꾸지 않는 것**: 로딩 라벨 배열, 4가지 상태(`idle | loading | success | error`), 에러 처리, 기존 섹션 순서, `ideas.length === 0`일 때의 기존 문구.

### 3. `.env.local.example`

`ANTHROPIC_API_KEY` 블록 아래에 새 블록을 추가한다. 기존 블록의 구분선 주석 형식을 그대로 따라라.

- 변수명은 `LLM_MODE`, 값은 `auto`(기본) 또는 `off`.
- 주석으로 설명할 것: 비우거나 `auto`면 Claude를 쓴다. `off`면 Claude를 호출하지 않고 규칙 기반으로만 분석한다. `ANTHROPIC_API_KEY`가 비어 있으면 자동으로 규칙 기반으로 동작한다. 크레딧이 소진되어 호출이 실패해도 규칙 기반 결과가 나온다.

**`.env.local`(실제 키가 든 파일)은 절대 수정하거나 출력하지 마라.**

### 4. `docs/ADR.md`

맨 아래에 `ADR-007`을 추가한다. 기존 ADR과 같은 **결정 / 이유 / 트레이드오프** 3단 형식을 지켜라. 담을 내용:

- **결정**: `ANTHROPIC_API_KEY`가 없거나 `LLM_MODE=off`이거나 Claude 호출이 실패하면, 채널 프로필과 기획안을 `src/lib/`의 규칙 기반 함수로 만든다. 어느 경로로 만들어졌는지는 응답의 `mode` 필드로 내보내고 UI에 배지로 표시한다.
- **이유**: 크레딧이 소진되면 `extractProfile`이 죽고 검색 키워드가 없어 요청 전체가 502가 된다. 채널 통계와 바이럴 랭킹은 YouTube 데이터만으로 계산되는데 그것까지 못 보는 건 과하다.
- **트레이드오프**: 규칙 기반 제목·훅은 LLM보다 문장 품질이 낮다. 대신 `whyNow`는 입력 수치만 쓰므로 근거는 오히려 정확하다. 폴백 상태를 요청 사이에 기억하지 않으므로(ADR-006) 크레딧이 복구되면 다음 요청부터 자동으로 LLM 경로로 돌아온다.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
```

UI 단위 테스트는 추가하지 않는다. 이 프로젝트는 컴포넌트 테스트를 두지 않는다(기존 `tests/`에 없다). 기존 85개 이상의 테스트가 그대로 통과하면 된다.

## 검증 절차

1. 위 AC 커맨드를 순서대로 실행한다.
2. UI_GUIDE 체크리스트를 확인한다:
   - 배지에 이모지·아이콘·보라색·그라데이션·글로우·`backdrop-blur`가 없는가?
   - 배경/텍스트 색이 UI_GUIDE 색상 표 안에 있는가?
   - 새 애니메이션을 추가하지 않았는가? (허용: 로딩 텍스트 교체, `animate-pulse`)
   - `mode`가 `"llm"`일 때 화면에 아무것도 추가되지 않는가?
3. 아키텍처 체크리스트를 확인한다:
   - `page.tsx`가 여전히 4가지 상태만 `useState`로 관리하는가? 상태 관리 라이브러리를 넣지 않았는가?
   - 클라이언트 컴포넌트에서 외부 API를 직접 호출하지 않는가? (CLAUDE.md CRITICAL)
   - `.env.local`을 건드리지 않았는가?
4. 결과에 따라 `phases/1-llm-fallback/index.json`의 step 5를 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- `mode === "llm"`일 때 배지를 그리지 마라. 이유: UI_GUIDE가 금지한 `"Powered by AI" 배지`와 같은 것이 된다. 기능이 아니라 장식이다.
- 배지에 이모지나 경고 아이콘을 넣지 마라. 이유: UI_GUIDE 안티패턴 표에 명시되어 있다. 데이터 도구에 어울리지 않는다.
- 폴백 설명을 모달·토스트·배너로 띄우지 마라. 이유: "한 화면에서 끝난다"는 UI 원칙을 깨고, 매번 닫아야 하는 방해물이 된다.
- `NEXT_PUBLIC_LLM_MODE` 같은 클라이언트 노출 환경변수를 만들지 마라. 이유: CLAUDE.md CRITICAL 위반이고, 모드는 이미 응답 `mode` 필드로 내려온다.
- `.env.local`을 수정하거나 내용을 로그·커밋에 남기지 마라. 이유: 실제 API 키가 들어 있다.
- `src/lib/`, `src/services/`, `src/app/api/`를 수정하지 마라. 이유: 이 step의 범위는 화면과 문서뿐이다.
- 기존 테스트를 깨뜨리지 마라.
