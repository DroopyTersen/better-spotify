import { describe, expect, test } from "bun:test";
import {
  playSpotifyItem,
  type SpotifyPlayer,
} from "./playSpotifyItem";

function createPlayer(overrides: Partial<SpotifyPlayer> = {}) {
  const calls: unknown[][] = [];
  const player: SpotifyPlayer = {
    getAvailableDevices: async () => ({
      devices: [{ id: "idle" }, { id: "active", is_active: true }],
    }),
    startResumePlayback: async (...args) => {
      calls.push(args);
    },
    ...overrides,
  };
  return { calls, player };
}

describe("Spotify artwork playback", () => {
  test("plays a track on the active device without opening Spotify", async () => {
    const { calls, player } = createPlayer();
    const fallbacks: string[] = [];

    const result = await playSpotifyItem({
      uri: "spotify:track:abc",
      player,
      openFallback: (uri) => fallbacks.push(uri),
    });

    expect(result).toBe("played");
    expect(calls).toEqual([["active", undefined, ["spotify:track:abc"]]]);
    expect(fallbacks).toEqual([]);
  });

  test("plays a non-track URI as a context", async () => {
    const { calls, player } = createPlayer();

    await playSpotifyItem({
      uri: "spotify:album:abc",
      player,
      openFallback: () => undefined,
    });

    expect(calls).toEqual([["active", "spotify:album:abc", undefined]]);
  });

  test("opens the original URI when no device is available", async () => {
    const { player } = createPlayer({
      getAvailableDevices: async () => ({ devices: [] }),
    });
    const fallbacks: string[] = [];

    const result = await playSpotifyItem({
      uri: "spotify:playlist:abc",
      player,
      openFallback: (uri) => fallbacks.push(uri),
    });

    expect(result).toBe("fallback");
    expect(fallbacks).toEqual(["spotify:playlist:abc"]);
  });

  test("falls back cleanly when Spotify playback fails", async () => {
    const { player } = createPlayer({
      startResumePlayback: async () => {
        throw new Error("playback failed");
      },
    });
    const fallbacks: string[] = [];

    const result = await playSpotifyItem({
      uri: "spotify:track:abc",
      player,
      openFallback: (uri) => fallbacks.push(uri),
    });

    expect(result).toBe("fallback");
    expect(fallbacks).toEqual(["spotify:track:abc"]);
  });
});
