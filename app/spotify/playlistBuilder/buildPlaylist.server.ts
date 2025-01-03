import dayjs from "dayjs";
import { SpotifySdk } from "../createSpotifySdk";
import { generateArtistRecommendations } from "./generateArtistRecommendations.server";
import { generatePlaylist } from "./generatePlaylist.server";

import { getPlaylist } from "../api/getPlaylist";
import { buildFamiliarSongsPool } from "./buildFamiliarSongPool";
import {
  BuildPlaylistInput,
  BuildPlaylistTrack,
} from "./playlistBuilder.types";

export async function buildPlaylist(
  input: BuildPlaylistInput,
  sdk: SpotifySdk
) {
  const totalStartTime = performance.now();

  let newSongs: BuildPlaylistTrack[] = [];

  // 5. Fetch new songs from recommended artists
  const newSongsStartTime = performance.now();
  await Promise.all(
    input.data.recommendedArtists.map(async (artist) => {
      // const topTracksStartTime = performance.now();
      let topTracks = await sdk.artists.topTracks(artist.artist_id, "US");
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
    ...input,
    newSongs,
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
    ...(input.data.familiarSongsPool?.specifiedTracks?.map((t) => t.id) || []),
    ...(input.data.familiarSongsPool?.topTracks?.map((t) => t.id) || []),
    ...(input.data.familiarSongsPool?.likedTracks?.map((t) => t.id) || []),
    ...(input.data.familiarSongsPool?.artistCatalogs || []).flatMap((catalog) =>
      catalog.tracks.map((t) => t.id)
    ),
    ...newSongs.map((t) => t.id),
  ]);

  const validPlaylistTracks = await Promise.all(
    generatedPlaylist.playlist.tracks.map((track) =>
      ensurePlaylistTrack(track, validTrackIds, sdk)
    )
  ).then((tracks) => tracks.filter((track) => track.id));

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
    newSongOptions: newSongs,
    playlist: finalPlaylist,
  };
}
export type BuildPlaylistOutput = Awaited<ReturnType<typeof buildPlaylist>>;

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

export async function ensurePlaylistTrack(
  track: BuildPlaylistTrack,
  validTrackIds: Set<string>,
  sdk: SpotifySdk
): Promise<BuildPlaylistTrack> {
  // If track has an ID and it's valid, return as-is
  if (track.id && validTrackIds.has(track.id)) {
    return track;
  }

  // Search for the track if no ID or invalid ID
  const searchQuery = `${track.name} ${track.artist_name}`;
  // console.log("🚀 | searchQuery:", searchQuery);
  const searchResult = await sdk.search(
    searchQuery.slice(0, 249),
    ["track"],
    "US",
    1
  );

  if (searchResult.tracks.items.length > 0) {
    const foundTrack = searchResult.tracks.items[0];
    return {
      id: foundTrack.id,
      name: foundTrack.name,
      artist_name: foundTrack.artists[0]?.name ?? track.artist_name,
      artist_id: foundTrack.artists[0]?.id ?? null,
      popularity: foundTrack.popularity,
    };
  }

  // If no match found, return original track (it won't be included in final playlist)
  return track;
}
