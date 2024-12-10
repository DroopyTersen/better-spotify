import {
  SpotifyLikedTrack,
  SpotifyPlayedTrack,
  SpotifyTopTrack,
  SpotifyRecentArtist,
  SpotifyTopArtist,
} from "../spotify.db";

import { useRouteData } from "~/toolkit/remix/useRouteData";

export const useSpotifyData = () => {
  let topArtists = useRouteData(
    (r) => r?.data?.topArtists
  ) as SpotifyTopArtist[];
  let topTracks = useRouteData((r) => r?.data?.topTracks) as SpotifyTopTrack[];
  let playHistory = useRouteData(
    (r) => r?.data?.playHistory
  ) as SpotifyPlayedTrack[];
  let likedTracks = useRouteData(
    (r) => r?.data?.likedTracks
  ) as SpotifyLikedTrack[];
  let recentArtists = useRouteData(
    (r) => r?.data?.recentArtists
  ) as SpotifyRecentArtist[];

  return {
    topArtists,
    topTracks,
    playHistory,
    likedTracks,
    recentArtists,
  };
};
