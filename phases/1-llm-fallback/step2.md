# Step 2: rule-ideas

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `CLAUDE.md`
- `docs/ARCHITECTURE.md` (`lib/`는 순수 함수만. 네트워크·`process.env` 접근 금지)
- `docs/PRD.md` (핵심 기능 3 — 기획안에 뭐가 들어가야 하는지)
- `src/types/index.ts` (`ChannelProfile`, `ViralVideo`, `ContentIdea`)
- `src/lib/keywords.ts` (**step 0 산출물** — `extractKeywords`. 이 step에서 그대로 쓴다)
- `src/lib/rule-profile.ts` (**step 1 산출물** — 같은 폴백 경로의 짝. 문장 톤을 맞춘다)
- `src/lib/viral.ts` (`ViralVideo.multiple`·`viewsPerDay`가 어떻게 계산되는지)
- `src/services/claude.ts` (`generateIdeas`의 system 프롬프트 — 이 step이 대체하려는 LLM이 무엇을 쓰는지)
- `src/components/IdeaCard.tsx` (반환한 `ContentIdea`가 실제로 어떻게 렌더되는지)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 배경

Anthropic 크레딧이 소진되거나 키가 없을 때 `src/services/claude.ts`의 `generateIdeas`를 대신할
**규칙 기반 기획안 생성기**를 만든다. 같은 `ContentIdea[]`를 반환하므로 라우트에서 그대로 갈아끼울 수 있다.

제목·훅의 문장 품질은 LLM보다 확실히 떨어진다. 대신 **`whyNow`는 실제 수치를 그대로 쓰므로 오히려 정확하다.**
그 강점을 살려라. 지어낸 트렌드 해설을 쓰지 말고, 입력으로 받은 배율·조회수·구독자 수를 문장에 박아 넣어라.

## 작업

`src/lib/rule-ideas.ts` 하나만 만든다. 순수 함수만 둔다.

### 공개 API

```ts
export function buildRuleIdeas(
  profile: ChannelProfile,
  viral: ViralVideo[],
): ContentIdea[];
```

반환 타입은 `src/types/index.ts`의 `ContentIdea`다. 새 타입을 만들지 마라.

```ts
interface ContentIdea {
  title: string;
  hook: string;
  outline: string[];
  whyNow: string;
  referenceVideoId: string;
  estimatedMinutes: [number, number];
}
```

### 생성 규칙

- `viral`이 비었으면 **빈 배열을 반환한다.** 근거 없이 기획안을 만들지 마라.
- `viral` 상위 **5개까지** 각각에 대해 기획안 1개를 만든다. `viral`은 이미 배율 내림차순으로 정렬되어 들어온다.
- `i`번째 기획안에는 `i`번째 템플릿을 쓴다. 5개가 서로 다른 각도가 되도록 인덱스로 고정 매칭한다.

### 소재 단어 뽑기

- `myKeyword` = `profile.searchKeywords[0]`. 없으면 `우리 채널 주제`.
- `viralKeyword` = 해당 바이럴 영상 제목에서 `extractKeywords([video.title], { limit: 3 })`으로 뽑은 후보 중 **아직 다른 기획안에서 쓰지 않은 첫 번째** 단어.
  - 후보가 전부 소진되었거나 0개면 그 영상 제목의 앞 20자를 쓴다.
  - 이유: 5개 기획안이 같은 단어로 시작하면 "같은 아이디어의 제목만 바꾼 변형"이 된다. LLM 프롬프트에도 금지되어 있는 것이다.

### 템플릿 5종

`{v}` = `viralKeyword`, `{m}` = `myKeyword`. **아래 문자열을 그대로 쓴다.** 테스트가 이 형태를 검증한다.

| i | title | hook |
|---|-------|------|
| 0 | `요즘 터지는 '{v}', {m} 채널이 해보면` | `{v} 영상이 지금 왜 이렇게 도는지 직접 확인해봤습니다.` |
| 1 | `{m} 하는 사람이 {v} 따라 해봤습니다` | `{v} 영상 보고 바로 따라 했습니다. 결과부터 보여드릴게요.` |
| 2 | `{v} 진짜 되는지 {m} 기준으로 검증` | `{v} 이거 실제로 되는지 오늘 끝까지 해봅니다.` |
| 3 | `{m} 입문자를 위한 {v} 정리` | `{v} 처음 보는 분들만 보세요. 3분이면 됩니다.` |
| 4 | `{v} vs {m}, 뭐가 더 나을까` | `{v} 그리고 {m}. 둘 다 해보고 결론 냈습니다.` |

**키워드 바로 뒤에 한국어 조사를 붙이지 마라.**
이유: 받침 유무에 따라 `은/는`, `을/를`, `으로/로`가 갈리는데 그 처리를 하지 않으므로 `김치볶음밥를` 같은 문장이 나온다.
위 템플릿은 전부 조사 없이 끝나도록 만들어져 있다. 바꾸지 마라.

