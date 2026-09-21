"use client";

import { useState, type FormEvent } from "react";

interface AnalyzeFormProps {
  onSubmit: (handle: string) => void;
  loading: boolean;
  error: string;
}

export default function AnalyzeForm({
  onSubmit,
  loading,
  error,
}: AnalyzeFormProps) {
  const [value, setValue] = useState("");
  const trimmed = value.trim();

  // form의 submit이므로 버튼 클릭과 Enter 키가 같은 경로를 탄다.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading || trimmed === "") return;
    onSubmit(trimmed); // 재시도할 수 있게 입력값은 그대로 둔다.
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="flex gap-3">
        <input
          type="text"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          disabled={loading}
          placeholder="@핸들 또는 채널 URL"
          aria-label="채널 핸들 또는 URL"
          className="flex-1 rounded-md border border-neutral-800 bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-neutral-600 focus:outline-none disabled:text-neutral-500"
        />
        <button
          type="submit"
          disabled={loading || trimmed === ""}
          className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-neutral-200 disabled:bg-neutral-700 disabled:text-neutral-400"
        >
          분석
        </button>
      </div>

      {error !== "" && <p className="mt-2 text-sm text-[#ef4444]">{error}</p>}

      <p className="mt-2 text-xs text-neutral-500">
        예: @mychannel · youtube.com/@mychannel
      </p>
    </form>
  );
}
