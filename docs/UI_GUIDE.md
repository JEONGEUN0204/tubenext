# UI 디자인 가이드

## 디자인 원칙
1. **도구처럼 보여야 한다.** 마케팅 랜딩이 아니라 주제를 정할 때마다 여는 대시보드.
2. **숫자가 주인공이다.** 조회수·배율·업로드 주기가 설명 문장보다 먼저 눈에 들어와야 한다.
3. **한 화면에서 끝난다.** 입력 → 로딩 → 결과. 페이지 이동도 탭도 없다.

## AI 슬롭 안티패턴 — 하지 마라
| 금지 사항 | 이유 |
|-----------|------|
| backdrop-filter: blur() | glass morphism은 AI 템플릿의 가장 흔한 징후 |
| gradient-text (배경 그라데이션 텍스트) | AI가 만든 SaaS 랜딩의 1번 특징 |
| "Powered by AI" 배지 | 기능이 아니라 장식. 사용자에게 가치 없음 |
| box-shadow 글로우 애니메이션 | 네온 글로우 = AI 슬롭 |
| 보라/인디고 브랜드 색상 | "AI = 보라색" 클리셰 |
| 모든 카드에 동일한 rounded-2xl | 균일한 둥근 모서리는 템플릿 느낌 |
| 배경 gradient orb (blur-3xl 원형) | 모든 AI 랜딩 페이지에 있는 장식 |
| 이모지 아이콘 (🚀 📊 ✨) | 데이터 도구에 어울리지 않음 |

## 색상
### 배경
| 용도 | 값 |
|------|------|
| 페이지 | #0a0a0a |
| 카드 | #141414 |
| 입력/보조 표면 | #1a1a1a |

### 텍스트
| 용도 | 값 |
|------|------|
| 주 텍스트 | text-white |
| 본문 | text-neutral-300 |
| 보조 | text-neutral-400 |
| 비활성 | text-neutral-500 |

### 데이터/시맨틱 색상
| 용도 | 값 |
|------|------|
| 바이럴 배율 (강조 지표) | #eab308 |
| 평균 대비 상승 | #22c55e |
| 에러 | #ef4444 |
| 중립/기본 | #525252 |

## 컴포넌트
### 카드
```
rounded-lg bg-[#141414] border border-neutral-800 p-5
```
### 버튼
```
Primary: rounded-md bg-white text-black px-4 py-2 text-sm font-medium hover:bg-neutral-200 disabled:bg-neutral-700 disabled:text-neutral-400
Text:    text-sm text-neutral-500 hover:text-neutral-300
```
### 입력 필드
```
rounded-md bg-[#1a1a1a] border border-neutral-800 px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-neutral-600 focus:outline-none
```
### 지표 표시
```
숫자: text-lg font-medium text-white tabular-nums
라벨: text-xs text-neutral-500
배율 강조: text-[#eab308] tabular-nums
```

## 레이아웃
- 전체 너비: max-w-4xl
- 정렬: 좌측 정렬 기본. 중앙 정렬은 빈 상태(입력 전) 화면에서도 쓰지 않는다.
- 간격: 카드 내부 gap-3, 섹션 간 space-y-8
- 결과는 세로 한 줄로 쌓는다: 채널 프로필 → 바이럴 영상 → 추천 기획안

## 타이포그래피
| 용도 | 스타일 |
|------|--------|
| 페이지 제목 | text-2xl font-semibold text-white |
| 섹션 제목 | text-sm font-medium text-neutral-400 |
| 카드 제목 | text-sm font-medium text-white |
| 본문 | text-sm text-neutral-300 leading-relaxed |
| 숫자 | tabular-nums |

## 애니메이션
- 허용: 로딩 중 텍스트 교체, `animate-pulse` 스켈레톤.
- 그 외 모든 전환·등장 애니메이션 금지.

## 아이콘
- SVG 인라인, strokeWidth 1.5, 크기 16px.
- 아이콘 컨테이너(둥근 배경 박스)로 감싸지 않는다.
- 썸네일은 YouTube가 주는 이미지 URL을 그대로 쓴다.
