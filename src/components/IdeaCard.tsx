"use client";

import { useEffect, useState } from "react";
import type { ContentIdea } from "@/types";

interface IdeaCardProps {
  idea: ContentIdea;
  index: number;
}

const COPIED_RESET_MS = 2000;

export default function IdeaCard({ idea, index }: IdeaCardProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_RESET_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(toPlainText(idea));
      setCopied(true);
    } catch {
      // 클립보드 권한이 없는 환경에서는 조용히 넘어간다.
    }
  }

  return (
    <div className="rounded-lg border border-neutral-800 bg-[#141414] p-5">
      <div className="flex items-baseline justify-between gap-4">
        <div className="flex min-w-0 gap-3">
          <span className="text-sm text-neutral-600 tabular-nums">
            {String(index).padStart(2, "0")}
          </span>
          <h3 className="text-sm font-medium text-white">{idea.title}</h3>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="shrink-0 text-sm text-neutral-500 hover:text-neutral-300"
        >
          {copied ? "복사됨" : "복사"}
        </button>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        <div>
          <p className="text-xs text-neutral-500">훅</p>
          <p className="mt-1 text-sm text-neutral-300 leading-relaxed">
            {idea.hook}
          </p>
        </div>

        <div>
          <p className="text-xs text-neutral-500">구성</p>
          <ol className="mt-1 flex flex-col gap-1">
            {idea.outline.map((line, i) => (
              <li
                key={`${i}-${line}`}
                className="flex gap-2 text-sm text-neutral-300 leading-relaxed"
              >
                <span className="text-neutral-600 tabular-nums">{i + 1}</span>
                <span>{line}</span>
              </li>
            ))}
          </ol>
        </div>

        <div>
          <p className="text-xs text-neutral-500">왜 지금</p>
          <p className="mt-1 text-sm text-neutral-300 leading-relaxed">
            {idea.whyNow}
          </p>
        </div>
      </div>

      <div className="mt-5 flex items-baseline justify-between gap-4 border-t border-neutral-800 pt-4">
        <a
          href={`https://www.youtube.com/watch?v=${idea.referenceVideoId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-neutral-500 hover:text-neutral-300"
        >
          참고한 바이럴 영상
        </a>
        <span className="text-xs text-neutral-500 tabular-nums">
          예상 {idea.estimatedMinutes[0]}~{idea.estimatedMinutes[1]}분
        </span>
      </div>
    </div>
  );
}

function toPlainText(idea: ContentIdea): string {
  return [
    idea.title,
    idea.hook,
    ...idea.outline.map((line, i) => `${i + 1}. ${line}`),
  ].join("\n");
}
