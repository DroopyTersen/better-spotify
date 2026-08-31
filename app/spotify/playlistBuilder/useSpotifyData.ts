import type {
  SpotifyLikedTrack,
  SpotifyPlayedTrack,
  SpotifyTopTrack,
  SpotifyRecentArtist,
  SpotifyTopArtist,
  SpotifyData,
} from "../spotify.db";

import { useRouteData } from "~/toolkit/remix/useRouteData";

export const useSpotifyData = () => {
  let topArtists = useRouteData(
    (r) => r?.loaderData?.topArtists
  ) as SpotifyTopArtist[];
  let topTracks = useRouteData(
    (r) => r?.loaderData?.topTracks
  ) as SpotifyTopTrack[];
  let playHistory = useRouteData(
    (r) => r?.loaderData?.playHistory
  ) as SpotifyPlayedTrack[];
  let likedTracks = useRouteData(
    (r) => r?.loaderData?.likedTracks
  ) as SpotifyLikedTrack[];
  let recentArtists = useRouteData(
    (r) => r?.loaderData?.recentArtists
  ) as SpotifyRecentArtist[];
  const basicLikedTracks = useRouteData(
    (route) => route?.loaderData?.basicLikedTracks
  ) as SpotifyData["basicLikedTracks"];

  return {
    topArtists,
    topTracks,
    playHistory,
    likedTracks,
    recentArtists,
    basicLikedTracks,
  } satisfies SpotifyData;
};
