import type { ViralVideo } from "@/types";

interface ViralVideoListProps {
  videos: ViralVideo[];
}

export default function ViralVideoList({ videos }: ViralVideoListProps) {
  return (
    <ul className="flex flex-col gap-3">
      {videos.map((video) => (
        <li
          key={video.id}
          className="flex gap-4 rounded-lg border border-neutral-800 bg-[#141414] p-4"
        >
          {/* 외부 도메인 등록이 필요 없도록 next/image 대신 img를 쓴다 */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={video.thumbnailUrl}
            alt=""
            className="h-[72px] w-32 shrink-0 rounded bg-[#1a1a1a] object-cover"
          />

          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <a
                href={`https://www.youtube.com/watch?v=${video.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="truncate text-sm font-medium text-white hover:text-neutral-300"
              >
                {video.title}
              </a>
              {/* 6분짜리 채널에 60초 영상을 근거로 들이대지 않도록 구분한다 */}
              {video.isShort && (
                <span className="shrink-0 text-xs text-neutral-500">
                  Shorts
                </span>
              )}
            </div>

            <p className="mt-1 truncate text-xs text-neutral-500">
              {video.channelTitle}
              <span className="tabular-nums">
                {" "}
                · 구독자 {video.subscriberCount.toLocaleString("ko-KR")}
              </span>
            </p>

            <div className="mt-2 flex flex-wrap items-baseline gap-4">
              <span className="text-lg font-medium text-[#eab308] tabular-nums">
                {formatMultiple(video.multiple)}배
              </span>
              <span className="text-xs text-neutral-400 tabular-nums">
                조회 {video.viewCount.toLocaleString("ko-KR")}
              </span>
              <span className="text-xs text-neutral-400 tabular-nums">
                일 평균 {video.viewsPerDay.toLocaleString("ko-KR")}
              </span>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function formatMultiple(multiple: number): string {
  return multiple >= 10 ? String(Math.round(multiple)) : multiple.toFixed(1);
}
