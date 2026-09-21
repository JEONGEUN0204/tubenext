import type { ChannelProfile, ChannelSummary } from "@/types";

interface ChannelProfileCardProps {
  channel: ChannelSummary;
  profile: ChannelProfile;
}

export default function ChannelProfileCard({
  channel,
  profile,
}: ChannelProfileCardProps) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-[#141414] p-5">
      <div className="flex items-baseline gap-3">
        <h3 className="text-sm font-medium text-white">{channel.title}</h3>
        <span className="text-xs text-neutral-500 tabular-nums">
          구독자 {formatCount(channel.subscriberCount)}
        </span>
      </div>

      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <Field label="니치" value={profile.niche} />
        <Field label="타깃" value={profile.audience} />
        <Field
          label="주력 포맷"
          value={profile.formats.join(" · ") || "파악되지 않음"}
        />
      </dl>

      <div className="mt-5 grid grid-cols-2 gap-3 border-t border-neutral-800 pt-5 sm:grid-cols-4">
        <Metric label="평균 조회" value={formatCount(profile.avgViews)} />
        <Metric label="중앙값" value={formatCount(profile.medianViews)} />
        <Metric
          label="업로드 주기"
          value={`${profile.uploadIntervalDays}일`}
        />
        <Metric
          label="평균 길이"
          value={formatDuration(profile.avgDurationSec)}
        />
      </div>

      <div className="mt-5 border-t border-neutral-800 pt-5">
        <p className="text-xs text-neutral-500">잘 된 영상</p>
        <ol className="mt-2 flex flex-col gap-1">
          {profile.topPerformers.map((title, index) => (
            <li key={`${index}-${title}`} className="flex gap-2 text-sm text-neutral-300">
              <span className="text-neutral-600 tabular-nums">{index + 1}</span>
              <span>{title}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="mt-5 border-t border-neutral-800 pt-5">
        <p className="text-xs text-neutral-500">검색 키워드</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {profile.searchKeywords.map((keyword) => (
            <span
              key={keyword}
              className="rounded border border-neutral-800 bg-[#1a1a1a] px-2 py-1 text-xs text-neutral-300"
            >
              {keyword}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-neutral-500">{label}</dt>
      <dd className="mt-1 text-sm text-neutral-300 leading-relaxed">{value}</dd>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="mt-1 text-lg font-medium text-white tabular-nums">
        {value}
      </p>
    </div>
  );
}

// 42000 → "4.2만", 124000 → "12.4만". 이 카드에서만 쓰므로 lib/로 빼지 않는다.
function formatCount(value: number): string {
  if (value >= 100_000_000) return `${round1(value / 100_000_000)}억`;
  if (value >= 10_000) return `${round1(value / 10_000)}만`;
  return value.toLocaleString("ko-KR");
}

function round1(value: number): string {
  return String(Math.round(value * 10) / 10);
}

function formatDuration(totalSec: number): string {
  const minutes = Math.floor(totalSec / 60);
  const seconds = Math.floor(totalSec % 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
