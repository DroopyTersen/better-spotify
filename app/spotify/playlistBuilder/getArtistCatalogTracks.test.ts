import { describe, expect, test } from "bun:test";
import type { SpotifySdk } from "../createSpotifySdk";
import { getArtistCatalogTracks } from "./getArtistCatalogTracks";

describe("getArtistCatalogTracks", () => {
  test("loads and deduplicates albums and singles with truthful metadata", async () => {
    const albumCalls: string[] = [];
    let includeGroups = "";
    let albumPageLimit = 0;
    let albumPageOffset = -1;
    const sdk = {
      artists: {
        albums(
          _artistId: string,
          groups: string,
          _market: string,
          limit: number,
          offset: number
        ) {
          includeGroups = groups;
          albumPageLimit = limit;
          albumPageOffset = offset;
          return Promise.resolve({
            items: [
              { id: "album-old", release_date: "2020", total_tracks: 2 },
              { id: "single-new", release_date: "2025", total_tracks: 1 },
              { id: "album-old", release_date: "2020", total_tracks: 2 },
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
                })
              ),
            },
          });
        },
      },
    } as unknown as SpotifySdk;

    const tracks = await getArtistCatalogTracks(sdk, "artist", {
      releaseLimit: 10,
      trackLimit: 3,
    });

    expect(includeGroups).toBe("album,single");
    expect(albumPageLimit).toBe(50);
    expect(albumPageOffset).toBe(0);
    expect(albumCalls).toEqual(["single-new", "album-old"]);
    expect(tracks.map(({ id }) => id)).toEqual([
      "single-new-0",
      "album-old-0",
      "album-old-1",
    ]);
    expect(tracks[0]).toMatchObject({
      popularity: null,
      album_popularity: 70,
      artist_id: "artist",
      artist_name: "Artist",
      release_date: "2025",
      spotify_uri: "spotify:track:single-new-0",
    });
  });

  test("caps provider fan-out at ten catalog releases", async () => {
    const albumCalls: string[] = [];
    let activeRequests = 0;
    let maximumActiveRequests = 0;
    const sdk = {
      artists: {
        albums() {
          return Promise.resolve({
            items: Array.from({ length: 12 }, (_, index) => ({
              id: `album-${index}`,
              release_date: String(2025 - index),
              total_tracks: 1,
            })),
          });
        },
      },
      albums: {
        async get(albumId: string) {
          albumCalls.push(albumId);
          activeRequests += 1;
          maximumActiveRequests = Math.max(
            maximumActiveRequests,
            activeRequests
          );
          await new Promise((resolve) => setTimeout(resolve, 1));
          activeRequests -= 1;
          return {
            id: albumId,
            name: albumId,
            images: [],
            tracks: { items: [] },
          };
        },
      },
    } as unknown as SpotifySdk;

    await getArtistCatalogTracks(sdk, "artist", {
      releaseLimit: 10,
      trackLimit: 50,
    });

    expect(albumCalls).toEqual(
      Array.from({ length: 10 }, (_, index) => `album-${index}`)
    );
    expect(maximumActiveRequests).toBe(5);
  });

  test("rejects unsafe catalog bounds before provider calls", async () => {
    let providerCalls = 0;
    const sdk = {
      artists: {
        albums() {
          providerCalls += 1;
          return Promise.resolve({ items: [] });
        },
      },
    } as unknown as SpotifySdk;

    await expect(
      getArtistCatalogTracks(sdk, "artist", {
        releaseLimit: 10,
        trackLimit: 51,
      })
    ).rejects.toThrow(RangeError);
    await expect(
      getArtistCatalogTracks(sdk, "artist", {
        releaseLimit: 11,
        trackLimit: 20,
      })
    ).rejects.toThrow(RangeError);
    expect(providerCalls).toBe(0);
  });
});
