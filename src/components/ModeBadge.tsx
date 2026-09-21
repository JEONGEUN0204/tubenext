import type { AnalysisMode } from "@/types";

interface ModeBadgeProps {
  mode: AnalysisMode;
}

// llm 경로에는 아무것도 그리지 않는다. 잘 동작할 때 다는 배지는 기능이 아니라
// 장식이다. 이 배지는 "평소와 다르다"는 정보를 줄 때만 존재 이유가 있다.
export default function ModeBadge({ mode }: ModeBadgeProps) {
  if (mode === "llm") return null;

  return (
    <span className="rounded border border-neutral-800 bg-[#1a1a1a] px-1.5 py-0.5 text-xs text-neutral-500">
      규칙 기반
    </span>
  );
}
