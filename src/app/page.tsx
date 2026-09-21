"use client";

import { useEffect, useState } from "react";
import AnalyzeForm from "@/components/AnalyzeForm";
import ChannelProfileCard from "@/components/ChannelProfileCard";
import IdeaCard from "@/components/IdeaCard";
import ViralVideoList from "@/components/ViralVideoList";
import type { AnalyzeResponse } from "@/types";

type Status = "idle" | "loading" | "success" | "error";

// 진행률이 아니라 지금 어느 단계를 하는지 알리는 순서 안내다.
const LOADING_LABELS = [
  "채널 찾는 중",
  "최근 영상 읽는 중",
  "콘텐츠 정체성 파악 중",
  "바이럴 영상 찾는 중",
  "기획안 쓰는 중",
];
const LABEL_INTERVAL_MS = 6000;
const LAST_LABEL_INDEX = LOADING_LABELS.length - 1;
const MIN_VIRAL_SAMPLE = 3;
const NETWORK_ERROR_MESSAGE =
  "서버에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.";

export default function Home() {
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [labelIndex, setLabelIndex] = useState(0);

  // 마지막 라벨에 도달하면 인터벌을 더 걸지 않고 그 문구로 고정한다.
  useEffect(() => {
    if (status !== "loading" || labelIndex >= LAST_LABEL_INDEX) return;

    const timer = setInterval(
      () => setLabelIndex((current) => current + 1),
      LABEL_INTERVAL_MS,
    );
    return () => clearInterval(timer);
  }, [status, labelIndex]);

  async function analyze(handle: string) {
    setStatus("loading");
    setErrorMessage("");
    setLabelIndex(0);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle }),
      });
      const body: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        setErrorMessage(readErrorMessage(body));
        setStatus("error");
        return;
      }

      setResult(body as AnalyzeResponse);
      setStatus("success");
    } catch {
      setErrorMessage(NETWORK_ERROR_MESSAGE);
      setStatus("error");
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <header>
        <h1 className="text-2xl font-semibold text-white">TubeNext</h1>
        <p className="mt-1 text-sm text-neutral-400">
          채널을 분석하고 지금 터지는 영상을 근거로 다음 영상을 제안합니다.
        </p>
      </header>

      <div className="mt-8">
        <AnalyzeForm
          onSubmit={analyze}
          loading={status === "loading"}
          error={status === "error" ? errorMessage : ""}
        />
      </div>

      {status === "loading" && (
        <div className="mt-8">
          <p className="text-sm text-neutral-400">
            {LOADING_LABELS[labelIndex]}
          </p>
          <div className="mt-3 flex flex-col gap-3">
            {[0, 1, 2].map((key) => (
              <div
                key={key}
                className="h-32 animate-pulse rounded-lg border border-neutral-800 bg-[#141414]"
              />
            ))}
          </div>
        </div>
      )}

      {status === "success" && result && (
        <div className="mt-8 space-y-8">
          <section>
            <h2 className="text-sm font-medium text-neutral-400">채널 프로필</h2>
            <div className="mt-3">
              <ChannelProfileCard
                channel={result.channel}
                profile={result.profile}
              />
            </div>
          </section>

          <section>
            <h2 className="text-sm font-medium text-neutral-400">바이럴 영상</h2>
            {result.viral.length < MIN_VIRAL_SAMPLE && (
              <p className="mt-2 text-sm text-neutral-500">
                이 주제는 최근 30일 표본이 적습니다.
              </p>
            )}
            <div className="mt-3">
              <ViralVideoList videos={result.viral} />
            </div>
          </section>

          <section>
            <h2 className="text-sm font-medium text-neutral-400">추천 기획안</h2>
            {result.ideas.length === 0 ? (
              <p className="mt-2 text-sm text-neutral-500">
                기획안 생성에 실패했습니다. 다시 시도해주세요.
              </p>
            ) : (
              <div className="mt-3 flex flex-col gap-3">
                {result.ideas.map((idea, index) => (
                  <IdeaCard key={index} idea={idea} index={index + 1} />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}

// 라우트 핸들러는 실패를 { error: string }으로 돌려준다.
function readErrorMessage(body: unknown): string {
  const message = (body as { error?: unknown } | null)?.error;
  return typeof message === "string" && message !== ""
    ? message
    : NETWORK_ERROR_MESSAGE;
}
