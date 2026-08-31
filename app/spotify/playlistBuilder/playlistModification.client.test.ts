import { describe, expect, test } from "bun:test";
import { createUIMessageStream } from "ai";
import type { CacheManager } from "~/toolkit/utils/cache.client";
import {
  getPlaylistModificationCacheKey,
  startPlaylistModification,
  type PlaylistModificationTransport,
} from "./playlistModification.client";
import {
  SAVING_MODIFICATION_PROGRESS,
  type PlaylistBuildUIMessage,
} from "./playlistBuildProgress";
import type { PlaylistModificationInput } from "./playlistBuilder.types";

describe("playlist tweak reconnection", () => {
  test("reads typed progress, completes, and clears the persisted job", async () => {
    const cache = new MemoryCache();
    const progress: string[] = [];
    const transport: PlaylistModificationTransport = {
      async sendMessages({ chatId }) {
        return terminalStream(chatId, "playlist-1");
      },
      async reconnectToStream() {
        throw new Error("A connected tweak must not reconnect");
      },
    };

    await expect(
      startPlaylistModification(input(), {
        cache,
        transport,
        signal: new AbortController().signal,
        onProgress: (value) => progress.push(value.phase),
      })
    ).resolves.toEqual({ playlistId: "playlist-1" });

    expect(progress).toContain("saving-changes");
    expect(
      await cache.getItem(getPlaylistModificationCacheKey("playlist-1"))
    ).toBeNull();
  });

  test("keeps the persisted job when the browser disconnects", async () => {
    const cache = new MemoryCache();
    const controller = new AbortController();
    const transport: PlaylistModificationTransport = {
      async sendMessages() {
        controller.abort();
        throw new DOMException("Disconnected", "AbortError");
      },
      async reconnectToStream() {
        return null;
      },
    };

    await expect(
      startPlaylistModification(input(), {
        cache,
        transport,
        signal: controller.signal,
        onProgress: () => undefined,
      })
    ).rejects.toThrow();

    expect(
      await cache.getItem(getPlaylistModificationCacheKey("playlist-1"))
    ).not.toBeNull();
  });
});

function input(): PlaylistModificationInput {
  return {
    playlistId: "playlist-1",
    snapshotId: "snapshot-1",
    instructions: "Make it more upbeat",
    currentTracks: [
      { id: "track-1", name: "Track One", artist_name: "Artist One" },
    ],
  };
}

function terminalStream(jobId: string, playlistId: string) {
  return createUIMessageStream<PlaylistBuildUIMessage>({
    execute: ({ writer }) => {
      writer.write({
        type: "data-progress",
        id: "progress",
        data: { jobId, progress: SAVING_MODIFICATION_PROGRESS },
      });
      writer.write({
        type: "data-completion",
        id: "completion",
        data: { jobId, playlistId },
      });
    },
  });
}

class MemoryCache implements CacheManager {
  private readonly values = new Map<string, unknown>();

  async getItem<Value>(key: string): Promise<Value | null> {
    return (this.values.get(key) as Value | undefined) ?? null;
  }

  async setItem<Value>(key: string, value: Value): Promise<void> {
    this.values.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.values.delete(key);
  }
}
