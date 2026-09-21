# Step 0: project-setup

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `CLAUDE.md`
- `docs/ARCHITECTURE.md`
- `docs/ADR.md`

## 작업

Next.js 15 앱의 골격만 만든다. **기능 코드는 한 줄도 쓰지 않는다.**

### 1. 의존성 설치

`npm init -y` 후 아래를 설치한다. 버전은 명시된 메이저를 지킨다.

```
dependencies:     next@^15  react@^19  react-dom@^19  @anthropic-ai/sdk  zod
devDependencies:  typescript  @types/node  @types/react  @types/react-dom
                  tailwindcss@^4  @tailwindcss/postcss  postcss
                  eslint  eslint-config-next  @eslint/eslintrc  vitest
```

`@anthropic-ai/sdk`와 `zod`는 step 3에서 쓴다. 지금은 설치만 한다.

### 2. package.json scripts

정확히 아래 4개를 둔다.

```json
{
  "dev": "next dev",
  "build": "next build",
  "lint": "eslint .",
  "test": "vitest run"
}
```

- `test`는 반드시 `vitest run`이다. `vitest` 단독은 watch 모드로 진입해 프로세스가 끝나지 않는다.
- `lint`는 반드시 `eslint .`다. `next lint`는 Next.js 15에서 deprecated다.

### 3. 설정 파일

| 파일 | 내용 |
|---|---|
| `tsconfig.json` | `"strict": true`, `paths: { "@/*": ["./src/*"] }`, `moduleResolution: "bundler"`, `jsx: "preserve"`, `plugins: [{ "name": "next" }]`, include에 `.next/types/**/*.ts` 포함 |
| `next.config.ts` | 빈 설정 객체 export |
| `postcss.config.mjs` | `{ plugins: { "@tailwindcss/postcss": {} } }` |
| `eslint.config.mjs` | flat config. `FlatCompat`로 `next/core-web-vitals`, `next/typescript` 확장. `.next`, `node_modules`, `next-env.d.ts` ignore |
| `vitest.config.ts` | `test.environment: "node"`, `test.include: ["tests/**/*.test.ts"]`, `resolve.alias`로 `@` → `./src` |

### 4. 앱 골격

| 파일 | 내용 |
|---|---|
| `src/app/globals.css` | 첫 줄 `@import "tailwindcss";` + `body { background: #0a0a0a; color: #fff; }` |
| `src/app/layout.tsx` | `<html lang="ko">`, `globals.css` import, metadata title `"TubeNext"` |
| `src/app/page.tsx` | 플레이스홀더. `<main>TubeNext</main>` 수준. step 5에서 전부 교체된다 |

빈 디렉토리 `src/types/`, `src/lib/`, `src/services/`, `src/components/`는 만들지 않는다. 파일이 생길 때 같이 생긴다.

### 5. 스모크 테스트

`tests/smoke.test.ts`에 통과하는 테스트 1개를 만든다.

이유: vitest는 테스트 파일이 0개면 exit code 1로 종료한다. 이 파일이 없으면 step 0의 AC가 실패한다.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
```

세 개 모두 exit code 0이어야 한다.

## 검증 절차

1. 위 AC 커맨드를 순서대로 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md의 디렉토리 구조(`src/` 아래 app/components/types/lib/services)를 따르는가?
   - ADR 기술 스택(Next.js 15 App Router, TS strict, Tailwind v4, Vitest)을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/0-mvp/index.json`의 step 0을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- `npx create-next-app`을 실행하지 마라. 이유: 이 디렉토리에 이미 `CLAUDE.md`, `scripts/`, `phases/`, `.claude/`가 있어서 create-next-app이 "directory is not empty"로 거부한다. 설정 파일을 직접 작성하라.
- `src/types/`, `src/lib/`, `src/services/`, `src/components/`에 파일을 만들지 마라. 이유: step 1~5의 작업 범위다.
- `.env.local`을 수정하거나 읽지 마라. 이유: 이미 사용자가 실제 API 키를 채워둔 파일이다.
- `.gitignore`에서 `.env` 관련 줄을 지우지 마라. 이유: 실제 키가 커밋된다.
- `next build --turbopack`을 쓰지 마라. 이유: 기본 빌드로 충분하고 Tailwind v4 조합에서 변수가 늘어난다.
- 기존 테스트를 깨뜨리지 마라.
