import { expect, test } from "bun:test";
import { loadOptionalSpotifyBootData } from "./optionalSpotifyBoot.server";

test("a stalled optional Spotify call degrades promptly and keeps completed data", async () => {
  let bootSignal: AbortSignal | undefined;
  const startedAt = Date.now();
  const result = await loadOptionalSpotifyBootData({
    timeoutMs: 10,
    createTasks(signal) {
      bootSignal = signal;
      return {
        playlists: new Promise<never>(() => undefined),
        devices: Promise.resolve({ devices: ["speaker"] }),
      };
    },
  });

  expect(Date.now() - startedAt).toBeLessThan(1_000);
  expect(bootSignal?.aborted).toBeTrue();
  expect(result).toEqual({
    playlists: null,
    devices: { devices: ["speaker"] },
    unavailable: true,
  });
});
