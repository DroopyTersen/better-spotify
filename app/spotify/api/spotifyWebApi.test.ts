import { describe, expect, test } from "bun:test";
import type { SpotifySdk } from "../createSpotifySdk";
import {
  normalizePlaylist,
  normalizeSimplifiedPlaylist,
  spotifyWebApi,
} from "./spotifyWebApi";

const fakeSdk = (result: unknown) => {
  const calls: Array<{
    method: string;
    path: string;
    body: unknown;
  }> = [];
  const sdk = {
    makeRequest(method: string, path: string, body?: unknown) {
      calls.push({ method, path, body });
      return Promise.resolve(result);
    },
  } as unknown as SpotifySdk;
  return { calls, sdk };
};

const playlistItemsPage = ({
  items,
  next,
  offset,
  total,
}: {
  items: Array<{ item: { id: string; name: string } }>;
  next: string | null;
  offset: number;
  total: number;
}) => ({
  href: "",
  items,
  limit: 50,
  next,
  offset,
  previous: offset > 0 ? "previous" : null,
  total,
});

describe("Spotify 2026 compatibility", () => {
  test("normalizes renamed playlist item fields", () => {
    const track = { id: "track-1", name: "One" };
    const playlist = normalizePlaylist({
      id: "playlist-1",
      items: {
        href: "",
        items: [{ item: track }],
        limit: 50,
        next: null,
        offset: 0,
        previous: null,
        total: 1,
      },
    } as never);

    expect(playlist.tracks.items[0]?.track).toMatchObject(track);
    expect(playlist.tracks.total).toBe(1);
    expect(playlist.itemsAvailability).toBe("available");
  });

  test("normalizes renamed playlist summary fields", () => {
    const playlist = normalizeSimplifiedPlaylist({
      id: "playlist-1",
      items: { href: "/items", total: 12 },
    } as never);

    expect(playlist.tracks).toEqual({ href: "/items", total: 12 });
  });

  test("loads every playlist item page before exposing a playlist", async () => {
    const calls: Array<{ method: string; path: string }> = [];
    const responses = [
      {
        id: "playlist-1",
        snapshot_id: "snapshot-1",
        items: playlistItemsPage({
          items: [{ item: { id: "track-1", name: "One" } }],
          next: "next-page",
          offset: 0,
          total: 3,
        }),
      },
      playlistItemsPage({
        items: [
          { item: { id: "track-2", name: "Two" } },
          { item: { id: "track-3", name: "Three" } },
        ],
        next: null,
        offset: 1,
        total: 3,
      }),
      { snapshot_id: "snapshot-1" },
    ];
    const sdk = {
      makeRequest(method: string, path: string) {
        calls.push({ method, path });
        return Promise.resolve(responses.shift());
      },
    } as unknown as SpotifySdk;

    const playlist = await spotifyWebApi.getPlaylist(sdk, "playlist-1");

    expect(playlist.tracks.items.map(({ track }) => track.id)).toEqual([
      "track-1",
      "track-2",
      "track-3",
    ]);
    expect(playlist.tracks.total).toBe(3);
    expect(calls).toEqual([
      { method: "GET", path: "playlists/playlist-1" },
      {
        method: "GET",
        path: "playlists/playlist-1/items?limit=50&offset=1",
      },
      {
        method: "GET",
        path: "playlists/playlist-1?fields=snapshot_id",
      },
    ]);
  });

  test("fails closed when a later playlist page changes its total", async () => {
    const responses = [
      {
        id: "playlist-1",
        snapshot_id: "snapshot-1",
        items: playlistItemsPage({
          items: [{ item: { id: "track-1", name: "One" } }],
          next: "next-page",
          offset: 0,
          total: 2,
        }),
      },
      playlistItemsPage({
        items: [{ item: { id: "track-2", name: "Two" } }],
        next: null,
        offset: 1,
        total: 3,
      }),
    ];
    const sdk = {
      makeRequest() {
        return Promise.resolve(responses.shift());
      },
    } as unknown as SpotifySdk;

    await expect(
      spotifyWebApi.getPlaylist(sdk, "playlist-1")
    ).rejects.toThrow("changed its total");
  });

  test("fails closed when the playlist snapshot changes during a full read", async () => {
    const responses = [
      {
        id: "playlist-1",
        snapshot_id: "snapshot-1",
        items: playlistItemsPage({
          items: [{ item: { id: "track-1", name: "One" } }],
          next: "next-page",
          offset: 0,
          total: 2,
        }),
      },
      playlistItemsPage({
        items: [{ item: { id: "track-2", name: "Two" } }],
        next: null,
        offset: 1,
        total: 2,
      }),
      { snapshot_id: "snapshot-2" },
    ];
    const sdk = {
      makeRequest() {
        return Promise.resolve(responses.shift());
      },
    } as unknown as SpotifySdk;

    await expect(
      spotifyWebApi.getPlaylist(sdk, "playlist-1")
    ).rejects.toThrow("changed while it was being loaded");
  });

  test("fails closed when Spotify pagination stalls", async () => {
    const responses = [
      {
        id: "playlist-1",
        items: playlistItemsPage({
          items: [{ item: { id: "track-1", name: "One" } }],
          next: "next-page",
          offset: 0,
          total: 2,
        }),
      },
      playlistItemsPage({
        items: [],
        next: "next-page",
        offset: 1,
        total: 2,
      }),
    ];
    const sdk = {
      makeRequest() {
        return Promise.resolve(responses.shift());
      },
    } as unknown as SpotifySdk;

    await expect(
      spotifyWebApi.getPlaylist(sdk, "playlist-1")
    ).rejects.toThrow("stalled before completion");
  });

  test("fails closed when Spotify repeats a pagination cursor", async () => {
    const responses = [
      {
        id: "playlist-1",
        items: playlistItemsPage({
          items: [{ item: { id: "track-1", name: "One" } }],
          next: "repeated-page",
          offset: 0,
          total: 3,
        }),
      },
      playlistItemsPage({
        items: [{ item: { id: "track-2", name: "Two" } }],
        next: "repeated-page",
        offset: 1,
        total: 3,
      }),
    ];
    const sdk = {
      makeRequest() {
        return Promise.resolve(responses.shift());
      },
    } as unknown as SpotifySdk;

    await expect(
      spotifyWebApi.getPlaylist(sdk, "playlist-1")
    ).rejects.toThrow("repeated a page");
  });

  test("does not request protected items for a metadata-only playlist", async () => {
    const { calls, sdk } = fakeSdk({ id: "followed-playlist" });

    const playlist = await spotifyWebApi.getPlaylist(
      sdk,
      "followed-playlist"
    );

    expect(playlist.tracks.items).toEqual([]);
    expect(playlist.itemsAvailability).toBe("unavailable");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.path).toBe("playlists/followed-playlist");
  });

  test("fetches bulk entities through supported single-item routes", async () => {
    const { calls, sdk } = fakeSdk({ id: "artist" });

    await spotifyWebApi.getArtists(sdk, ["one", "two"]);

    expect(calls.map(({ method, path }) => [method, path])).toEqual([
      ["GET", "artists/one"],
      ["GET", "artists/two"],
    ]);
  });

  test("bounds concurrent single-item fetches and preserves input order", async () => {
    let activeRequests = 0;
    let maxActiveRequests = 0;
    const sdk = {
      async makeRequest(_method: string, path: string) {
        activeRequests += 1;
        maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
        await new Promise((resolve) => setTimeout(resolve, 0));
        activeRequests -= 1;
        return { id: path.split("/").at(-1) };
      },
    } as unknown as SpotifySdk;
    const trackIds = Array.from({ length: 12 }, (_, index) => `track-${index}`);

    const tracks = await spotifyWebApi.getTracks(sdk, trackIds);

    expect(maxActiveRequests).toBe(5);
    expect(tracks.map(({ id }) => id)).toEqual(trackIds);
  });

  test("derives an artist catalog from supported album endpoints", async () => {
    const albumCalls: string[] = [];
    const sdk = {
      artists: {
        albums() {
          return Promise.resolve({
            items: [{ id: "album-1" }, { id: "album-2" }],
          });
        },
      },
      albums: {
        get(albumId: string) {
          albumCalls.push(albumId);
          return Promise.resolve({
            id: albumId,
            name: `Album ${albumId}`,
            images: [],
            tracks: {
              href: "",
              items: [
                {
                  id: `${albumId}-track`,
                  name: `Track ${albumId}`,
                  artists: [{ id: "artist-1", name: "Artist One" }],
                },
                {
                  id: `${albumId}-guest-track`,
                  name: `Guest Track ${albumId}`,
                  artists: [{ id: "guest-artist", name: "Guest Artist" }],
                },
              ],
              limit: 50,
              next: null,
              offset: 0,
              previous: null,
              total: 1,
            },
          });
        },
      },
    } as unknown as SpotifySdk;

    const tracks = await spotifyWebApi.getArtistCatalogTracks(
      sdk,
      "artist-1"
    );

    expect(albumCalls).toEqual(["album-1", "album-2"]);
    expect(tracks.map(({ id }) => id)).toEqual([
      "album-1-track",
      "album-2-track",
    ]);
  });

  test("uses embedded album tracks and stops at the display limit", async () => {
    let albumTrackPageCalls = 0;
    const embeddedTracks = Array.from({ length: 12 }, (_, index) => ({
      id: `track-${index + 1}`,
      name: `Track ${index + 1}`,
      artists: [{ id: "artist-1", name: "Artist One" }],
    }));
    const sdk = {
      artists: {
        albums() {
          return Promise.resolve({
            items: [{ id: "album-1", total_tracks: embeddedTracks.length }],
          });
        },
      },
      albums: {
        get() {
          return Promise.resolve({
            id: "album-1",
            name: "Album One",
            images: [],
            tracks: {
              href: "",
              items: embeddedTracks,
              limit: 50,
              next: "next",
              offset: 0,
              previous: null,
              total: 52,
            },
          });
        },
        tracks() {
          albumTrackPageCalls += 1;
          throw new Error("Catalog previews must not paginate album tracks");
        },
      },
    } as unknown as SpotifySdk;

    const tracks = await spotifyWebApi.getArtistCatalogTracks(
      sdk,
      "artist-1"
    );

    expect(tracks.map(({ id }) => id)).toEqual(
      embeddedTracks.slice(0, 10).map(({ id }) => id)
    );
    expect(albumTrackPageCalls).toBe(0);
  });

  test("loads every album track page", async () => {
    const calls: number[] = [];
    const firstTracks = Array.from({ length: 50 }, (_, index) =>
      simplifiedTrack(`track-${index}`)
    );
    const sdk = {
      albums: {
        tracks(
          _albumId: string,
          _market: string,
          _limit: number,
          offset: number
        ) {
          calls.push(offset);
          return Promise.resolve(
            offset === 0
              ? albumPage(firstTracks, 0, 52, "next")
              : albumPage(
                  [simplifiedTrack("track-50"), simplifiedTrack("track-51")],
                  50,
                  52,
                  null
                )
          );
        },
      },
    } as unknown as SpotifySdk;

    const tracks = await spotifyWebApi.getAlbumTracks(sdk, "album");

    expect(calls).toEqual([0, 50]);
    expect(tracks).toHaveLength(52);
    expect(tracks.at(-1)?.id).toBe("track-51");
  });

  test("loads every current-user playlist and artist album page", async () => {
    const playlistOffsets: number[] = [];
    const albumOffsets: number[] = [];
    const sdk = {
      makeRequest(_method: string, path: string) {
        const offset = Number(new URL(`https://api.test/${path}`).searchParams.get("offset"));
        playlistOffsets.push(offset);
        return Promise.resolve(
          offset === 0
            ? offsetPage(
                Array.from({ length: 50 }, (_, index) => ({
                  id: `playlist-${index}`,
                  items: { href: "", total: 0 },
                })),
                0,
                52,
                "next-playlists"
              )
            : offsetPage(
                [
                  { id: "playlist-50", items: { href: "", total: 0 } },
                  { id: "playlist-51", items: { href: "", total: 0 } },
                ],
                50,
                52,
                null
              )
        );
      },
      artists: {
        albums(
          _artistId: string,
          _groups: string | undefined,
          _market: string,
          _limit: number,
          offset: number
        ) {
          albumOffsets.push(offset);
          return Promise.resolve(
            offset === 0
              ? offsetPage(
                  Array.from({ length: 50 }, (_, index) => ({
                    id: `album-${index}`,
                  })),
                  0,
                  51,
                  "next-albums"
                )
              : offsetPage([{ id: "album-50" }], 50, 51, null)
          );
        },
      },
    } as unknown as SpotifySdk;

    const [playlists, albums] = await Promise.all([
      spotifyWebApi.getCurrentUserPlaylists(sdk),
      spotifyWebApi.getArtistAlbums(sdk, "artist"),
    ]);

    expect(playlistOffsets).toEqual([0, 50]);
    expect(playlists.items).toHaveLength(52);
    expect(playlists.items.at(-1)?.id).toBe("playlist-51");
    expect(albumOffsets).toEqual([0, 50]);
    expect(albums).toHaveLength(51);
    expect(albums.at(-1)?.id).toBe("album-50");
  });

  test("fails closed when album pagination changes its total", async () => {
    const sdk = {
      albums: {
        tracks(
          _albumId: string,
          _market: string,
          _limit: number,
          offset: number
        ) {
          return Promise.resolve(
            offset === 0
              ? albumPage([simplifiedTrack("track-0")], 0, 2, "next")
              : albumPage([simplifiedTrack("track-1")], 1, 3, null)
          );
        },
      },
    } as unknown as SpotifySdk;

    await expect(
      spotifyWebApi.getAlbumTracks(sdk, "album")
    ).rejects.toThrow("changed its total");
  });

  test("uses current playlist item routes and payload names", async () => {
    const { calls, sdk } = fakeSdk({ snapshot_id: "snapshot" });

    await spotifyWebApi.addPlaylistItems(sdk, "playlist", [
      "spotify:track:one",
    ]);
    await spotifyWebApi.removePlaylistItems(sdk, "playlist", [
      "spotify:track:one",
    ]);
    await spotifyWebApi.replacePlaylistItems(sdk, "playlist", [
      "spotify:track:two",
    ]);

    expect(calls).toEqual([
      {
        method: "POST",
        path: "playlists/playlist/items",
        body: { uris: ["spotify:track:one"], position: undefined },
      },
      {
        method: "DELETE",
        path: "playlists/playlist/items",
        body: {
          items: [{ uri: "spotify:track:one" }],
          snapshot_id: undefined,
        },
      },
      {
        method: "PUT",
        path: "playlists/playlist/items",
        body: { uris: ["spotify:track:two"] },
      },
    ]);
  });

  test("rejects invalid playlist mutation sizes before making a request", () => {
    const { sdk } = fakeSdk({ snapshot_id: "snapshot" });
    const oversizedUris = Array.from(
      { length: 101 },
      (_, index) => `spotify:track:${index}`
    );

    expect(() =>
      spotifyWebApi.addPlaylistItems(sdk, "playlist", oversizedUris)
    ).toThrow(RangeError);
    expect(() =>
      spotifyWebApi.removePlaylistItems(sdk, "playlist", oversizedUris)
    ).toThrow(RangeError);
    expect(() =>
      spotifyWebApi.replacePlaylistItems(sdk, "playlist", oversizedUris)
    ).toThrow(RangeError);
    expect(() => spotifyWebApi.addPlaylistItems(sdk, "playlist", [])).toThrow(
      RangeError
    );
    expect(() =>
      spotifyWebApi.removePlaylistItems(sdk, "playlist", [])
    ).toThrow(RangeError);
  });
});

function simplifiedTrack(id: string) {
  return {
    id,
    name: id,
    artists: [{ id: "artist", name: "Artist" }],
  };
}

function albumPage(
  items: ReturnType<typeof simplifiedTrack>[],
  offset: number,
  total: number,
  next: string | null
) {
  return {
    href: "",
    items,
    limit: 50,
    next,
    offset,
    previous: offset > 0 ? "previous" : null,
    total,
  };
}

function offsetPage<Item>(
  items: Item[],
  offset: number,
  total: number,
  next: string | null
) {
  return {
    href: "",
    items,
    limit: 50,
    next,
    offset,
    previous: offset > 0 ? "previous" : null,
    total,
  };
}
