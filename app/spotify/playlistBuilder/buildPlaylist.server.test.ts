import { describe, expect, test } from "bun:test";
import type { SpotifySdk } from "../createSpotifySdk";
import {
  canonicalizePlaylistTracks,
  createVerifiedPlaylist,
  ensurePlaylistTrack,
  PlaylistCreationResidualError,
  type PlaylistCreationDependencies,
  resolvePlaylistTracks,
  selectNewSongCandidates,
} from "./buildPlaylist.server";

describe("playlist track resolution", () => {
  test("fails the whole resolution when any track cannot be verified", async () => {
    const verifiedTrack = {
      id: "verified-id",
      name: "Known Song",
      artist_name: "Known Artist",
    };
    const sdk = {
      search() {
        return Promise.resolve({ tracks: { items: [] } });
      },
    } as unknown as SpotifySdk;

    await expect(
      resolvePlaylistTracks(
        [
          verifiedTrack,
          {
            id: "invented-id",
            name: "Unknown Song",
            artist_name: "Unknown Artist",
          },
        ],
        new Map([[verifiedTrack.id, verifiedTrack]]),
        sdk
      )
    ).resolves.toBeNull();
  });

  test("uses canonical metadata for a supplied Spotify ID without searching", async () => {
    let searchCalls = 0;
    const sdk = {
      search() {
        searchCalls += 1;
        throw new Error("search should not run");
      },
    } as unknown as SpotifySdk;
    const verifiedTrack = {
      id: "verified-id",
      name: "Known Song",
      artist_name: "Known Artist",
    };

    await expect(
      ensurePlaylistTrack(
        {
          id: "verified-id",
          name: "Model-Rewritten Song",
          artist_name: "Wrong Artist",
        },
        new Map([["verified-id", verifiedTrack]]),
        sdk
      )
    ).resolves.toEqual(verifiedTrack);
    expect(searchCalls).toBe(0);
  });

  test("selects an exact search match instead of the first result", async () => {
    let capturedQuery = "";
    let capturedLimit = 0;
    const sdk = {
      search(query: string, _types: string[], _market: string, limit: number) {
        capturedQuery = query;
        capturedLimit = limit;
        return Promise.resolve({
          tracks: {
            items: [
              spotifyTrack("wrong-id", "Target Song", "Wrong Artist"),
              spotifyTrack("exact-id", "Target Song", "Target Artist"),
            ],
          },
        });
      },
    } as unknown as SpotifySdk;

    const track = await ensurePlaylistTrack(
      {
        id: "unverified-id",
        name: "Target Song",
        artist_name: "Target Artist",
      },
      new Map(),
      sdk
    );

    expect(track.id).toBe("exact-id");
    expect(capturedQuery).toContain('track:"Target Song"');
    expect(capturedQuery).toContain('artist:"Target Artist"');
    expect(capturedLimit).toBe(10);
  });

  test("clears an unverified ID when search cannot resolve it", async () => {
    const sdk = {
      search() {
        return Promise.resolve({ tracks: { items: [] } });
      },
    } as unknown as SpotifySdk;

    await expect(
      ensurePlaylistTrack(
        {
          id: "model-invented-id",
          name: "Unknown Song",
          artist_name: "Unknown Artist",
        },
        new Map(),
        sdk
      )
    ).resolves.toEqual({
      id: "",
      name: "Unknown Song",
      artist_name: "Unknown Artist",
    });
  });

  test("accepts an exact primary artist match on a collaboration", async () => {
    const sdk = {
      search() {
        return Promise.resolve({
          tracks: {
            items: [
              {
                ...spotifyTrack("collab-id", "Shared Song", "Target Artist"),
                artists: [
                  { id: "primary-id", name: "Target Artist" },
                  { id: "guest-id", name: "Guest Artist" },
                ],
              },
            ],
          },
        });
      },
    } as unknown as SpotifySdk;

    await expect(
      ensurePlaylistTrack(
        {
          id: "",
          name: "Shared Song",
          artist_name: "Target Artist",
        },
        new Map(),
        sdk
      )
    ).resolves.toMatchObject({
      id: "collab-id",
      name: "Shared Song",
      artist_name: "Target Artist",
    });
  });

  test("rejects duplicate normalized search candidates before searching", async () => {
    let searchCalls = 0;
    const sdk = {
      search() {
        searchCalls += 1;
        throw new Error("search should not run");
      },
    } as unknown as SpotifySdk;

    await expect(
      resolvePlaylistTracks(
        [
          { id: "", name: " Same Song ", artist_name: "THE ARTIST" },
          { id: "invented", name: "same   song", artist_name: "the artist" },
        ],
        new Map(),
        sdk
      )
    ).resolves.toBeNull();
    expect(searchCalls).toBe(0);
  });
});

