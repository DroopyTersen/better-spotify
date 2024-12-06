import dayjs from "dayjs";
import { SpotifySdk } from "../createSpotifySdk";
import { generateArtistRecommendations } from "./generateArtistRecommendations.server";
import { generatePlaylist } from "./generatePlaylist.server";
import {
  BuildPlaylistInput,
  BuildPlaylistTrack,
  DEFAULT_PLAYLIST_BUILDER_REQUEST,
  FamiliarSongsPool,
  PlaylistBuilderRequest,
  SongDistribution,
} from "./playlistBuilder.types";
import { getPlaylist } from "../api/getPlaylist";

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

  let artistsToMatch = Array.from(
    new Set([
      ...familiarPool.specifiedTracks.map((t) => t.artist_name || ""),
      ...familiarPool.topTracks.map((t) => t.artist_name || ""),
      ...familiarPool.likedTracks.map((t) => t.artist_name || ""),
    ])
  ).filter(Boolean);
  let artistsToExclude = Array.from(
    new Set([
      ...input.likedTracks.map((t) => t.artist_name || ""),
      ...input.topTracks.map((t) => t.artist_name || ""),
      ...input.topArtists.map((t) => t.name || ""),
      ...input.playHistory.map((t) => t.artist_name || ""),
    ])
  ).filter(Boolean);
  let recommendedNewArtists: string[] = await generateArtistRecommendations({
    artistsToMatch,
    artistsToExclude,
    desiredArtistCount: Math.max(4, Math.floor(distribution.numNewSongs / 2)),
  });
  let newSongs: BuildPlaylistTrack[] = [];

  // Search for each recommended artist and get their top tracks concurrently
  await Promise.all(
    recommendedNewArtists.map(async (artistName) => {
      let artistResults = await sdk.search(artistName, ["artist"], "US", 1);
      if (!artistResults.artists.items[0]) return;

      let topTracks = await sdk.artists.topTracks(
        artistResults.artists.items[0].id,
        "US"
      );

      // Map tracks to BuildPlaylistTrack format and add to newSongs
      let artistTracks = topTracks.tracks.map((t) => ({
        id: t.id,
        name: t.name,
        artist_name: t.artists[0]?.name ?? null,
        artist_id: t.artists[0]?.id ?? null,
        popularity: t.popularity,
      }));

      newSongs.push(...artistTracks);
    })
  );

  let generatedPlaylist = await generatePlaylist({
    request: requestWithDefaults,
    familiarOptions: familiarPool,
    distribution,
    topArtists: input.topArtists.map((a) => a.name),
    newOptions: newSongs,
  });
  // Add a specified track to the front and shuffle the rest
  // if (generatedPlaylist?.playlist?.tracks) {
  //   shuffleTracks(
  //     generatedPlaylist.playlist.tracks as BuildPlaylistTrack[],
  //     familiarPool.specifiedTracks
  //   );
  // }
  let currentUser = await sdk.currentUser.profile();
  const playlist = await sdk.playlists.createPlaylist(currentUser.id, {
    name: dayjs().format("YYYY-MM-DD") + " " + generatedPlaylist.playlist.name,
  });

  await sdk.playlists.addItemsToPlaylist(
    playlist.id,
    generatedPlaylist.playlist.tracks.map((t) => `spotify:track:${t.id}`)
  );
  let finalPlaylist = await getPlaylist(sdk, playlist.id);
  // TODO: save playlist to DB? or just start only using API for playlists?

  return {
    request: requestWithDefaults,
    familiarSongOptions: familiarPool,
    newSongOptions: newSongs,
    distribution,
    playlist: finalPlaylist,
  };
}
export type BuildPlaylistOutput = Awaited<ReturnType<typeof buildPlaylist>>;
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
  let { artistIds, trackIds } = input.request;

  // 1. Get specified tracks with correct field selection
  const tracks = await sdk.tracks.get(trackIds.slice(0, 20));
  const specifiedTracks = tracks.map((track) => ({
    id: track.id,
    name: track.name,
    popularity: track.popularity,
    artist_name: track.artists[0]?.name ?? null,
    artist_id: track.artists[0]?.id ?? null,
  }));
  if (artistIds.length / input.request.numSongs < 10) {
    artistIds = Array.from(
      new Set([
        ...input.request.artistIds,
        ...specifiedTracks.map((t) => t.artist_id),
      ])
    ).filter(Boolean) as string[];
    console.log("🚀 | specifiedTracks | specifiedTracks:", specifiedTracks);
  }
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

function shuffleTracks(
  tracks: Omit<BuildPlaylistTrack, "artist_id">[],
  specifiedTracks: BuildPlaylistTrack[]
) {
  if (!tracks) return;

  // Get a random specified track if available
  if (specifiedTracks.length > 0) {
    const randomSpecifiedTrack =
      specifiedTracks[Math.floor(Math.random() * specifiedTracks.length)];

    // Remove it from the tracks array if it exists
    const specifiedTrackIndex = tracks.findIndex(
      (t) => t.id === randomSpecifiedTrack.id
    );
    if (specifiedTrackIndex > -1) {
      tracks.splice(specifiedTrackIndex, 1);
    }

    // Add it to the front
    tracks.unshift({
      id: randomSpecifiedTrack.id,
      name: randomSpecifiedTrack.name,
      artist_name: randomSpecifiedTrack.artist_name || "",
    });
  }

  // Shuffle the remaining tracks using Fisher-Yates
  for (let i = tracks.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
  }
}
