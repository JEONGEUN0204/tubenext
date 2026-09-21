import { describe, expect, it } from "vitest";
import { parseChannelInput } from "@/lib/handle";
import type { ChannelQuery } from "@/types";

describe("parseChannelInput", () => {
  const cases: Array<[string, ChannelQuery | null]> = [
    ["@mychannel", { by: "handle", value: "@mychannel" }],
    ["mychannel", { by: "handle", value: "@mychannel" }],
    ["youtube.com/@mychannel", { by: "handle", value: "@mychannel" }],
    [
      "https://www.youtube.com/@mychannel/videos",
      { by: "handle", value: "@mychannel" },
    ],
    ["https://youtube.com/channel/UCabc123", { by: "id", value: "UCabc123" }],
    ["  @mychannel  ", { by: "handle", value: "@mychannel" }],
    ["youtube.com/c/legacy", null],
    ["youtube.com/user/legacy", null],
    ["", null],
    ["   ", null],
  ];

  for (const [input, expected] of cases) {
    it(`${JSON.stringify(input)} → ${JSON.stringify(expected)}`, () => {
      expect(parseChannelInput(input)).toEqual(expected);
    });
  }

  it("URL 끝의 슬래시를 무시한다", () => {
    expect(parseChannelInput("https://youtube.com/@mychannel/")).toEqual({
      by: "handle",
      value: "@mychannel",
    });
  });

  it("채널 ID가 없는 channel 경로는 null", () => {
    expect(parseChannelInput("https://youtube.com/channel/")).toBeNull();
  });

  it("@ 하나만 입력하면 null", () => {
    expect(parseChannelInput("@")).toBeNull();
  });

  it("유튜브 도메인이 아닌 경로 입력은 null", () => {
    expect(parseChannelInput("example.com/@mychannel")).toBeNull();
  });
});
