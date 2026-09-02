import type {
  Album,
  Artist,
  Page,
  Playlist,
  PlaylistedTrack,
  SimplifiedPlaylist,
  SimplifiedAlbum,
  SimplifiedTrack,
  SnapshotReference,
  Track,
  TrackReference,
} from "@spotify/web-api-ts-sdk";
import type { SpotifySdk } from "../createSpotifySdk";
import { mapWithConcurrency } from "./mapWithConcurrency";

export type ArtistCatalogTrack = Pick<Track, "id" | "name" | "artists"> & {
  spotifyUri: string | null;
  externalUrl: string | null;
  album: Pick<Album, "id" | "name" | "images"> & {
    releaseDate: string | null;
    popularity: number | null;
  };
};

type CurrentPlaylistItem = Omit<PlaylistedTrack<Track>, "track"> & {
  item?: Track | null;
  track?: Track | null;
};

type CurrentPlaylistItemsPage = Omit<
  Page<PlaylistedTrack<Track>>,
  "items"
> & {
  items: CurrentPlaylistItem[];
};

type CurrentPlaylist = Omit<Playlist<Track>, "tracks"> & {
  items?: CurrentPlaylistItemsPage | null;
  tracks?: Page<PlaylistedTrack<Track>> | null;
};

type CurrentSimplifiedPlaylist = Omit<SimplifiedPlaylist, "tracks"> & {
  items?: TrackReference | null;
  tracks?: TrackReference | null;
};

const emptyPage = <T>(): Page<T> => ({
  href: "",
  items: [],
  limit: 0,
  next: null,
  offset: 0,
  previous: null,
  total: 0,
});

const normalizePlaylistItems = (
  page?: CurrentPlaylistItemsPage | Page<PlaylistedTrack<Track>> | null
): Page<PlaylistedTrack<Track>> => {
  if (!page) return emptyPage();

  const items = page.items.flatMap((entry) => {
    const currentEntry = entry as CurrentPlaylistItem;
    const track = currentEntry.item ?? currentEntry.track;
    return track ? [{ ...entry, track } as PlaylistedTrack<Track>] : [];
  });

  return { ...page, items, total: page.total ?? items.length };
};

export type CompatiblePlaylist = Playlist<Track> & {
  itemsAvailability: "available" | "unavailable";
};

export const normalizePlaylist = (
  playlist: CurrentPlaylist
): CompatiblePlaylist => ({
  ...playlist,
  tracks: normalizePlaylistItems(playlist.items ?? playlist.tracks),
  itemsAvailability:
    playlist.items || playlist.tracks ? "available" : "unavailable",
});

export const normalizeSimplifiedPlaylist = (
  playlist: CurrentSimplifiedPlaylist
): SimplifiedPlaylist => ({
  ...playlist,
  tracks: playlist.items ?? playlist.tracks ?? { href: "", total: 0 },
});

const encodeId = (id: string) => encodeURIComponent(id);
const PLAYLIST_ITEMS_PAGE_LIMIT = 50;
const PLAYLIST_MUTATION_ITEM_LIMIT = 100;
const MAX_PROVIDER_PAGE_REQUESTS = 1_000;
const SINGLE_ITEM_FETCH_CONCURRENCY = 5;

async function fetchIndividually<T>(
  ids: string[],
  fetchItem: (id: string) => Promise<T>
): Promise<T[]> {
  return mapWithConcurrency(ids, SINGLE_ITEM_FETCH_CONCURRENCY, fetchItem);
}

const assertPlaylistMutationSize = (
  uris: string[],
  operation: "add" | "remove" | "replace"
) => {
  if (uris.length > PLAYLIST_MUTATION_ITEM_LIMIT) {
    throw new RangeError(
      `Spotify playlists can ${operation} at most ${PLAYLIST_MUTATION_ITEM_LIMIT} items per request`
    );
  }
  if (operation !== "replace" && uris.length === 0) {
    throw new RangeError(`Spotify playlists cannot ${operation} zero items`);
  }
};

const requestPlaylistItemsPage = (
  sdk: SpotifySdk,
  playlistId: string,
  limit: number,
  offset: number
) => {
  const params = new URLSearchParams({
    limit: String(Math.min(Math.max(limit, 1), PLAYLIST_ITEMS_PAGE_LIMIT)),
    offset: String(Math.max(offset, 0)),
  });
  return sdk.makeRequest<CurrentPlaylistItemsPage>(
    "GET",
    `playlists/${encodeId(playlistId)}/items?${params}`
  );
};

