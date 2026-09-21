import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";
import {
  fetchChannel,
  fetchRecentVideos,
  searchViralCandidates,
} from "@/services/youtube";

const fetchMock = vi.fn();

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

function failWith(status: number) {
  return { ok: false, status, json: async () => ({}) };
}

function requestedUrls(): string[] {
  return fetchMock.mock.calls.map(([input]) => String(input));
}

function urlsFor(resource: string): string[] {
  return requestedUrls().filter((url) =>
    url.includes(`/youtube/v3/${resource}?`),
  );
}

function searchPage(videoIds: string[]) {
  return { items: videoIds.map((id) => ({ id: { videoId: id } })) };
}

function rawVideo(
  id: string,
  channelId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    snippet: {
      title: `영상 ${id}`,
      publishedAt: "2026-09-01T00:00:00Z",
      channelId,
      channelTitle: `채널 ${channelId}`,
      thumbnails: {
        high: { url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` },
      },
    },
    statistics: { viewCount: "50000" },
    contentDetails: { duration: "PT10M" },
    ...overrides,
  };
}

describe("services/youtube", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubEnv("YOUTUBE_API_KEY", "test-key");
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  describe("fetchChannel", () => {
    const channelItem = {
      id: "UC123",
      snippet: {
        title: "내 채널",
        thumbnails: { high: { url: "https://i.ytimg.com/ch/hq.jpg" } },
      },
      statistics: { subscriberCount: "12345" },
      contentDetails: { relatedPlaylists: { uploads: "UU123" } },
    };

    it("채널 응답을 ChannelSummary로 정규화한다", async () => {
      fetchMock.mockResolvedValueOnce(ok({ items: [channelItem] }));

      const channel = await fetchChannel({ by: "handle", value: "@me" });

      expect(channel).toEqual({
        id: "UC123",
        title: "내 채널",
        subscriberCount: 12345,
        thumbnailUrl: "https://i.ytimg.com/ch/hq.jpg",
        uploadsPlaylistId: "UU123",
      });
    });

    it("핸들 조회는 forHandle, ID 조회는 id 파라미터를 쓴다", async () => {
      fetchMock.mockResolvedValue(ok({ items: [channelItem] }));

      await fetchChannel({ by: "handle", value: "@me" });
      await fetchChannel({ by: "id", value: "UC123" });

      const [byHandle, byId] = urlsFor("channels");
      expect(byHandle).toContain("forHandle=%40me");
      expect(byHandle).toContain("part=snippet%2Cstatistics%2CcontentDetails");
      expect(byId).toContain("id=UC123");
      expect(byId).not.toContain("forHandle");
    });

    it("구독자 수를 숨긴 채널은 0으로 본다", async () => {
      fetchMock.mockResolvedValueOnce(
        ok({
          items: [{ ...channelItem, statistics: { hiddenSubscriberCount: true } }],
        }),
      );

      const channel = await fetchChannel({ by: "handle", value: "@hidden" });

      expect(channel?.subscriberCount).toBe(0);
    });

    it("items가 비어 있으면 예외 대신 null을 반환한다", async () => {
      fetchMock.mockResolvedValueOnce(ok({ items: [] }));

      await expect(
        fetchChannel({ by: "handle", value: "@nobody" }),
      ).resolves.toBeNull();
    });
  });

  describe("fetchRecentVideos", () => {
    it("playlistItems로 id를 모은 뒤 videos로 통계를 가져온다", async () => {
      fetchMock
        .mockResolvedValueOnce(
          ok({
            items: [
              { contentDetails: { videoId: "v1" } },
              { contentDetails: { videoId: "v2" } },
            ],
          }),
        )
        .mockResolvedValueOnce(
          ok({
            items: [
              {
                id: "v1",
                snippet: {
                  title: "오래된 영상",
                  publishedAt: "2026-09-01T00:00:00Z",
                },
                statistics: { viewCount: "1000" },
                contentDetails: { duration: "PT10M30S" },
              },
              {
                id: "v2",
                snippet: {
                  title: "최신 영상",
                  publishedAt: "2026-09-05T00:00:00Z",
                },
                statistics: { viewCount: "2000" },
                contentDetails: { duration: "PT45S" },
              },
            ],
          }),
        );

      const videos = await fetchRecentVideos("UU123");

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(urlsFor("playlistItems")[0]).toContain("playlistId=UU123");
      expect(urlsFor("playlistItems")[0]).toContain("maxResults=30");
      expect(urlsFor("videos")[0]).toContain("id=v1%2Cv2");

      // 업로드 최신순
      expect(videos.map((v) => v.id)).toEqual(["v2", "v1"]);
      expect(videos[0]).toEqual({
        id: "v2",
        title: "최신 영상",
        publishedAt: "2026-09-05T00:00:00Z",
        viewCount: 2000,
        durationSec: 45,
      });
      expect(videos[1].durationSec).toBe(630);
    });

    it("업로드가 없으면 videos를 호출하지 않는다", async () => {
      fetchMock.mockResolvedValueOnce(ok({ items: [] }));

      await expect(fetchRecentVideos("UU123")).resolves.toEqual([]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("searchViralCandidates", () => {
    it("키워드가 5개여도 search는 정확히 3번만 호출한다", async () => {
      fetchMock.mockResolvedValue(ok({ items: [] }));

      await searchViralCandidates(["a", "b", "c", "d", "e"]);

      // search.list는 호출당 100 units — 할당량 보호 회귀 테스트
      expect(urlsFor("search")).toHaveLength(3);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it("검색은 최근 30일 한국 영상을 조회수순으로 요청한다", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-09-21T00:00:00Z"));
      fetchMock.mockResolvedValue(ok({ items: [] }));

      await searchViralCandidates(["여행"]);

      const [url] = urlsFor("search");
      expect(url).toContain("type=video");
      expect(url).toContain("order=viewCount");
      expect(url).toContain("regionCode=KR");
      expect(url).toContain("relevanceLanguage=ko");
      expect(url).toContain("maxResults=15");
      expect(url).toContain("publishedAfter=2026-08-22T00%3A00%3A00.000Z");

      vi.useRealTimers();
    });

    it("중복 videoId를 제거하고 채널 구독자 수를 합쳐 반환한다", async () => {
      fetchMock
        .mockResolvedValueOnce(ok(searchPage(["a", "b"])))
        .mockResolvedValueOnce(ok(searchPage(["b", "c"])))
        .mockResolvedValueOnce(ok(searchPage([])))
        .mockResolvedValueOnce(
          ok({
            items: [
              rawVideo("a", "UC1"),
              rawVideo("b", "UC1"),
              rawVideo("c", "UC2", { statistics: { viewCount: "900000" } }),
            ],
          }),
        )
        .mockResolvedValueOnce(
          ok({
            items: [
              { id: "UC1", statistics: { subscriberCount: "1000" } },
              { id: "UC2", statistics: { subscriberCount: "50000" } },
            ],
          }),
        );

      const candidates = await searchViralCandidates(["x", "y", "z"]);

      expect(urlsFor("videos")[0]).toContain("id=a%2Cb%2Cc");
      expect(urlsFor("channels")[0]).toContain("id=UC1%2CUC2");
      expect(candidates.map((c) => c.id)).toEqual(["a", "b", "c"]);
      expect(candidates[0]).toEqual({
        id: "a",
        title: "영상 a",
        channelId: "UC1",
        channelTitle: "채널 UC1",
        subscriberCount: 1000,
        viewCount: 50000,
        publishedAt: "2026-09-01T00:00:00Z",
        thumbnailUrl: "https://i.ytimg.com/vi/a/hqdefault.jpg",
        durationSec: 600,
      });
      expect(candidates[2].subscriberCount).toBe(50000);
      expect(candidates[2].viewCount).toBe(900000);
    });

    it("점수 계산이나 정렬 없이 원본 순서를 그대로 넘긴다", async () => {
      fetchMock
        .mockResolvedValueOnce(ok(searchPage(["low", "high"])))
        .mockResolvedValueOnce(
          ok({
            items: [
              rawVideo("low", "UC1", { statistics: { viewCount: "10" } }),
              rawVideo("high", "UC1", { statistics: { viewCount: "999999" } }),
            ],
          }),
        )
        .mockResolvedValueOnce(
          ok({
            items: [{ id: "UC1", statistics: { subscriberCount: "1000" } }],
          }),
        );

      const candidates = await searchViralCandidates(["x"]);

      expect(candidates.map((c) => c.id)).toEqual(["low", "high"]);
    });

    it("videoId가 50개를 넘으면 videos 호출을 나눈다", async () => {
      const ids = Array.from({ length: 60 }, (_, i) => `v${i}`);
      fetchMock
        .mockResolvedValueOnce(ok(searchPage(ids)))
        .mockResolvedValueOnce(
          ok({ items: ids.slice(0, 50).map((id) => rawVideo(id, "UC1")) }),
        )
        .mockResolvedValueOnce(
          ok({ items: ids.slice(50).map((id) => rawVideo(id, "UC1")) }),
        )
        .mockResolvedValueOnce(
          ok({
            items: [{ id: "UC1", statistics: { subscriberCount: "1000" } }],
          }),
        );

      const candidates = await searchViralCandidates(["x"]);

      expect(urlsFor("videos")).toHaveLength(2);
      expect(urlsFor("channels")).toHaveLength(1);
      expect(candidates).toHaveLength(60);
    });

    it("검색 결과가 없으면 videos/channels를 호출하지 않는다", async () => {
      fetchMock.mockResolvedValue(ok({ items: [] }));

      await expect(searchViralCandidates(["x"])).resolves.toEqual([]);
      expect(urlsFor("videos")).toHaveLength(0);
      expect(urlsFor("channels")).toHaveLength(0);
    });
  });

  describe("에러 매핑", () => {
    it("403이면 QUOTA_EXCEEDED AppError를 던진다", async () => {
      fetchMock.mockResolvedValue(failWith(403));

      await expect(
        fetchChannel({ by: "handle", value: "@me" }),
      ).rejects.toBeInstanceOf(AppError);
      await expect(
        fetchChannel({ by: "handle", value: "@me" }),
      ).rejects.toMatchObject({ code: "QUOTA_EXCEEDED" });
    });

    it("그 외 non-2xx는 UPSTREAM_ERROR로 매핑하고 상태 코드를 붙인다", async () => {
      fetchMock.mockResolvedValue(failWith(500));

      await expect(fetchRecentVideos("UU123")).rejects.toMatchObject({
        code: "UPSTREAM_ERROR",
        message: expect.stringContaining("500"),
      });
    });

    it("에러 메시지에 API 키나 요청 URL을 노출하지 않는다", async () => {
      fetchMock.mockResolvedValue(failWith(500));

      const error = await searchViralCandidates(["x"]).catch(
        (e: unknown) => e as AppError,
      );

      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).message).not.toContain("test-key");
      expect((error as AppError).message).not.toContain("googleapis.com");
    });

    it("API 키가 없으면 네트워크를 타기 전에 실패한다", async () => {
      vi.stubEnv("YOUTUBE_API_KEY", "");

      await expect(
        fetchChannel({ by: "handle", value: "@me" }),
      ).rejects.toBeInstanceOf(AppError);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