describe("verified playlist creation", () => {
  test("does not create a playlist when any final ID is invalid", async () => {
    let createCalls = 0;
    let addCalls = 0;
    const dependencies = creationDependencies({
      getTracks: async () => {
        throw new Error("Spotify track was not found");
      },
      createPlaylist: async () => {
        createCalls += 1;
        return { id: "playlist" } as never;
      },
      addPlaylistItems: async () => {
        addCalls += 1;
        return { snapshot_id: "snapshot" };
      },
    });

    await expect(
      createVerifiedPlaylist(
        {} as SpotifySdk,
        "Verified playlist",
        [{ id: "nonexistent", name: "Invented" }],
        dependencies
      )
    ).rejects.toThrow("Spotify track was not found");

    expect(createCalls).toBe(0);
    expect(addCalls).toBe(0);
  });

  test("canonicalizes final IDs while preserving playlist order", async () => {
    const requestedIds: string[][] = [];
    const tracks = await canonicalizePlaylistTracks(
      [
        { id: "two", name: "Untrusted Two" },
        { id: "one", name: "Untrusted One" },
      ],
      {} as SpotifySdk,
      async (_sdk, ids) => {
        requestedIds.push(ids);
        return ids.map((id) => spotifyTrack(id, `Canonical ${id}`, "Artist"));
      }
    );

    expect(requestedIds).toEqual([["two", "one"]]);
    expect(tracks.map(({ id, name }) => [id, name])).toEqual([
      ["two", "Canonical two"],
      ["one", "Canonical one"],
    ]);
  });

  test("rejects duplicate canonical IDs before playlist creation", async () => {
    let createCalls = 0;
    const dependencies = creationDependencies({
      createPlaylist: async () => {
        createCalls += 1;
        return { id: "playlist" } as never;
      },
    });

    await expect(
      createVerifiedPlaylist(
        {} as SpotifySdk,
        "Verified playlist",
        [
          { id: "track", name: "Track" },
          { id: "track", name: "Duplicate Track" },
        ],
        dependencies
      )
    ).rejects.toThrow("duplicate Spotify tracks");
    expect(createCalls).toBe(0);
  });

  test("removes a newly created playlist when population fails", async () => {
    const removedPlaylistIds: string[] = [];
    const dependencies = creationDependencies({
      addPlaylistItems: async () => {
        throw new Error("add failed");
      },
      removePlaylistFromLibrary: async (_sdk, playlistId) => {
        removedPlaylistIds.push(playlistId);
      },
    });

    await expect(
      createVerifiedPlaylist(
        {} as SpotifySdk,
        "Verified playlist",
        [{ id: "track", name: "Track" }],
        dependencies
      )
    ).rejects.toThrow("add failed");
    expect(removedPlaylistIds).toEqual(["playlist"]);
  });

  test("surfaces a possible residual when compensation also fails", async () => {
    const dependencies = creationDependencies({
      addPlaylistItems: async () => {
        throw new Error("add failed");
      },
      removePlaylistFromLibrary: async () => {
        throw new Error("cleanup failed");
      },
    });

    await expect(
      createVerifiedPlaylist(
        {} as SpotifySdk,
        "Verified playlist",
        [{ id: "track", name: "Track" }],
        dependencies
      )
    ).rejects.toBeInstanceOf(PlaylistCreationResidualError);
  });
});

describe("new-song candidate bounds", () => {
  test("deduplicates, round-robins artists, and caps work relative to song count", () => {
    const duplicate = { id: "shared", name: "Shared" };
    const firstCatalog = [
      duplicate,
      ...Array.from({ length: 24 }, (_, index) => ({
        id: `first-${index}`,
        name: `First ${index}`,
      })),
    ];
    const secondCatalog = [
      duplicate,
      ...Array.from({ length: 24 }, (_, index) => ({
        id: `second-${index}`,
        name: `Second ${index}`,
      })),
    ];

    const selected = selectNewSongCandidates(
      [firstCatalog, secondCatalog],
      10
    );

    expect(selected).toHaveLength(30);
    expect(new Set(selected.map(({ id }) => id)).size).toBe(30);
    expect(selected.slice(0, 5).map(({ id }) => id)).toEqual([
      "shared",
      "first-0",
      "second-0",
      "first-1",
      "second-1",
    ]);
    expect(selected.some(({ id }) => id === "first-20")).toBeFalse();
    expect(selected.some(({ id }) => id === "second-20")).toBeFalse();
  });
});

function creationDependencies(
  overrides: Partial<PlaylistCreationDependencies> = {}
): PlaylistCreationDependencies {
  return {
    getTracks: async (_sdk, ids) =>
      ids.map((id) => spotifyTrack(id, `Track ${id}`, "Artist")),
    createPlaylist: async () => ({ id: "playlist" }) as never,
    addPlaylistItems: async () => ({ snapshot_id: "snapshot" }),
    removePlaylistFromLibrary: async () => undefined,
    ...overrides,
  };
}

function spotifyTrack(id: string, name: string, artistName: string) {
  return {
    id,
    name,
    artists: [{ id: `${id}-artist`, name: artistName }],
    popularity: 50,
  };
}
