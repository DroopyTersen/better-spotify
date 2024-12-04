import type { Market } from "@spotify/web-api-ts-sdk";
import { eq, inArray } from "drizzle-orm";
import { artistsTable, artistTracks, tracksTable } from "~/db/db.schema";
import { createSpotifySdk, SpotifySdk } from "../createSpotifySdk";
import { spotifyDb } from "../spotify.db";
import {
  DEFAULT_PLAYLIST_BUILDER_REQUEST,
  FamiliarSongsPool,
  LLMCurationResponse,
  NewSongsPool,
  PlaylistBuilderRequest,
  BuildPlaylistTrack,
  SongDistribution,
  BuildPlaylistInput,
} from "./playlistBuilder.types";
import { generatePlaylist } from "./generatePlaylist.server";

export async function buildPlaylist(
  input: BuildPlaylistInput,
  sdk: SpotifySdk
) {
  const requestWithDefaults = {
    ...DEFAULT_PLAYLIST_BUILDER_REQUEST,
    ...input.request,
  };
  console.log("🚀 | requestWithDefaults:", requestWithDefaults);
  // 1. Calculate distribution of songs
  const distribution = calculateSongDistribution(requestWithDefaults);
  console.log("🚀 | distribution:", distribution);

  // 2. Build pools of songs to choose from
  const familiarPool = await buildFamiliarSongsPool(
    {
      ...input,
      request: requestWithDefaults,
    },
    sdk
  );
  console.log("🚀 | familiarPool:", familiarPool);
  // const newPool = await buildNewSongsPool(sdk, request, familiarPool);

  let generatedPlaylist = await generatePlaylist({
    request: requestWithDefaults,
    familiarOptions: familiarPool,
    distribution,
    newOptions: [],
  });

  return {
    request: requestWithDefaults,
    familiarSongOptions: familiarPool,
    // newSongOptions: newPool,
    distribution,
    playlist: generatedPlaylist,
  };
}
/**
 * Calculate how many familiar vs new songs should be in the playlist
 * based on the newArtistsRatio in the request
 */
