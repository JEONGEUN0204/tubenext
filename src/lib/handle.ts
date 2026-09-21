import type { ChannelQuery } from "@/types";

const YOUTUBE_URL_PREFIX = /^(?:https?:\/\/)?(?:www\.|m\.)?youtube\.com\//i;

export function parseChannelInput(raw: string): ChannelQuery | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;

  if (YOUTUBE_URL_PREFIX.test(trimmed)) {
    const [first, second] = trimmed
      .replace(YOUTUBE_URL_PREFIX, "")
      .split("/")
      .filter(Boolean);

    // /channel/UC... 는 채널 ID, /@handle 은 핸들. /c/, /user/ 같은 레거시 경로는 지원하지 않는다.
    if (first === "channel") return second ? { by: "id", value: second } : null;
    if (first?.startsWith("@")) return toHandle(first);
    return null;
  }

  if (trimmed.includes("/")) return null;
  return toHandle(trimmed);
}

function toHandle(value: string): ChannelQuery | null {
  const name = value.startsWith("@") ? value.slice(1) : value;
  return name === "" ? null : { by: "handle", value: `@${name}` };
}
