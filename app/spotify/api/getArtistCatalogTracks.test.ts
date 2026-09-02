import { describe, expect, test } from "bun:test";
import type { SpotifySdk } from "../createSpotifySdk";
import { getArtistCatalogTracks } from "./getArtistCatalogTracks";

describe("getArtistCatalogTracks", () => {
  test("loads albums and singles deterministically with useful metadata", async () => {
    const albumCalls: string[] = [];
    let includeGroups = "";
    const sdk = {
      artists: {
        albums(
          _artistId: string,
          groups: string,
          _market: string,
          _limit: number,
          _offset: number
        ) {
          includeGroups = groups;
          return Promise.resolve({
            items: [
              { id: "album-old", release_date: "2020", total_tracks: 2 },
              { id: "single-new", release_date: "2025", total_tracks: 1 },
            ],
          });
        },
      },
      albums: {
        get(albumId: string) {
          albumCalls.push(albumId);
          return Promise.resolve({
            id: albumId,
            name: albumId,
            images: [],
            release_date: albumId === "single-new" ? "2025" : "2020",
            popularity: albumId === "single-new" ? 70 : 40,
            tracks: {
              items: Array.from(
                { length: albumId === "single-new" ? 1 : 2 },
                (_, index) => ({
                  id: `${albumId}-${index}`,
                  name: `Track ${index}`,
                  artists: [{ id: "artist", name: "Artist" }],
                  uri: `spotify:track:${albumId}-${index}`,
                  external_urls: {
                    spotify: `https://open.spotify.com/track/${albumId}-${index}`,
                  },
                })
              ),
            },
          });
        },
      },
    } as unknown as SpotifySdk;

    const tracks = await getArtistCatalogTracks(sdk, "artist", 3);

    expect(includeGroups).toBe("album,single");
    expect(albumCalls).toEqual(["single-new", "album-old"]);
    expect(tracks.map(({ id }) => id)).toEqual([
      "single-new-0",
      "album-old-0",
      "album-old-1",
    ]);
    expect(tracks[0]).toMatchObject({
      popularity: 70,
      artist_id: "artist",
      artist_name: "Artist",
      release_date: "2025",
      spotify_uri: "spotify:track:single-new-0",
      external_url: "https://open.spotify.com/track/single-new-0",
    });
  });

  test("rejects an unsafe track limit before provider calls", async () => {
    let providerCalls = 0;
    const sdk = {
      artists: {
        albums() {
          providerCalls += 1;
          return Promise.resolve({ items: [] });
        },
      },
    } as unknown as SpotifySdk;

    await expect(getArtistCatalogTracks(sdk, "artist", 101)).rejects.toThrow(
      RangeError
    );
    expect(providerCalls).toBe(0);
  });
});
