import { describe, expect, test } from "bun:test";
import {
  buildFamiliarSongsPool,
  type FamiliarSongPoolDependencies,
  type GetFamiliarSongPoolInput,
} from "./buildFamiliarSongPool";

describe("buildFamiliarSongsPool", () => {
  test("rejects oversized artist selections before any provider call", async () => {
    let providerCalls = 0;
    const dependencies: FamiliarSongPoolDependencies = {
      getTracks: async () => {
        providerCalls += 1;
        return [];
      },
      getArtistTracks: async () => {
        providerCalls += 1;
        return [];
      },
    };

    await expect(
      buildFamiliarSongsPool(
        inputWithArtists(
          Array.from({ length: 26 }, (_, index) => `artist${index}`),
          ["track1"]
        ),
        dependencies
      )
    ).rejects.toThrow(RangeError);
    expect(providerCalls).toBe(0);
  });

  test("bounds artist catalog fan-out and preserves selection order", async () => {
    let active = 0;
    let maximumActive = 0;
    const dependencies: FamiliarSongPoolDependencies = {
      getTracks: async () => [],
      getArtistTracks: async (artistId) => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await new Promise((resolve) => setTimeout(resolve, 1));
        active -= 1;
        return [
          {
            id: `track-${artistId}`,
            name: `Track ${artistId}`,
            artist_id: artistId,
            artist_name: `Artist ${artistId}`,
            release_date: "2025-01-01",
            album_popularity: 80,
            spotify_uri: `spotify:track:${artistId}`,
          },
        ];
      },
    };

    const pool = await buildFamiliarSongsPool(
      inputWithArtists(["a", "b", "c", "d", "e"]),
      dependencies
    );

    expect(maximumActive).toBe(3);
    expect(pool.artistCatalogs.map(({ artist_id }) => artist_id)).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
    ]);
    expect(pool.artistCatalogs[0]?.tracks[0]).toEqual({
      id: "track-a",
      name: "Track a",
    });
  });

  test("keeps every explicitly selected track beyond the former 20-track cutoff", async () => {
    const selectedTrackIds = Array.from(
      { length: 25 },
      (_, index) => `track${index}`
    );
    let requestedTrackIds: string[] = [];
    const dependencies: FamiliarSongPoolDependencies = {
      getTracks: async (trackIds) => {
        requestedTrackIds = trackIds;
        return trackIds.map((id) => ({
          id,
          name: id,
          popularity: 50,
          artists: [{ id: "artist1", name: "Artist" }],
        }));
      },
      getArtistTracks: async () => [],
    };

    const pool = await buildFamiliarSongsPool(
      inputWithArtists([], selectedTrackIds),
      dependencies
    );

    expect(requestedTrackIds).toEqual(selectedTrackIds);
    expect(pool.specifiedTracks.map(({ id }) => id)).toEqual(
      selectedTrackIds
    );
  });
});

function inputWithArtists(
  artistIds: string[],
  trackIds: string[] = []
): GetFamiliarSongPoolInput {
  return {
    topTracks: [],
    playHistory: [],
    likedTracks: [],
    request: { artistIds, trackIds },
  };
}
