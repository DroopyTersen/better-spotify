import { describe, expect, test } from "bun:test";
import { createUIMessageStream } from "ai";
import type { CacheManager } from "~/toolkit/utils/cache.client";
import type { SpotifySdk } from "../createSpotifySdk";
import type { SpotifyData } from "../spotify.db";
import {
  getPlaylistBuildCacheKey,
  PlaylistBuildResidualClientError,
  PlaylistBuildingService,
} from "./PlaylistBuildingService.client";
import type { PlaylistBuildTransport } from "./playlistBuildStream.client";
import {
  CURATING_PLAYLIST_PROGRESS,
  type PlaylistBuildUIMessage,
} from "./playlistBuildProgress";

const JOB_ID = "11111111-1111-4111-8111-111111111111";

describe("playlist build reconnection", () => {
  test("resumes a persisted UI-message stream and clears the build marker", async () => {
    const cache = buildCache();
    const transport: PlaylistBuildTransport = {
      async sendMessages() {
        throw new Error("A resumed build must not start again");
      },
      async reconnectToStream() {
        return terminalStream({
          type: "data-completion",
          id: "completion",
          data: { jobId: JOB_ID, playlistId: "playlist-id" },
        });
      },
    };
    const service = createService(transport, cache);

    await expect(service.resumePlaylistBuild()).resolves.toEqual({
      playlist: { id: "playlist-id" },
    });
    expect(
      await cache.getItem(getPlaylistBuildCacheKey("listener-a"))
    ).toBeNull();
    expect(service.getState().isBuilding).toBeFalse();
  });

  test("preserves the residual-playlist warning from a resumed failure", async () => {
    const cache = buildCache();
    const transport: PlaylistBuildTransport = {
      async sendMessages() {
        throw new Error("A resumed build must not start again");
      },
      async reconnectToStream() {
        return terminalStream({
          type: "data-failure",
          id: "failure",
          data: {
            jobId: JOB_ID,
            kind: "residual",
            message: "A partial playlist may remain",
          },
        });
      },
    };
    const service = createService(transport, cache);

    await expect(service.resumePlaylistBuild()).rejects.toBeInstanceOf(
      PlaylistBuildResidualClientError
    );
    expect(
      await cache.getItem(getPlaylistBuildCacheKey("listener-a"))
    ).toBeNull();
  });
});

function terminalStream(
  terminal:
    | {
        type: "data-completion";
        id: string;
        data: { jobId: string; playlistId: string };
      }
    | {
        type: "data-failure";
        id: string;
        data: {
          jobId: string;
          kind: "failed" | "residual";
          message: string;
        };
      }
) {
  return createUIMessageStream<PlaylistBuildUIMessage>({
    execute: ({ writer }) => {
      writer.write({
        type: "data-progress",
        id: "progress",
        data: { jobId: JOB_ID, progress: CURATING_PLAYLIST_PROGRESS },
      });
      writer.write(terminal);
    },
  });
}

function buildCache() {
  return new MemoryCache({
    [getPlaylistBuildCacheKey("listener-a")]: {
      jobId: JOB_ID,
      selectionHash: "a".repeat(40),
      startedAt: "2026-08-30T12:00:00.000Z",
    },
  });
}

function createService(
  transport: PlaylistBuildTransport,
  cache: CacheManager
) {
  return new PlaylistBuildingService(
    {} as SpotifySdk,
    {} as SpotifyData,
    "listener-a",
    null,
    transport,
    cache
  );
}

class MemoryCache implements CacheManager {
  private readonly values = new Map<string, unknown>();

  constructor(values: Record<string, unknown>) {
    for (const [key, value] of Object.entries(values)) {
      this.values.set(key, value);
    }
  }

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