### `outline`

4단계 고정 템플릿에 소재를 끼운다.

```
1. 도입: '{v}' 영상이 지금 어떻게 퍼지고 있는지 보여준다
2. 본편: {m} 방식으로 직접 해본다
3. 비교: 참고 영상과 결과가 어디서 갈리는지 짚는다
4. 마무리: 다음 영상 예고
```

### `whyNow` — 실제 수치만 쓴다

```
참고 영상 '{영상 제목}' — 구독자 {구독자수}명 채널에서 조회수 {조회수}회, 구독자 대비 {배율}배, 하루 평균 {일평균조회수}회.
```

- 숫자는 천 단위 콤마를 넣는다. **`toLocaleString`을 쓰지 마라.** 이유: 실행 환경의 ICU 로케일 데이터에 따라 결과가 달라져 테스트가 환경 의존이 된다. 이 파일 안에 콤마 삽입 헬퍼를 직접 써라.
- 영상 제목이 40자를 넘으면 잘라내고 말줄임표를 붙인다.
- 트렌드 해설·시청자 심리 같은 **지어낸 서술을 덧붙이지 마라.** 입력에 있는 수치만 쓴다.

### `referenceVideoId`

해당 바이럴 영상의 `id`를 그대로 넣는다. 항상 유효한 id다. 이 경로에서는 id 검증이 필요 없다.

### `estimatedMinutes`

`profile.avgDurationSec` 기준으로 만든다.

- `avgDurationSec`가 60 미만이면 `[1, 2]`
- 그 외에는 `lo = max(1, round(avgDurationSec * 0.8 / 60))`, `hi = max(lo + 1, round(avgDurationSec * 1.2 / 60))`

## 테스트 — `tests/rule-ideas.test.ts`

**TDD다. 테스트를 먼저 쓰고, 통과하는 구현을 써라** (CLAUDE.md CRITICAL).
순수 함수라 mock이 필요 없다.

최소한 아래를 덮어라:

- `viral`이 빈 배열이면 결과도 빈 배열이다 (예외 없음)
- 바이럴 7개를 넣어도 기획안은 5개다
- 바이럴 2개면 기획안 2개이고, 각각 `referenceVideoId`가 그 영상의 `id`다
- 5개 기획안의 `title`이 서로 다르다 (같은 소재 단어가 중복되지 않는다)
- `whyNow`에 배율·조회수·구독자 수가 **콤마 포함 숫자**로 들어간다 (예: `300,000`)
- 제목이 40자를 넘는 바이럴 영상의 `whyNow`에 말줄임표가 들어간다
- `estimatedMinutes`: `avgDurationSec: 30`이면 `[1, 2]`, `avgDurationSec: 600`이면 `lo < hi`이고 둘 다 1 이상
- `profile.searchKeywords`가 빈 배열이어도 예외 없이 5개가 나오고 `우리 채널 주제`가 쓰인다
- `outline`은 모든 기획안에서 4개다
- 같은 입력에 두 번 호출하면 같은 결과가 나온다 (결정적)
- 어떤 기획안의 `title`·`hook`에도 미치환 자리표시자가 남아 있지 않다

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
```

## 검증 절차

1. 위 AC 커맨드를 순서대로 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - `src/lib/rule-ideas.ts`가 `fetch`·`process.env`·`Date.now()`를 쓰지 않는가?
   - 반환 타입이 `ContentIdea` 그대로인가?
   - `whyNow`에 입력에 없는 수치나 해설이 섞이지 않았는가?
3. 결과에 따라 `phases/1-llm-fallback/index.json`의 step 2를 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 키워드 뒤에 한국어 조사를 직접 붙이지 마라. 이유: 받침 처리를 하지 않으므로 `김치볶음밥를` 같은 깨진 문장이 그대로 영상 제목 후보로 나간다.
- `toLocaleString`·`Intl.NumberFormat`을 쓰지 마라. 이유: 실행 환경의 로케일 데이터에 따라 출력이 달라져 테스트가 환경 의존이 된다.
- `whyNow`에 입력에 없는 트렌드 해설을 지어내지 마라. 이유: 이 경로의 유일한 강점이 "수치는 사실"이라는 점이다. 그걸 버리면 LLM 없이 돌 이유가 없다.
- 바이럴 영상 제목을 `title`에 그대로 복사하지 마라. 이유: 남의 영상 제목을 그대로 올리는 기획안이 된다.
- `src/lib/keywords.ts`, `src/lib/rule-profile.ts`를 수정하지 마라. 이유: 앞 step에서 테스트까지 끝난 모듈이다.
- `src/services/`, `src/app/`, `src/components/`, `src/types/`를 수정하지 마라. 이유: 이 step의 범위는 `src/lib/rule-ideas.ts`와 그 테스트뿐이다.
- 기존 테스트를 깨뜨리지 마라.