async function loadCompletePlaylistItems(
  sdk: SpotifySdk,
  playlistId: string,
  initialPage: CurrentPlaylistItemsPage | Page<PlaylistedTrack<Track>>
): Promise<Page<PlaylistedTrack<Track>>> {
  if (initialPage.offset !== 0) {
    throw new Error("Spotify playlist pagination did not start at offset zero");
  }
  if (initialPage.items.length > initialPage.total) {
    throw new Error("Spotify playlist pagination returned an invalid total");
  }

  const firstPage = normalizePlaylistItems(initialPage);
  const items = [...firstPage.items];
  let rawItemCount = initialPage.items.length;
  let nextOffset = initialPage.offset + rawItemCount;
  let continuationUrl = initialPage.next;
  let requestCount = 0;
  const seenContinuationUrls = new Set<string>();

  while (continuationUrl || nextOffset < initialPage.total) {
    if (requestCount >= MAX_PROVIDER_PAGE_REQUESTS) {
      throw new Error("Spotify playlist pagination exceeded the safety limit");
    }
    if (continuationUrl) {
      if (seenContinuationUrls.has(continuationUrl)) {
        throw new Error("Spotify playlist pagination repeated a page");
      }
      seenContinuationUrls.add(continuationUrl);
    }

    const page = await requestPlaylistItemsPage(
      sdk,
      playlistId,
      PLAYLIST_ITEMS_PAGE_LIMIT,
      nextOffset
    );
    requestCount += 1;

    if (page.offset !== nextOffset) {
      throw new Error(
        "Spotify playlist pagination returned an unexpected offset"
      );
    }
    if (page.total !== initialPage.total) {
      throw new Error("Spotify playlist pagination changed its total");
    }

    rawItemCount = page.items.length;
    if (rawItemCount === 0) {
      throw new Error("Spotify playlist pagination stalled before completion");
    }

    items.push(...normalizePlaylistItems(page).items);
    nextOffset += rawItemCount;
    if (nextOffset > initialPage.total) {
      throw new Error("Spotify playlist pagination exceeded its total");
    }
    continuationUrl = page.next;

    if (!continuationUrl && nextOffset >= page.total) {
      break;
    }
  }

  return {
    ...firstPage,
    items,
    limit: items.length,
    next: null,
    offset: 0,
    previous: null,
    total: initialPage.total,
  };
}

async function loadCompleteAlbumTracks(
  sdk: SpotifySdk,
  albumId: string,
  initialPage: Page<SimplifiedTrack>
): Promise<SimplifiedTrack[]> {
  return loadCompleteOffsetItems("album", initialPage, (offset) =>
    sdk.albums.tracks(
      albumId,
      "US",
      PLAYLIST_ITEMS_PAGE_LIMIT,
      offset
    )
  );
}

async function loadCompleteOffsetItems<Item>(
  resource: string,
  initialPage: Page<Item>,
  requestPage: (offset: number) => Promise<Page<Item>>
): Promise<Item[]> {
  if (initialPage.offset !== 0) {
    throw new Error(
      `Spotify ${resource} pagination did not start at offset zero`
    );
  }
  if (initialPage.items.length > initialPage.total) {
    throw new Error(`Spotify ${resource} pagination returned an invalid total`);
  }

  const items = [...initialPage.items];
  let nextOffset = initialPage.items.length;
  let continuationUrl = initialPage.next;
  let requestCount = 0;
  const seenContinuationUrls = new Set<string>();

  while (continuationUrl || nextOffset < initialPage.total) {
    if (requestCount >= MAX_PROVIDER_PAGE_REQUESTS) {
      throw new Error(
        `Spotify ${resource} pagination exceeded the safety limit`
      );
    }
    if (continuationUrl) {
      if (seenContinuationUrls.has(continuationUrl)) {
        throw new Error(`Spotify ${resource} pagination repeated a page`);
      }
      seenContinuationUrls.add(continuationUrl);
    }

    const page = await requestPage(nextOffset);
    requestCount += 1;

    if (page.offset !== nextOffset) {
      throw new Error(
        `Spotify ${resource} pagination returned an unexpected offset`
      );
    }
    if (page.total !== initialPage.total) {
      throw new Error(`Spotify ${resource} pagination changed its total`);
    }
    if (page.items.length === 0) {
      throw new Error(
        `Spotify ${resource} pagination stalled before completion`
      );
    }

    items.push(...page.items);
    nextOffset += page.items.length;
    if (nextOffset > initialPage.total) {
      throw new Error(`Spotify ${resource} pagination exceeded its total`);
    }
    continuationUrl = page.next;

    if (!continuationUrl && nextOffset >= page.total) break;
  }

  return items;
}

