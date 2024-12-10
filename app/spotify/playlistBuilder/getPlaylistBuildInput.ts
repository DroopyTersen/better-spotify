import { BuildPlaylistInput } from "./playlistBuilder.types";
import { useSpotifyData } from "./useSpotifyData";

export const getBuildPlaylistInput = async (
  spotifyData: ReturnType<typeof useSpotifyData>,
  {
    selectedArtistIds,
    selectedTrackIds,
  }: {
    selectedArtistIds: string[];
    selectedTrackIds: string[];
  }
) => {
  let input: BuildPlaylistInput = {
    topTracks: spotifyData.topTracks.map((t) => ({
      id: t.track_id!,
      name: t.track_name!,
      artist_id: t.artist_id!,
      artist_name: t.artist_name!,
      popularity: t.track_popularity,
    })),
    topArtists: spotifyData.topArtists.map((a) => ({
      id: a.artist_id!,
      name: a.artist_name!,
    })),
    playHistory: spotifyData.playHistory.map((t) => ({
      id: t.track_id!,
      name: t.track_name!,
      artist_id: t.artist_id!,
      artist_name: t.artist_name!,
      popularity: t.track_popularity,
    })),
    likedTracks: spotifyData.likedTracks.map((t) => ({
      id: t.track_id!,
      name: t.track_name!,
      artist_id: t.artist_id!,
      artist_name: t.artist_name!,
      popularity: t.track_popularity,
    })),
    request: {
      artistIds: selectedArtistIds,
      trackIds: selectedTrackIds,
      numSongs: 32,
    },
  };
  return input;
};
