type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnknownRecord | null =>
  value !== null && typeof value === "object"
    ? (value as UnknownRecord)
    : null;

const nonEmptyString = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value : null;

const nullableString = (value: unknown): string | null =>
  typeof value === "string" ? value : null;

const nullableNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const nullableBoolean = (value: unknown): boolean | null =>
  typeof value === "boolean" ? value : null;

const jsonRecord = (value: unknown): UnknownRecord | null => asRecord(value);

const normalizeImages = (value: unknown) => {
  if (!Array.isArray(value)) return null;
  return value.flatMap((image) => {
    const record = asRecord(image);
    const url = nonEmptyString(record?.url);
    if (!url) return [];
    return [
      {
        url,
        height: nullableNumber(record?.height),
        width: nullableNumber(record?.width),
      },
    ];
  });
};

export const uniqueNonEmptyIds = (ids: readonly string[], maxItems = 100) => {
  const uniqueIds = [
    ...new Set(ids.map((id) => id.trim()).filter((id) => id.length > 0)),
  ];
  if (uniqueIds.length > maxItems) {
    throw new RangeError(`At most ${maxItems} Spotify IDs can be synchronized`);
  }
  return uniqueIds;
};

export const normalizeArtist = (value: unknown) => {
  const artist = asRecord(value);
  const id = nonEmptyString(artist?.id);
  const name = nonEmptyString(artist?.name);
  if (!artist || !id || !name) return null;

  const followers = asRecord(artist.followers);
  const followerTotal = nullableNumber(followers?.total);
  const externalUrls = asRecord(artist.external_urls);
  const spotifyUrl = nonEmptyString(externalUrls?.spotify);

  return {
    id,
    name,
    external_urls: spotifyUrl ? { spotify: spotifyUrl } : null,
    followers:
      followers && followerTotal !== null
        ? { href: nullableString(followers.href), total: followerTotal }
        : null,
    href: nullableString(artist.href),
    uri: nullableString(artist.uri),
    popularity: nullableNumber(artist.popularity),
    images: normalizeImages(artist.images),
  };
};

export const artistGenres = (value: unknown): string[] => {
  const genres = asRecord(value)?.genres;
  return Array.isArray(genres)
    ? [...new Set(genres.flatMap((genre) => nonEmptyString(genre) ?? []))]
    : [];
};

export const normalizeAlbum = (value: unknown) => {
  const album = asRecord(value);
  const id = nonEmptyString(album?.id);
  const name = nonEmptyString(album?.name);
  if (!album || !id || !name) return null;

  const externalUrls = asRecord(album.external_urls);
  const spotifyUrl = nonEmptyString(externalUrls?.spotify);
  return {
    id,
    name,
    album_type: nullableString(album.album_type),
    total_tracks: nullableNumber(album.total_tracks),
    release_date: nullableString(album.release_date),
    release_date_precision: nullableString(album.release_date_precision),
    external_urls: spotifyUrl ? { spotify: spotifyUrl } : null,
    href: nullableString(album.href),
    uri: nullableString(album.uri),
    label: nullableString(album.label),
    popularity: nullableNumber(album.popularity),
    images: normalizeImages(album.images),
  };
};

export const normalizeTrack = (value: unknown) => {
  const track = asRecord(value);
  const id = nonEmptyString(track?.id);
  const name = nonEmptyString(track?.name);
  if (!track || !id || !name) return null;

  const album = normalizeAlbum(track.album);
  const externalUrls = asRecord(track.external_urls);
  const spotifyUrl = nonEmptyString(externalUrls?.spotify);
  return {
    id,
    name,
    album_id: album?.id ?? null,
    disc_number: nullableNumber(track.disc_number),
    duration_ms: nullableNumber(track.duration_ms),
    explicit: nullableBoolean(track.explicit),
    external_urls: spotifyUrl ? { spotify: spotifyUrl } : null,
    href: nullableString(track.href),
    uri: nullableString(track.uri),
    is_playable: nullableBoolean(track.is_playable),
    popularity: nullableNumber(track.popularity),
    preview_url: nullableString(track.preview_url),
    track_number: nullableNumber(track.track_number),
  };
};

export const normalizeTrackGraph = (values: readonly unknown[]) => {
  const albums = new Map<string, NonNullable<ReturnType<typeof normalizeAlbum>>>();
  const artists = new Map<string, NonNullable<ReturnType<typeof normalizeArtist>>>();
  const tracks = new Map<string, NonNullable<ReturnType<typeof normalizeTrack>>>();
  const artistTracks = new Map<
    string,
    { track_id: string; artist_id: string; position: number }
  >();
  const albumArtists = new Map<string, { album_id: string; artist_id: string }>();
  const tracksWithCompleteArtists = new Set<string>();
  const albumsWithCompleteArtists = new Set<string>();

  for (const value of values) {
    const rawTrack = asRecord(value);
    const track = normalizeTrack(value);
    if (!rawTrack || !track) continue;
    tracks.set(track.id, track);

    const rawAlbum = asRecord(rawTrack.album);
    const album = normalizeAlbum(rawAlbum);
    if (album) albums.set(album.id, album);

    const rawTrackArtists = Array.isArray(rawTrack.artists)
      ? rawTrack.artists
      : [];
    if (Array.isArray(rawTrack.artists)) {
      tracksWithCompleteArtists.add(track.id);
    }
    for (const [position, rawArtist] of rawTrackArtists.entries()) {
      const artist = normalizeArtist(rawArtist);
      if (!artist) continue;
      artists.set(artist.id, artist);
      artistTracks.set(`${track.id}:${artist.id}`, {
        track_id: track.id,
        artist_id: artist.id,
        position,
      });
    }

    const rawAlbumArtists = Array.isArray(rawAlbum?.artists)
      ? rawAlbum.artists
      : [];
    if (album) {
      if (Array.isArray(rawAlbum?.artists)) {
        albumsWithCompleteArtists.add(album.id);
      }
      for (const rawArtist of rawAlbumArtists) {
        const artist = normalizeArtist(rawArtist);
        if (!artist) continue;
        artists.set(artist.id, artist);
        albumArtists.set(`${album.id}:${artist.id}`, {
          album_id: album.id,
          artist_id: artist.id,
        });
      }
    }
  }

  return {
    albums: [...albums.values()],
    artists: [...artists.values()],
    tracks: [...tracks.values()],
    artistTracks: [...artistTracks.values()],
    albumArtists: [...albumArtists.values()],
    tracksWithCompleteArtists: [...tracksWithCompleteArtists],
    albumsWithCompleteArtists: [...albumsWithCompleteArtists],
  };
};

