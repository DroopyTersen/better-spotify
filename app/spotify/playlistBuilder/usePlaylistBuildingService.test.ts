import { afterEach, describe, expect, test } from "bun:test";
import type { User } from "~/auth/auth.server";
import type { SpotifyData } from "../spotify.db";
import {
  enrichOptimisticSelection,
  getPlaylistBuildCacheKey,
  getPlaylistBuilderCacheKey,
  mergeCanonicalSelections,
  PlaylistBuildingService,
} from "./PlaylistBuildingService.client";
import {
  readPersistedPlaylistBuild,
  readPlaylistBuilderCacheState,
} from "./playlistBuilderCache.client";
import type { SelectedPlaylistArtist } from "./playlistBuilder.types";
import {
  getPlaylistBuildingService,
  resetPlaylistBuildingService,
} from "./usePlaylistBuildingService";

afterEach(() => resetPlaylistBuildingService());

describe("playlist-builder account isolation", () => {
  test("namespaces persisted state by Spotify account", () => {
    expect(getPlaylistBuilderCacheKey("account-a")).toBe(
      "playlist-builder-state:account-a"
    );
    expect(getPlaylistBuilderCacheKey("account-a")).not.toBe(
      getPlaylistBuilderCacheKey("account-b")
    );
    expect(() => getPlaylistBuilderCacheKey(" ")).toThrow(
      "Spotify account ID is required"
    );
    expect(getPlaylistBuildCacheKey("account-a")).toBe(
      "playlist-builder-build:account-a"
    );
    expect(getPlaylistBuildCacheKey("account-a")).not.toBe(
      getPlaylistBuildCacheKey("account-b")
    );
  });

  test("reuses one account, refreshes its context, and replaces another account", () => {
    const createdFor: string[] = [];
    const sdkUpdates: string[] = [];
    const dataUpdates: SpotifyData[] = [];
    const createService = (user: User) => {
      createdFor.push(user.id);
      return {
        updateSdk() {
          sdkUpdates.push(user.id);
        },
        updateSpotifyData(data: SpotifyData) {
          dataUpdates.push(data);
        },
      } as unknown as PlaylistBuildingService;
    };
    const firstData = {} as SpotifyData;
    const refreshedData = { tracks: [] } as unknown as SpotifyData;
    const firstUser = user("account-a", "token-1");

    const first = getPlaylistBuildingService(
      firstUser,
      firstData,
      createService
    );
    const reused = getPlaylistBuildingService(
      firstUser,
      refreshedData,
      createService
    );
    const refreshed = getPlaylistBuildingService(
      user("account-a", "token-2"),
      refreshedData,
      createService
    );
    const expiryRefreshed = getPlaylistBuildingService(
      user("account-a", "token-2", "2031-01-01T00:00:00.000Z"),
      refreshedData,
      createService
    );
    const secondAccount = getPlaylistBuildingService(
      user("account-b", "token-3"),
      firstData,
      createService
    );

    expect(reused).toBe(first);
    expect(refreshed).toBe(first);
    expect(expiryRefreshed).toBe(first);
    expect(secondAccount).not.toBe(first);
    expect(createdFor).toEqual(["account-a", "account-b"]);
    expect(sdkUpdates).toEqual(["account-a", "account-a"]);
    expect(dataUpdates).toEqual([
      refreshedData,
      refreshedData,
      refreshedData,
    ]);
  });

  test("merges out-of-order enrichment without dropping a later selection", async () => {
    let selected: SelectedPlaylistArtist[] = [{ artist_id: "artist-a" }];
    const artistA = deferred<SelectedPlaylistArtist>();
    const artistB = deferred<SelectedPlaylistArtist>();
    const enrich = async (artist: Promise<SelectedPlaylistArtist>) => {
      const canonicalArtist = await artist;
      selected = mergeCanonicalSelections(
        selected,
        [canonicalArtist],
        ({ artist_id }) => artist_id
      );
    };

    const firstEnrichment = enrich(artistA.promise);
    selected = [...selected, { artist_id: "artist-b" }];
    const secondEnrichment = enrich(artistB.promise);
    artistB.resolve({ artist_id: "artist-b", artist_name: "B" });
    await secondEnrichment;
    artistA.resolve({ artist_id: "artist-a", artist_name: "A" });
    await firstEnrichment;

    expect(selected).toEqual([
      { artist_id: "artist-a", artist_name: "A" },
      { artist_id: "artist-b", artist_name: "B" },
    ]);
  });

  test("rolls back only the rejected optimistic enrichment", async () => {
    const retained = { artist_id: "artist-a", artist_name: "A" };
    const optimistic = { artist_id: "artist-b" };
    let selected: SelectedPlaylistArtist[] = [retained];
    let publications = 0;

    await expect(
      enrichOptimisticSelection({
        optimisticSelection: optimistic,
        getSelections: () => selected,
        setSelections: (selections) => {
          selected = selections;
        },
        enrich: async () => {
          throw new Error("Spotify enrichment failed");
        },
        publish: async () => {
          publications += 1;
        },
      })
    ).rejects.toThrow("Spotify enrichment failed");

    expect(selected).toEqual([retained]);
    expect(publications).toBe(2);
  });

  test("clears malformed persisted builder state before hydration", async () => {
    const removedKeys: string[] = [];
    const cache = {
      async getItem() {
        return {
          hashedSelection: "not-a-selection-hash",
          selectedTracks: undefined,
          selectedArtists: [],
        };
      },
      async removeItem(key: string) {
        removedKeys.push(key);
      },
    };

    expect(
      await readPlaylistBuilderCacheState(cache, "playlist-builder:account-a")
    ).toBeNull();
    expect(removedKeys).toEqual(["playlist-builder:account-a"]);
  });

  test("preserves valid account-scoped builder state", async () => {
    const validState = {
      hashedSelection: "a".repeat(40),
      selectedTracks: [],
      selectedArtists: [{ artist_id: "artist1", artist_name: "Artist" }],
      familiarSongsPool: null,
      formData: {
        customInstructions: "Keep it mellow",
        newStuffAmount: "sprinkle" as const,
        songCount: 24,
      },
    };
    const removedKeys: string[] = [];
    const cache = {
      async getItem() {
        return validState;
      },
      async removeItem(key: string) {
        removedKeys.push(key);
      },
    };

    expect(
      await readPlaylistBuilderCacheState(cache, "playlist-builder:account-a")
    ).toEqual(validState);
    expect(removedKeys).toEqual([]);
  });

  test("validates a resumable build marker before reconnecting", async () => {
    const validBuild = {
      jobId: "11111111-1111-4111-8111-111111111111",
      selectionHash: "a".repeat(40),
      startedAt: "2026-08-30T12:00:00.000Z",
    };
    const removedKeys: string[] = [];
    const validCache = {
      async getItem() {
        return validBuild;
      },
      async removeItem(key: string) {
        removedKeys.push(key);
      },
    };

    await expect(
      readPersistedPlaylistBuild(validCache, "playlist-builder-build:account-a")
    ).resolves.toEqual(validBuild);
    expect(removedKeys).toEqual([]);

    const invalidCache = {
      async getItem() {
        return { ...validBuild, jobId: "not-a-job" };
      },
      async removeItem(key: string) {
        removedKeys.push(key);
      },
    };
    await expect(
      readPersistedPlaylistBuild(
        invalidCache,
        "playlist-builder-build:account-a"
      )
    ).resolves.toBeNull();
    expect(removedKeys).toEqual(["playlist-builder-build:account-a"]);
  });
});

function user(
  id: string,
  accessToken: string,
  expiresAt = new Date(Date.now() + 60_000).toISOString()
): User {
  return {
    id,
    spotifyId: id,
    name: id,
    tokens: {
      accessToken,
      clientId: "client-id",
      expiresAt,
      tokenType: "Bearer",
    },
  };
}

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
