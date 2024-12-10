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
import { buildFamiliarSongsPool } from "./buildFamiliarSongPool";

export async function buildPlaylist(
  input: BuildPlaylistInput,
  sdk: SpotifySdk
) {
  const totalStartTime = performance.now();

  const requestWithDefaults = {
    ...DEFAULT_PLAYLIST_BUILDER_REQUEST,
    ...input.request,
  };

  // 1. Calculate distribution of songs
  const distribution = calculateSongDistribution(requestWithDefaults);

  // 2. Build pools of songs to choose from
  const familiarPoolStartTime = performance.now();
  const familiarPool = await buildFamiliarSongsPool(
    {
      ...input,
      request: requestWithDefaults,
    },
    sdk
  );
  console.log(
    `⏱️ Building familiar songs pool took: ${
      performance.now() - familiarPoolStartTime
    }ms`
  );

  // 3. Process artists for recommendations
  const artistProcessingStartTime = performance.now();
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
  console.log(
    `⏱️ Artist list processing took: ${
      performance.now() - artistProcessingStartTime
    }ms`
  );

  // 4. Generate artist recommendations
  const recommendationsStartTime = performance.now();
  let recommendedNewArtists: string[] = await generateArtistRecommendations({
    artistsToMatch,
    artistsToExclude,
    desiredArtistCount: Math.max(4, Math.floor(distribution.numNewSongs / 2)),
  });
  console.log(
    `⏱️ Artist recommendations generation took: ${
      performance.now() - recommendationsStartTime
    }ms`
  );

  let newSongs: BuildPlaylistTrack[] = [];

  // 5. Fetch new songs from recommended artists
  const newSongsStartTime = performance.now();
  await Promise.all(
    recommendedNewArtists.map(async (artistName) => {
      // const artistSearchStartTime = performance.now();
      let artistResults = await sdk.search(artistName, ["artist"], "US", 1);
      if (!artistResults.artists.items[0]) return;
      // console.log(
      //   `⏱️ Artist search for ${artistName} took: ${
      //     performance.now() - artistSearchStartTime
      //   }ms`
      // );

      // const topTracksStartTime = performance.now();
      let topTracks = await sdk.artists.topTracks(
        artistResults.artists.items[0].id,
        "US"
      );
      // console.log(
      //   `⏱️ Fetching top tracks for ${artistName} took: ${
      //     performance.now() - topTracksStartTime
      //   }ms`
      // );

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
  console.log(
    `⏱️ Total new songs fetching took: ${
      performance.now() - newSongsStartTime
    }ms`
  );

  // 6. Generate final playlist
  const playlistGenerationStartTime = performance.now();
  let generatedPlaylist = await generatePlaylist({
    request: requestWithDefaults,
    familiarOptions: familiarPool,
    distribution,
    topArtists: input.topArtists.map((a) => a.name),
    newOptions: newSongs,
  });
  console.log(
    `⏱️ Playlist generation took: ${
      performance.now() - playlistGenerationStartTime
    }ms`
  );

  // 7. Create and populate the playlist
  const playlistCreationStartTime = performance.now();
  let currentUser = await sdk.currentUser.profile();
  const playlist = await sdk.playlists.createPlaylist(currentUser.id, {
    name: dayjs().format("YYYY-MM-DD") + " " + generatedPlaylist.playlist.name,
  });

  const validTrackIds = new Set([
    ...familiarPool.specifiedTracks.map((t) => t.id),
    ...familiarPool.topTracks.map((t) => t.id),
    ...familiarPool.likedTracks.map((t) => t.id),
    ...Object.values(familiarPool.artistCatalogs).flatMap((catalog) =>
      catalog.map((t) => t.id)
    ),
    ...newSongs.map((t) => t.id),
  ]);

  const validPlaylistTracks = generatedPlaylist.playlist.tracks.filter(
    (track) => validTrackIds.has(track.id)
  );

  await sdk.playlists.addItemsToPlaylist(
    playlist.id,
    validPlaylistTracks.map((t) => `spotify:track:${t.id}`)
  );
  console.log(
    `⏱️ Playlist creation and population took: ${
      performance.now() - playlistCreationStartTime
    }ms`
  );

  // 8. Fetch final playlist
  const finalFetchStartTime = performance.now();
  let finalPlaylist = await getPlaylist(sdk, playlist.id);
  console.log(
    `⏱️ Final playlist fetch took: ${performance.now() - finalFetchStartTime}ms`
  );

  console.log(
    `⏱️ Total playlist building process took: ${
      performance.now() - totalStartTime
    }ms`
  );

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
