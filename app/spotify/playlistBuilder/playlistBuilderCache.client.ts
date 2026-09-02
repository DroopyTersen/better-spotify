import type { CacheManager } from "~/toolkit/utils/cache.client";
import type {
  BuildPlaylistFormData,
  BuildPlaylistTrack,
  FamiliarSongsPool,
  PlaylistBuilderData,
  SelectedPlaylistArtist,
  SelectedPlaylistTrack,
} from "./playlistBuilder.types";

const SPOTIFY_ID = /^[A-Za-z0-9]+$/;
const SELECTION_HASH = /^[a-f0-9]{40}$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PersistedPlaylistBuild = {
  jobId: string;
  selectionHash: string;
  startedAt: string;
};

type PlaylistBuilderCacheReader = Pick<CacheManager, "removeItem"> & {
  getItem(key: string): Promise<unknown>;
};

export async function readPlaylistBuilderCacheState(
  cache: PlaylistBuilderCacheReader,
  cacheKey: string
): Promise<PlaylistBuilderData | null> {
  const cachedValue = await cache.getItem(cacheKey);
  if (cachedValue === null) return null;
  if (isPlaylistBuilderData(cachedValue)) return cachedValue;

  await cache.removeItem(cacheKey);
  return null;
}

export async function readPersistedPlaylistBuild(
  cache: PlaylistBuilderCacheReader,
  cacheKey: string
): Promise<PersistedPlaylistBuild | null> {
  const cachedValue = await cache.getItem(cacheKey);
  if (cachedValue === null) return null;
  if (isPersistedPlaylistBuild(cachedValue)) return cachedValue;

  await cache.removeItem(cacheKey);
  return null;
}

export function isPersistedPlaylistBuild(
  value: unknown
): value is PersistedPlaylistBuild {
  return (
    isRecord(value) &&
    typeof value.jobId === "string" &&
    UUID.test(value.jobId) &&
    typeof value.selectionHash === "string" &&
    SELECTION_HASH.test(value.selectionHash) &&
    typeof value.startedAt === "string" &&
    Number.isFinite(Date.parse(value.startedAt))
  );
}

export function isPlaylistBuilderData(
  value: unknown
): value is PlaylistBuilderData {
  if (!isRecord(value)) return false;
  if (
    typeof value.hashedSelection !== "string" ||
    !SELECTION_HASH.test(value.hashedSelection) ||
    !isArrayOf(value.selectedTracks, 200, isSelectedTrack) ||
    !isArrayOf(value.selectedArtists, 25, isSelectedArtist) ||
    !(
      value.familiarSongsPool === null ||
      isFamiliarSongsPool(value.familiarSongsPool)
    )
  ) {
    return false;
  }
  return value.formData === undefined || isFormData(value.formData);
}

function isSelectedArtist(value: unknown): value is SelectedPlaylistArtist {
  return (
    isRecord(value) &&
    isSpotifyId(value.artist_id) &&
    isOptionalText(value.artist_name) &&
    isOptionalImages(value.images)
  );
}

function isSelectedTrack(value: unknown): value is SelectedPlaylistTrack {
  return (
    isRecord(value) &&
    isSpotifyId(value.track_id) &&
    isOptionalText(value.track_name) &&
    isOptionalNullableSpotifyId(value.artist_id) &&
    isOptionalNullableText(value.artist_name) &&
    isOptionalImages(value.images)
  );
}

function isFamiliarSongsPool(value: unknown): value is FamiliarSongsPool {
  if (
    !isRecord(value) ||
    !isArrayOf(value.specifiedTracks, 200, isPoolTrack) ||
    !isArrayOf(value.topTracks, 250, isPoolTrack) ||
    !isArrayOf(value.likedTracks, 250, isPoolTrack) ||
    !isArrayOf(value.recentlyPlayedTracks, 250, isPoolTrack) ||
    !isArrayOf(value.artistCatalogs, 25, isArtistCatalog)
  ) {
    return false;
  }

  const trackCount =
    value.specifiedTracks.length +
    value.topTracks.length +
    value.likedTracks.length +
    value.recentlyPlayedTracks.length +
    value.artistCatalogs.reduce(
      (total, catalog) => total + catalog.tracks.length,
      0
    );
  return trackCount <= 1_500;
}

function isArtistCatalog(
  value: unknown
): value is FamiliarSongsPool["artistCatalogs"][number] {
  return (
    isRecord(value) &&
    isSpotifyId(value.artist_id) &&
    isText(value.artist_name) &&
    isArrayOf(value.tracks, 100, isPoolTrack)
  );
}

function isPoolTrack(value: unknown): value is BuildPlaylistTrack {
  return (
    isRecord(value) &&
    isSpotifyId(value.id) &&
    isNonemptyText(value.name) &&
    isOptionalPopularity(value.popularity) &&
    isOptionalNullableText(value.artist_name) &&
    isOptionalNullableSpotifyId(value.artist_id) &&
    isOptionalNullableText(value.release_date) &&
    isOptionalNullableText(value.spotify_uri) &&
    isOptionalNullableText(value.external_url)
  );
}

function isFormData(value: unknown): value is BuildPlaylistFormData {
  if (!isRecord(value)) return false;
  const newStuffAmount = value.newStuffAmount;
  return (
    (newStuffAmount === "none" ||
      newStuffAmount === "sprinkle" ||
      newStuffAmount === "half" ||
      newStuffAmount === "all") &&
    Number.isInteger(value.songCount) &&
    typeof value.songCount === "number" &&
    value.songCount >= 1 &&
    value.songCount <= 100 &&
    (value.customInstructions === undefined ||
      (typeof value.customInstructions === "string" &&
        value.customInstructions.length <= 4_000))
  );
}

function isOptionalPopularity(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === "number" &&
      Number.isInteger(value) &&
      value >= 0 &&
      value <= 100)
  );
}

function isOptionalImages(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    isArrayOf(value, 20, isSpotifyImage)
  );
}

function isSpotifyImage(
  value: unknown
): value is { url: string; height: number | null; width: number | null } {
  return (
    isRecord(value) &&
    typeof value.url === "string" &&
    value.url.length <= 2_048 &&
    isNullableDimension(value.height) &&
    isNullableDimension(value.width)
  );
}

function isNullableDimension(value: unknown): boolean {
  return value === null || (Number.isInteger(value) && Number(value) >= 0);
}

function isSpotifyId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 128 &&
    SPOTIFY_ID.test(value)
  );
}

function isOptionalNullableSpotifyId(value: unknown): boolean {
  return value === undefined || value === null || isSpotifyId(value);
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.length <= 500;
}

function isNonemptyText(value: unknown): value is string {
  return isText(value) && value.trim().length > 0;
}

function isOptionalText(value: unknown): boolean {
  return value === undefined || isText(value);
}

function isOptionalNullableText(value: unknown): boolean {
  return value === undefined || value === null || isText(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isArrayOf<Value>(
  value: unknown,
  maximumLength: number,
  guard: (item: unknown) => item is Value
): value is Value[] {
  return (
    Array.isArray(value) &&
    value.length <= maximumLength &&
    value.every(guard)
  );
}