function calculateSongDistribution(
  request: PlaylistBuilderRequest
): SongDistribution {
  const { numSongs, newArtistsRatio = 0.4 } = request;

  // Calculate number of new songs, rounding to nearest integer
  const numNewSongs = Math.round(numSongs * newArtistsRatio);

  // Familiar songs make up the remainder
  const numFamiliarSongs = numSongs - numNewSongs;

  return {
    numFamiliarSongs,
    numNewSongs,
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
async function buildFamiliarSongsPool(
  input: BuildPlaylistInput,
  sdk: SpotifySdk
): Promise<FamiliarSongsPool> {
  const { artistIds, trackIds } = input.request;

  // 1. Get specified tracks with correct field selection
  const tracks = await sdk.tracks.get(trackIds.slice(0, 20));
  const specifiedTracks = tracks.map((track) => ({
    id: track.id,
    name: track.name,
    popularity: track.popularity,
    artist_name: track.artists[0]?.name ?? null,
    artist_id: track.artists[0]?.id ?? null,
  }));

  console.log("🚀 | specifiedTracks | specifiedTracks:", specifiedTracks);
  // Initialize our pool structure

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

  // 2. Process each artist concurrently
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

  // Add results to pool
  artistResults.forEach(({ artistId, tracks }) => {
    pool.artistCatalogs[artistId] = tracks;
  });

  return pool;
}

/**
 * Helper function to get tracks from an artist's albums
 * Gets up to 20 albums and all their tracks
 */
async function getAllArtistTracks(
  sdk: SpotifySdk,
  artistId: string
): Promise<BuildPlaylistTrack[]> {
  const tracks: BuildPlaylistTrack[] = [];
  const limit = 20; // Number of albums to fetch

  // Get first batch of albums
  const response = await sdk.artists.albums(artistId, "album", "US", limit, 0);

  // Get tracks from all albums in parallel
  const albumTrackPromises = response.items.map((album) =>
    sdk.albums.tracks(album.id)
  );

  const albumTracksResults = await Promise.all(albumTrackPromises);

  // Process all album tracks
  albumTracksResults.forEach((albumTracks) => {
    tracks.push(
      ...albumTracks.items.map(
        (track): BuildPlaylistTrack => ({
          id: track.id,
          name: track.name,
          popularity: null,
          artist_id: artistId,
          artist_name: track.artists[0]?.name ?? null,
        })
      )
    );
  });

  return tracks;
}

// /**
//  * Build pool of new songs based on recommendations and similar artists
//  */
// async function buildNewSongsPool(
//   sdk: SpotifySdk,
//   request: PlaylistBuilderRequest,
//   familiarPool: FamiliarSongsPool
// ): Promise<NewSongsPool> {
//   const { artistIds, trackIds } = request;
//   const db = getDb();
//   const pool: NewSongsPool = [];

//   // Get user's top artists to exclude from recommendations
//   let topArtistIds = (
//     await spotifyDb
//       .getTopArtists(db, { limit: 200 })
//       .then((artists) => artists.map((a) => a.artist_id))
//   ).filter(Boolean) as string[];

//   // 1. Get similar artists for each specified artist
//   for (const artistId of artistIds) {
//     try {
//       const relatedArtists = await sdk.artists.relatedArtists(artistId);

//       // Filter out artists that are in user's top artists
//       const newArtists = relatedArtists.artists.filter(
//         (artist) => !topArtistIds.includes(artist.id)
//       );

//       // Get top tracks for each new artist
//       for (const artist of newArtists.slice(0, 3)) {
//         try {
//           const topTracks = await sdk.artists.topTracks(artist.id, "US");
//           pool.push(
//             ...topTracks.tracks.map(
//               (track): BuildPlaylistTrack => ({
//                 id: track.id,
//                 name: track.name,
//                 popularity: track.popularity,
//                 artist_id: artist.id,
//                 artist_name: artist.name,
//               })
//             )
//           );
//         } catch (error) {
//           console.warn(
//             `Failed to fetch top tracks for artist ${artist.id}:`,
//             error
//           );
//           continue;
//         }
//       }
//     } catch (error) {
//       console.warn(`Failed to fetch related artists for ${artistId}:`, error);
//       continue;
//     }
//   }

//   // 2. Get recommendations based on seed tracks
//   for (const trackId of trackIds) {
//     const recommendations = await sdk.recommendations.get({
//       market: "US" as Market,
//       limit: 10,
//       seed_tracks: [trackId],
//       // Exclude specified artists from recommendations
//       min_popularity: 30, // Ensure somewhat popular tracks
//     });

//     pool.push(
//       ...recommendations.tracks
//         .filter(
//           (track) =>
//             // Exclude tracks from familiar artists
//             !artistIds.some((id) =>
//               track.artists.some((artist) => artist.id === id)
//             )
//         )
//         .map(
//           (track): BuildPlaylistTrack => ({
//             id: track.id,
//             name: track.name,
//             popularity: track.popularity,
//             artist_id: track.artists[0]?.id ?? null,
//             artist_name: track.artists[0]?.name ?? null,
//           })
//         )
//     );
//   }

//   // 3. Get recommendations based on seed artists
//   for (const artistId of artistIds) {
//     const recommendations = await sdk.recommendations.get({
//       market: "US" as Market,
//       limit: 10,
//       seed_artists: [artistId],
//       min_popularity: 30,
//     });

//     pool.push(
//       ...recommendations.tracks
//         .filter(
//           (track) =>
//             // Exclude tracks from familiar artists
//             !artistIds.some((id) =>
//               track.artists.some((artist) => artist.id === id)
//             )
//         )
//         .map(
//           (track): BuildPlaylistTrack => ({
//             id: track.id,
//             name: track.name,
//             popularity: track.popularity,
//             artist_id: track.artists[0]?.id ?? null,
//             artist_name: track.artists[0]?.name ?? null,
//           })
//         )
//     );
//   }

//   // Remove duplicates based on track ID
//   const uniquePool = Array.from(
//     new Map(pool.map((track) => [track.id, track])).values()
//   );

//   // Filter out any tracks that exist in familiar pools
//   const filteredPool = uniquePool.filter((track) => {
//     const isInFamiliar =
//       familiarPool.specifiedTracks.some((t) => t.id === track.id) ||
//       familiarPool.topTracks.some((t) => t.id === track.id) ||
//       familiarPool.likedTracks.some((t) => t.id === track.id) ||
//       Object.values(familiarPool.artistCatalogs).some((catalog) =>
//         catalog.some((t) => t.id === track.id)
//       );

//     return !isInFamiliar;
//   });

//   return filteredPool;
// }

/**
 * Use LLM to curate the final playlist from the song pools
 */
async function curatePlaylist(
  familiarPool: FamiliarSongsPool,
  newPool: NewSongsPool,
  request: PlaylistBuilderRequest
): Promise<LLMCurationResponse> {
  // Implementation coming soon...
  throw new Error("Not implemented");
}

/**
 * Create the final playlist in Spotify
 */
async function createFinalPlaylist(
  sdk: SpotifySdk,
  curation: LLMCurationResponse
): Promise<{ playlistId: string; playlistName: string }> {
  // Implementation coming soon...
  throw new Error("Not implemented");
}
