import { getAllArtistTracks } from "../api/getAllArtistTracks";
import { SpotifySdk } from "../createSpotifySdk";
import { BuildPlaylistInput, FamiliarSongsPool } from "./playlistBuilder.types";

/**
 * Build pool of familiar songs from specified artists and tracks
 * This includes:
 * - Specified tracks directly
 * - Top tracks from specified artists
 * - Liked tracks from specified artists
 * - Full artist catalogs (filtered by popularity based on deepCutsRatio)
 */
export async function buildFamiliarSongsPool(
  input: BuildPlaylistInput,
  sdk: SpotifySdk
): Promise<FamiliarSongsPool> {
  const poolStartTime = performance.now();
  let { artistIds, trackIds } = input.request;

  // 1. Get specified tracks with correct field selection
  const tracksStartTime = performance.now();
  const tracks = await sdk.tracks.get(trackIds.slice(0, 20));
  const specifiedTracks = tracks.map((track) => ({
    id: track.id,
    name: track.name,
    popularity: track.popularity,
    artist_name: track.artists[0]?.name ?? null,
    artist_id: track.artists[0]?.id ?? null,
  }));
  console.log(
    `⏱️ Fetching specified tracks took: ${
      performance.now() - tracksStartTime
    }ms`
  );

  if (artistIds.length / input.request.numSongs < 10) {
    artistIds = Array.from(
      new Set([
        ...input.request.artistIds,
        ...specifiedTracks.map((t) => t.artist_id),
      ])
    ).filter(Boolean) as string[];
  }

  // Initialize our pool structure
  const filteringStartTime = performance.now();
  let allLikedTracks = input.likedTracks;
  let allTopTracks = input.topTracks;

  const pool: FamiliarSongsPool = {
    specifiedTracks,
    topTracks: allTopTracks.filter(
      (t) => t.artist_id && artistIds.includes(t.artist_id)
    ),
    artistCatalogs: {},
    likedTracks: allLikedTracks.filter(
      (t) => t.artist_id && artistIds.includes(t.artist_id)
    ),
  };
  console.log(
    `⏱️ Filtering liked and top tracks took: ${
      performance.now() - filteringStartTime
    }ms`
  );

  // 2. Process each artist concurrently
  const artistCatalogStartTime = performance.now();
  const artistPromises = artistIds.map(async (artistId) => {
    // Get full artist catalog
    const artistTracks = await getAllArtistTracks(sdk, artistId);

    // Filter out any tracks that are already in liked or top tracks to avoid duplicates
    const filteredArtistTracks = artistTracks.filter((track) => {
      const isInLikedTracks = pool.likedTracks.some((t) => t.id === track.id);
      const isInTopTracks = pool.topTracks.some((t) => t.id === track.id);
      return !isInLikedTracks && !isInTopTracks;
    });

    return {
      artistId,
      tracks: filteredArtistTracks,
    };
  });

  // Wait for all artist processing to complete
  const artistResults = await Promise.all(artistPromises);
  console.log(
    `⏱️ Processing all artist catalogs took: ${
      performance.now() - artistCatalogStartTime
    }ms`
  );

  // Add results to pool
  artistResults.forEach(({ artistId, tracks }) => {
    pool.artistCatalogs[artistId] = tracks?.map((t) => ({
      id: t.id,
      name: t.name,
    }));
  });

  console.log(
    `⏱️ Total familiar songs pool building took: ${
      performance.now() - poolStartTime
    }ms`
  );

  return pool;
}