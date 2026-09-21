"use client";

import { useEffect, useState } from "react";
import AnalyzeForm from "@/components/AnalyzeForm";
import ChannelProfileCard from "@/components/ChannelProfileCard";
import IdeaCard from "@/components/IdeaCard";
import ModeBadge from "@/components/ModeBadge";
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
const VIRAL_NONE_MESSAGE =
  "최근 30일 안에 조회수 1만 이상인 관련 영상을 찾지 못했습니다.";
const VIRAL_FEW_MESSAGE = "이 주제는 최근 30일 표본이 적습니다.";
// 라우트는 근거로 지목할 영상이 없으면 기획안 생성을 건너뛴다. 실패가 아니라 생략이다.
const IDEAS_SKIPPED_MESSAGE =
  "참고할 바이럴 영상을 찾지 못해 기획안을 만들지 않았습니다. 이 채널의 검색 키워드로는 최근 30일 안에 조건을 넘는 영상이 없습니다.";
const IDEAS_FAILED_MESSAGE = "기획안 생성에 실패했습니다. 다시 시도해주세요.";

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
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-medium text-neutral-400">
                채널 프로필
              </h2>
              <ModeBadge mode={result.mode.profile} />
            </div>
            {result.mode.profile === "rule" && (
              <p className="mt-2 text-sm text-neutral-500">
                Claude를 쓰지 못해 최근 제목의 반복 키워드로 분석했습니다.
              </p>
            )}
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
                {viralSampleMessage(
                  result.viral.length,
                  result.profile.searchKeywords,
                )}
              </p>
            )}
            <div className="mt-3">
              <ViralVideoList videos={result.viral} />
            </div>
          </section>

          <section>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-medium text-neutral-400">
                추천 기획안
              </h2>
              {result.ideas.length > 0 && (
                <ModeBadge mode={result.mode.ideas} />
              )}
            </div>
            {result.ideas.length > 0 && result.mode.ideas === "rule" && (
              <p className="mt-2 text-sm text-neutral-500">
                Claude를 쓰지 못해 바이럴 영상 수치를 템플릿에 넣어
                만들었습니다. 제목과 훅은 그대로 쓰지 말고 다듬어서 쓰세요.
              </p>
            )}
            {result.ideas.length === 0 ? (
              <p className="mt-2 text-sm text-neutral-500">
                {result.viral.length === 0
                  ? IDEAS_SKIPPED_MESSAGE
                  : IDEAS_FAILED_MESSAGE}
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

// 0개와 1~2개는 사용자가 할 일이 다르다. 0개면 실제로 검색에 쓴 말을 같이 보여준다.
// 키워드가 엉뚱했던 것인지 주제 자체가 조용한 것인지는 그걸 봐야 구분된다.
function viralSampleMessage(count: number, keywords: string[]): string {
  if (count > 0) return VIRAL_FEW_MESSAGE;
  if (keywords.length === 0) return VIRAL_NONE_MESSAGE;
  return `${VIRAL_NONE_MESSAGE} 검색 키워드: ${keywords.join(", ")}`;
}

// 라우트 핸들러는 실패를 { error: string }으로 돌려준다.
function readErrorMessage(body: unknown): string {
  const message = (body as { error?: unknown } | null)?.error;
  return typeof message === "string" && message !== ""
    ? message
    : NETWORK_ERROR_MESSAGE;
}
