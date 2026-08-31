import { describe, expect, test } from "bun:test";
import type { SpotifySdk } from "../createSpotifySdk";
import { getPlayHistory, getPlayHistoryWindow } from "./getPlayHistory";

describe("Spotify play-history pagination", () => {
  test("follows Spotify's next cursor without repeating the first page", async () => {
    const calls: string[] = [];
    const responses = [
      playHistoryPage(
        [playedTrack("track-1"), playedTrack("track-2")],
        "https://api.spotify.com/v1/me/player/recently-played?limit=50&before=100"
      ),
      playHistoryPage([playedTrack("track-3")], null),
    ];
    const sdk = {
      makeRequest(_method: string, path: string) {
        calls.push(path);
        return Promise.resolve(responses.shift());
      },
    } as unknown as SpotifySdk;

    const tracks = await getPlayHistory(sdk, {
      after: "50",
      maxLimit: 3,
    });

    expect(tracks.map(({ track }) => track.id)).toEqual([
      "track-1",
      "track-2",
      "track-3",
    ]);
    expect(calls).toEqual([
      "me/player/recently-played?limit=50&after=50",
      "me/player/recently-played?limit=50&before=100",
    ]);
  });

  test("does not invent a default cursor", async () => {
    const calls: string[] = [];
    const sdk = {
      makeRequest(_method: string, path: string) {
        calls.push(path);
        return Promise.resolve(playHistoryPage([], null));
      },
    } as unknown as SpotifySdk;

    await getPlayHistory(sdk, { maxLimit: 1 });

    expect(calls).toEqual(["me/player/recently-played?limit=50"]);
  });

  test("rejects invalid or conflicting cursors before requesting Spotify", async () => {
    let requestCount = 0;
    const sdk = {
      makeRequest() {
        requestCount += 1;
        return Promise.resolve(playHistoryPage([], null));
      },
    } as unknown as SpotifySdk;

    await expect(getPlayHistory(sdk, { after: "2000-01-01" })).rejects.toThrow(
      "Unix milliseconds"
    );
    await expect(
      getPlayHistory(sdk, { after: "1", before: "2" })
    ).rejects.toThrow("cannot both be provided");
    expect(requestCount).toBe(0);
  });

  test("fails closed instead of advancing past a 500-item incremental gap", async () => {
    let requestCount = 0;
    const sdk = {
      makeRequest() {
        requestCount += 1;
        return Promise.resolve(
          playHistoryPage(
            Array.from({ length: 50 }, (_, index) =>
              playedTrack(`track-${requestCount}-${index}`)
            ),
            `https://api.spotify.com/v1/me/player/recently-played?limit=50&before=${requestCount}`
          )
        );
      },
    } as unknown as SpotifySdk;

    await expect(
      getPlayHistory(sdk, {
        after: "1",
        maxLimit: 500,
        requireComplete: true,
      })
    ).rejects.toThrow("more than 500");
    expect(requestCount).toBe(10);
  });

  test("returns a safe continuation cursor for a bounded 500-item window", async () => {
    let requestCount = 0;
    const sdk = {
      makeRequest() {
        requestCount += 1;
        return Promise.resolve(
          playHistoryPage(
            Array.from({ length: 50 }, (_, index) =>
              playedTrack(`track-${requestCount}-${index}`)
            ),
            `https://api.spotify.com/v1/me/player/recently-played?limit=50&before=${requestCount}`
          )
        );
      },
    } as unknown as SpotifySdk;

    const window = await getPlayHistoryWindow(sdk, {
      after: "1",
      maxLimit: 500,
    });

    expect(window.items).toHaveLength(500);
    expect(window.nextBefore).toBe("10");
    expect(requestCount).toBe(10);
  });
});

function playHistoryPage(items: unknown[], next: string | null) {
  return { href: "", items, limit: 50, next, total: items.length };
}

function playedTrack(id: string) {
  return {
    played_at: new Date(Number(id.at(-1)) * 1_000).toISOString(),
    track: { id },
  };
}
