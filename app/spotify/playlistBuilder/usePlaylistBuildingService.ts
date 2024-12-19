import { PlaylistBuildingService } from "./PlaylistBuildingService.client";

import { useCurrentUser } from "~/auth/useCurrentUser";
import { useSpotifyData } from "./useSpotifyData";
import { createSpotifySdk } from "../createSpotifySdk";
import type { SpotifyData } from "../spotify.db";
import type { User } from "~/auth/auth.server";
import { useEffect, useState, useSyncExternalStore } from "react";

let _playlistBuildingService: PlaylistBuildingService | null = null;
let getPlaylistBuildingService = (
  currentUser: User,
  spotifyData: SpotifyData
) => {
  if (!_playlistBuildingService) {
    _playlistBuildingService = new PlaylistBuildingService(
      createSpotifySdk(currentUser?.tokens!),
      spotifyData
    );
  }
  return _playlistBuildingService;
};

export const usePlaylistBuildingService = () => {
  let currentUser = useCurrentUser();
  let spotifyData = useSpotifyData();
  let playlistBuildingService = getPlaylistBuildingService(
    currentUser!,
    spotifyData
  );
  let [state, setState] = useState(() => playlistBuildingService.getState());
  useEffect(() => {
    let unsubscribe = playlistBuildingService.subscribe(() => {
      setState(playlistBuildingService.getState());
    });
    return unsubscribe;
  }, [playlistBuildingService]);
  return {
    ...state,
    toggleArtistSelection: playlistBuildingService.toggleArtistSelection,
    toggleTrackSelection: playlistBuildingService.toggleTrackSelection,
    removeArtist: playlistBuildingService.toggleArtistSelection,
    removeTrack: playlistBuildingService.toggleTrackSelection,
    clearSelection: playlistBuildingService.clearSelections,
    warmup: playlistBuildingService.warmUpPlaylist,
    buildPlaylist: playlistBuildingService.buildPlaylist,
  };
};