export const normalizeArtistGraph = (values: readonly unknown[]) => {
  const artists = new Map<string, NonNullable<ReturnType<typeof normalizeArtist>>>();
  const genres = new Map<string, { id: string; name: string }>();
  const artistGenreRows = new Map<
    string,
    { artist_id: string; genre_id: string }
  >();

  for (const value of values) {
    const artist = normalizeArtist(value);
    if (!artist) continue;
    artists.set(artist.id, artist);
    for (const genre of artistGenres(value)) {
      genres.set(genre, { id: genre, name: genre });
      artistGenreRows.set(`${artist.id}:${genre}`, {
        artist_id: artist.id,
        genre_id: genre,
      });
    }
  }

  return {
    artists: [...artists.values()],
    genres: [...genres.values()],
    artistGenres: [...artistGenreRows.values()],
  };
};

export const validDate = (value: unknown): Date | null => {
  if (typeof value !== "string" && !(value instanceof Date)) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const playHistoryId = (playedAt: Date, trackId: string) =>
  `${playedAt.toISOString()}:${trackId}`;

export const normalizeContext = (value: unknown) => {
  const context = asRecord(value);
  return {
    context_href: nullableString(context?.href),
    context_type: nullableString(context?.type),
    context_uri: nullableString(context?.uri),
  };
};

export const normalizePlayHistoryItem = (value: unknown) => {
  const item = asRecord(value);
  const track = normalizeTrack(item?.track);
  const playedAt = validDate(item?.played_at);
  if (!item || !track || !playedAt) return null;

  return {
    sourceTrack: item.track,
    row: {
      id: playHistoryId(playedAt, track.id),
      track_id: track.id,
      played_at: playedAt,
      ...normalizeContext(item.context),
    },
  };
};

export const normalizePlaylist = (value: unknown) => {
  const playlist = asRecord(value);
  const id = nonEmptyString(playlist?.id);
  const name = nonEmptyString(playlist?.name);
  if (!playlist || !id || !name) return null;
  const externalUrls = asRecord(playlist.external_urls);
  const spotifyUrl = nonEmptyString(externalUrls?.spotify);
  const rawOwner = jsonRecord(playlist.owner);
  const ownerId = nonEmptyString(rawOwner?.id);
  const ownerExternalUrls = asRecord(rawOwner?.external_urls);
  const ownerSpotifyUrl = nonEmptyString(ownerExternalUrls?.spotify);
  const owner =
    rawOwner && ownerId
      ? {
          id: ownerId,
          external_urls: ownerSpotifyUrl ? { spotify: ownerSpotifyUrl } : null,
          display_name: nullableString(rawOwner.display_name),
          href: nullableString(rawOwner.href),
          uri: nullableString(rawOwner.uri),
        }
      : null;

  return {
    id,
    name,
    description: nullableString(playlist.description),
    collaborative: nullableBoolean(playlist.collaborative) ?? false,
    public: nullableBoolean(playlist.public),
    snapshot_id: nullableString(playlist.snapshot_id),
    external_urls: spotifyUrl ? { spotify: spotifyUrl } : null,
    uri: nullableString(playlist.uri),
    images: normalizeImages(playlist.images),
    owner,
  };
};

export const normalizePlaylistOccurrences = (value: unknown) => {
  const playlist = asRecord(value);
  const playlistId = nonEmptyString(playlist?.id);
  const tracksPage = asRecord(playlist?.tracks);
  const items = Array.isArray(tracksPage?.items) ? tracksPage.items : [];
  if (!playlistId) return [];

  return items.flatMap((rawItem, position) => {
    const item = asRecord(rawItem);
    const track = normalizeTrack(item?.track);
    if (!track) return [];
    const rawAddedBy = asRecord(item?.added_by);
    const addedById = nonEmptyString(rawAddedBy?.id);
    const addedByExternalUrls = asRecord(rawAddedBy?.external_urls);
    const addedBySpotifyUrl = nonEmptyString(addedByExternalUrls?.spotify);
    const addedBy =
      rawAddedBy && addedById
        ? {
            id: addedById,
            external_urls: addedBySpotifyUrl
              ? { spotify: addedBySpotifyUrl }
              : null,
            href: nullableString(rawAddedBy.href),
            uri: nullableString(rawAddedBy.uri),
          }
        : null;
    return [
      {
        id: `${playlistId}:${position}`,
        playlist_id: playlistId,
        track_id: track.id,
        position,
        added_at: validDate(item?.added_at),
        added_by: addedBy,
      },
    ];
  });
};

export const playlistTracks = (value: unknown) => {
  const playlist = asRecord(value);
  const tracksPage = asRecord(playlist?.tracks);
  const items = Array.isArray(tracksPage?.items) ? tracksPage.items : [];
  return items.flatMap((item) => {
    const track = asRecord(item)?.track;
    return normalizeTrack(track) ? [track] : [];
  });
};
