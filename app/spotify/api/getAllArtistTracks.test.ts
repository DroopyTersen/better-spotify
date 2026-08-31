import { describe, expect, test } from "bun:test";
import type { SpotifySdk } from "../createSpotifySdk";
import { getAllArtistTracks } from "./getAllArtistTracks";

describe("getAllArtistTracks", () => {
  test("deduplicates and caps each artist catalog", async () => {
    const sdk = {
      artists: {
        albums() {
          return Promise.resolve({
            items: [{ id: "album-a" }, { id: "album-b" }],
          });
        },
      },
      albums: {
        tracks(albumId: string) {
          return Promise.resolve({
            href: "",
            items: [
              simplifiedTrack("shared"),
              ...Array.from({ length: 14 }, (_, index) =>
                simplifiedTrack(`${albumId}-${index}`)
              ),
            ],
            limit: 50,
            next: null,
            offset: 0,
            previous: null,
            total: 15,
          });
        },
      },
    } as unknown as SpotifySdk;

    const tracks = await getAllArtistTracks(sdk, "artist", 10);

    expect(tracks).toHaveLength(10);
    expect(new Set(tracks.map(({ id }) => id)).size).toBe(10);
  });

  test("rejects an unsafe track limit before provider calls", async () => {
    await expect(
      getAllArtistTracks({} as SpotifySdk, "artist", 101)
    ).rejects.toThrow(RangeError);
  });
});

function simplifiedTrack(id: string) {
  return {
    id,
    name: id,
    artists: [{ id: "artist", name: "Artist" }],
  };
}
