import { describe, expect, test } from "bun:test";
import {
  createSpotifyRateLimitFetch,
  parseRetryAfterMilliseconds,
} from "./createSpotifySdk";

describe("Spotify rate-limit retries", () => {
  test("waits for Retry-After and retries a request once", async () => {
    const responses = [
      new Response(null, {
        status: 429,
        headers: { "retry-after": "2" },
      }),
      new Response("ok", { status: 200 }),
    ];
    const waits: number[] = [];
    let requests = 0;
    const spotifyFetch = createSpotifyRateLimitFetch(
      async () => {
        requests += 1;
        return responses.shift() ?? new Response(null, { status: 500 });
      },
      {
        wait: async (milliseconds) => {
          waits.push(milliseconds);
        },
      }
    );

    const response = await spotifyFetch("https://api.spotify.com/test");

    expect(response.status).toBe(200);
    expect(requests).toBe(2);
    expect(waits).toEqual([2_000]);
  });

  test("does not retry earlier than an excessive Retry-After", async () => {
    let requests = 0;
    const spotifyFetch = createSpotifyRateLimitFetch(
      async () => {
        requests += 1;
        return new Response(null, {
          status: 429,
          headers: { "retry-after": "120" },
        });
      },
      { maximumRetryAfterMs: 60_000 }
    );

    const response = await spotifyFetch("https://api.spotify.com/test");

    expect(response.status).toBe(429);
    expect(requests).toBe(1);
  });

  test("parses an HTTP-date Retry-After", () => {
    expect(
      parseRetryAfterMilliseconds(
        "Sun, 30 Aug 2026 18:00:02 GMT",
        Date.parse("Sun, 30 Aug 2026 18:00:00 GMT")
      )
    ).toBe(2_000);
  });

  test("propagates an external boot deadline to Spotify requests", async () => {
    const controller = new AbortController();
    const spotifyFetch = createSpotifyRateLimitFetch(
      async (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(init.signal?.reason),
            { once: true }
          );
        }),
      { signal: controller.signal }
    );

    const request = spotifyFetch("https://api.spotify.com/test");
    controller.abort(new Error("boot deadline"));

    await expect(request).rejects.toThrow("boot deadline");
  });
});
