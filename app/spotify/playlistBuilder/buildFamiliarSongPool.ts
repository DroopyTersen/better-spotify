import { AsyncReturnType } from "~/toolkit/utils/typescript.utils";
import { getArtistCatalogTracks } from "../api/getArtistCatalogTracks";
import { SpotifySdk } from "../createSpotifySdk";
import {
  type BuildPlaylistTrack,
  type FamiliarSongsPool,
} from "./playlistBuilder.types";
import { useSpotifyData } from "./useSpotifyData";
import { spotifyWebApi } from "../api/spotifyWebApi";
import { mapWithConcurrency } from "../api/mapWithConcurrency";

const MAX_SELECTED_ARTISTS = 25;
const MAX_SELECTED_TRACKS = 200;
const ARTIST_CATALOG_CONCURRENCY = 3;

type SpecifiedTrack = {
  id: string;
  name: string;
  popularity: number;
  artists: Array<{ id: string; name: string }>;
};

export type FamiliarSongPoolDependencies = {
  getTracks: (trackIds: string[]) => Promise<SpecifiedTrack[]>;
  getArtistTracks: (artistId: string) => Promise<BuildPlaylistTrack[]>;
};

export function createFamiliarSongPoolDependencies(
  sdk: SpotifySdk
): FamiliarSongPoolDependencies {
  return {
    getTracks: (trackIds) => spotifyWebApi.getTracks(sdk, trackIds),
    getArtistTracks: (artistId) => getArtistCatalogTracks(sdk, artistId),
  };
}

/**
 * Build pool of familiar songs from specified artists and tracks
 * This includes:
 * - Specified tracks directly
 * - Top tracks from specified artists
 * - Liked tracks from specified artists
 * - Full artist catalogs (filtered by popularity based on deepCutsRatio)
 */
export async function buildFamiliarSongsPool(
  input: GetFamiliarSongPoolInput,
  dependencies: FamiliarSongPoolDependencies
): Promise<FamiliarSongsPool> {
  let { artistIds, trackIds } = input.request;

  if (artistIds.length > MAX_SELECTED_ARTISTS) {
    throw new RangeError(
      `Select no more than ${MAX_SELECTED_ARTISTS} artists before building a playlist`
    );
  }
  if (trackIds.length > MAX_SELECTED_TRACKS) {
    throw new RangeError(
      `Select no more than ${MAX_SELECTED_TRACKS} tracks before building a playlist`
    );
  }

  // 1. Get specified tracks with correct field selection
  const tracks =
    trackIds.length > 0
      ? await dependencies.getTracks(trackIds)
      : [];
  const specifiedTracks = tracks.map((track) => ({
    id: track.id,
    name: track.name,
    popularity: track.popularity,
    artist_name: track.artists[0]?.name ?? null,
    artist_id: track.artists[0]?.id ?? null,
  }));

  artistIds = Array.from(
    new Set([
      ...input.request.artistIds,
      ...specifiedTracks.map((track) => track.artist_id),
    ])
  )
    .filter((artistId): artistId is string => Boolean(artistId))
    .slice(0, MAX_SELECTED_ARTISTS);

  // Initialize our pool structure
  const pool: FamiliarSongsPool = {
    specifiedTracks,
    recentlyPlayedTracks: input.playHistory.slice(0, 100),
    topTracks: input.topTracks.filter(
      (t) => t.artist_id && artistIds.includes(t.artist_id)
    ),
    artistCatalogs: [],
    likedTracks: input.likedTracks.filter(
      (t) => t.artist_id && artistIds.includes(t.artist_id)
    ),
  };

  // 2. Process artists with bounded provider fan-out while preserving selection order.
  const artistResults = await mapWithConcurrency(
    artistIds,
    ARTIST_CATALOG_CONCURRENCY,
    async (artistId) => {
      const artistTracks = await dependencies.getArtistTracks(artistId);

      // Filter out any tracks that are already in liked or top tracks to avoid duplicates
      const filteredArtistTracks = artistTracks.filter((track) => {
        const isInLikedTracks = pool.likedTracks.some(
          (t) => t.id === track.id
        );
        const isInTopTracks = pool.topTracks.some((t) => t.id === track.id);
        return !isInLikedTracks && !isInTopTracks;
      });

      return {
        artistId,
        tracks: filteredArtistTracks,
      };
    }
  );

  // Add results to pool (modified to use array structure)
  artistResults.forEach(({ artistId, tracks }) => {
    const artistName = tracks[0]?.artist_name ?? ""; // Get artist name from first track
    pool.artistCatalogs.push({
      artist_id: artistId,
      artist_name: artistName,
      tracks,
    });
  });

  return pool;
}

export const getBuildFamiliarSongPoolInput = async (
  spotifyData: ReturnType<typeof useSpotifyData>,
  {
    selectedArtistIds,
    selectedTrackIds,
  }: {
    selectedArtistIds: string[];
    selectedTrackIds: string[];
  }
) => {
  let input = {
    topTracks: spotifyData.topTracks.flatMap(toPoolTrack),
    playHistory: spotifyData.playHistory.flatMap(toPoolTrack),
    likedTracks: spotifyData.likedTracks.flatMap(toPoolTrack),
    request: {
      artistIds: selectedArtistIds,
      trackIds: selectedTrackIds,
    },
  };
  return input;
};

function toPoolTrack(track: {
  track_id: string | null;
  track_name: string | null;
  artist_id: string | null;
  artist_name: string | null;
  track_popularity: number | null;
}): BuildPlaylistTrack[] {
  if (!track.track_id || !track.track_name) return [];

  return [
    {
      id: track.track_id,
      name: track.track_name,
      artist_id: track.artist_id,
      artist_name: track.artist_name,
      popularity: track.track_popularity,
    },
  ];
}
export type GetFamiliarSongPoolInput = AsyncReturnType<
  typeof getBuildFamiliarSongPoolInput
>;