/**
 * Compatibility module for Spotify's February 2026 Development Mode API.
 * The published SDK still calls retired bulk and playlist `/tracks` routes,
 * so current endpoints stay concentrated behind this small interface.
 */
export const spotifyWebApi = {
  getArtists(sdk: SpotifySdk, artistIds: string[]): Promise<Artist[]> {
    return fetchIndividually(artistIds, (id) =>
      sdk.makeRequest<Artist>("GET", `artists/${encodeId(id)}`)
    );
  },

  getTracks(sdk: SpotifySdk, trackIds: string[]): Promise<Track[]> {
    return fetchIndividually(trackIds, (id) =>
      sdk.makeRequest<Track>("GET", `tracks/${encodeId(id)}`)
    );
  },

  async getAlbumTracks(
    sdk: SpotifySdk,
    albumId: string
  ): Promise<SimplifiedTrack[]> {
    const firstPage = await sdk.albums.tracks(
      albumId,
      "US",
      PLAYLIST_ITEMS_PAGE_LIMIT,
      0
    );
    return loadCompleteAlbumTracks(sdk, albumId, firstPage);
  },

  async getArtistCatalogTracks(
    sdk: SpotifySdk,
    artistId: string,
    albumLimit = 5,
    trackLimit = 10
  ): Promise<ArtistCatalogTrack[]> {
    const albums = await sdk.artists.albums(
      artistId,
      "album,single",
      "US",
      50,
      0
    );
    const boundedAlbumLimit = Math.min(
      Math.max(Math.trunc(albumLimit), 1),
      10
    );
    const boundedTrackLimit = Math.min(
      Math.max(Math.trunc(trackLimit), 1),
      50
    );
    const uniqueAlbumIds = new Set<string>();
    const availableAlbums = [...albums.items]
      .filter(({ id }) => {
        if (!id || uniqueAlbumIds.has(id)) return false;
        uniqueAlbumIds.add(id);
        return true;
      })
      .sort(
        (left, right) =>
          (right.release_date ?? "").localeCompare(left.release_date ?? "") ||
          left.id.localeCompare(right.id)
      );
    const catalogAlbums: SimplifiedAlbum[] = [];
    let estimatedTrackCount = 0;
    for (const album of availableAlbums.slice(0, boundedAlbumLimit)) {
      catalogAlbums.push(album);
      estimatedTrackCount += Math.max(album.total_tracks || 1, 1);
      if (estimatedTrackCount >= boundedTrackLimit) break;
    }

    const fullAlbums = await fetchIndividually(
      catalogAlbums.map(({ id }) => id),
      (albumId) => sdk.albums.get(albumId)
    );
    const tracks: ArtistCatalogTrack[] = [];
    const seenTrackIds = new Set<string>();

    for (const album of fullAlbums) {
      for (const track of album.tracks.items) {
        if (!track.id || seenTrackIds.has(track.id)) continue;
        seenTrackIds.add(track.id);
        tracks.push({
          id: track.id,
          name: track.name,
          artists: track.artists,
          spotifyUri: track.uri ?? null,
          externalUrl: track.external_urls?.spotify ?? null,
          album: {
            id: album.id,
            name: album.name,
            images: album.images,
            releaseDate: album.release_date ?? null,
            popularity: album.popularity ?? null,
          },
        });
        if (tracks.length >= boundedTrackLimit) return tracks;
      }
    }

    return tracks;
  },

  async getCurrentUserPlaylists(
    sdk: SpotifySdk
  ): Promise<Page<SimplifiedPlaylist>> {
    const requestPage = (offset: number) => {
      const params = new URLSearchParams({
        limit: String(PLAYLIST_ITEMS_PAGE_LIMIT),
        offset: String(offset),
      });
      return sdk.makeRequest<Page<CurrentSimplifiedPlaylist>>(
        "GET",
        `me/playlists?${params}`
      );
    };
    const firstPage = await requestPage(0);
    const items = await loadCompleteOffsetItems(
      "current-user playlist",
      firstPage,
      requestPage
    );
    return {
      ...firstPage,
      items: items.map(normalizeSimplifiedPlaylist),
      limit: items.length,
      next: null,
      offset: 0,
      previous: null,
    };
  },

  async getArtistAlbums(
    sdk: SpotifySdk,
    artistId: string
  ): Promise<SimplifiedAlbum[]> {
    const requestPage = (offset: number) =>
      sdk.artists.albums(
        artistId,
        undefined,
        "US",
        PLAYLIST_ITEMS_PAGE_LIMIT,
        offset
      );
    const firstPage = await requestPage(0);
    return loadCompleteOffsetItems(
      "artist album",
      firstPage,
      requestPage
    );
  },

  async getPlaylist(
    sdk: SpotifySdk,
    playlistId: string
  ): Promise<CompatiblePlaylist> {
    const playlist = await sdk.makeRequest<CurrentPlaylist>(
      "GET",
      `playlists/${encodeId(playlistId)}`
    );
    const initialItems = playlist.items ?? playlist.tracks;
    if (!initialItems) return normalizePlaylist(playlist);

    const needsPagination =
      Boolean(initialItems.next) ||
      initialItems.offset + initialItems.items.length < initialItems.total;
    const tracks = await loadCompletePlaylistItems(
      sdk,
      playlistId,
      initialItems
    );

    if (needsPagination) {
      if (!playlist.snapshot_id) {
        throw new Error("Spotify playlist response omitted its snapshot");
      }
      const confirmedPlaylist = await sdk.makeRequest<
        Pick<CurrentPlaylist, "snapshot_id">
      >(
        "GET",
        `playlists/${encodeId(playlistId)}?fields=snapshot_id`
      );
      if (confirmedPlaylist.snapshot_id !== playlist.snapshot_id) {
        throw new Error("Spotify playlist changed while it was being loaded");
      }
    }

    return {
      ...normalizePlaylist(playlist),
      tracks,
    };
  },

  async getPlaylistItems(
    sdk: SpotifySdk,
    playlistId: string,
    limit = 50,
    offset = 0
  ): Promise<Page<PlaylistedTrack<Track>>> {
    const page = await requestPlaylistItemsPage(
      sdk,
      playlistId,
      limit,
      offset
    );
    return normalizePlaylistItems(page);
  },

  async createPlaylist(
    sdk: SpotifySdk,
    request: {
      name: string;
      public?: boolean;
      collaborative?: boolean;
      description?: string;
    }
  ): Promise<Playlist<Track>> {
    const playlist = await sdk.makeRequest<CurrentPlaylist>(
      "POST",
      "me/playlists",
      request
    );
    return normalizePlaylist(playlist);
  },

  addPlaylistItems(
    sdk: SpotifySdk,
    playlistId: string,
    uris: string[],
    position?: number
  ): Promise<SnapshotReference> {
    assertPlaylistMutationSize(uris, "add");
    return sdk.makeRequest<SnapshotReference>(
      "POST",
      `playlists/${encodeId(playlistId)}/items`,
      { uris, position }
    );
  },

  removePlaylistItems(
    sdk: SpotifySdk,
    playlistId: string,
    uris: string[],
    snapshotId?: string
  ): Promise<SnapshotReference> {
    assertPlaylistMutationSize(uris, "remove");
    return sdk.makeRequest<SnapshotReference>(
      "DELETE",
      `playlists/${encodeId(playlistId)}/items`,
      {
        items: uris.map((uri) => ({ uri })),
        snapshot_id: snapshotId,
      }
    );
  },

  replacePlaylistItems(
    sdk: SpotifySdk,
    playlistId: string,
    uris: string[]
  ): Promise<SnapshotReference> {
    assertPlaylistMutationSize(uris, "replace");
    return sdk.makeRequest<SnapshotReference>(
      "PUT",
      `playlists/${encodeId(playlistId)}/items`,
      { uris }
    );
  },

  removePlaylistFromLibrary(
    sdk: SpotifySdk,
    playlistId: string
  ): Promise<void> {
    const params = new URLSearchParams({
      uris: `spotify:playlist:${playlistId}`,
    });
    return sdk.makeRequest<void>("DELETE", `me/library?${params}`);
  },
};
