import { PlaylistBuildingService } from "./PlaylistBuildingService.client";

import { useCurrentUser } from "~/auth/useCurrentUser";
import { useSpotifyData } from "./useSpotifyData";
import { createSpotifySdk } from "../createSpotifySdk";
import type { SpotifyData } from "../spotify.db";
import type { User } from "~/auth/auth.server";
import { useEffect, useState } from "react";
import { getOptionalAccountDatabase } from "~/db/db.client";

type PlaylistBuildingServiceFactory = (
  currentUser: User,
  spotifyData: SpotifyData
) => PlaylistBuildingService;

type ActivePlaylistBuildingService = {
  accountId: string;
  sdkContextKey: string;
  service: PlaylistBuildingService;
};

let activePlaylistBuildingService: ActivePlaylistBuildingService | null = null;

const getSdkContextKey = (currentUser: User) =>
  [
    currentUser.tokens.accessToken,
    currentUser.tokens.clientId,
    currentUser.tokens.expiresAt,
    currentUser.tokens.tokenType,
  ].join("\u0000");

const createPlaylistBuildingService: PlaylistBuildingServiceFactory = (
  currentUser,
  spotifyData
) =>
  new PlaylistBuildingService(
    createSpotifySdk(currentUser.tokens),
    spotifyData,
    currentUser.id,
    getOptionalAccountDatabase(currentUser.id)
  );

export const getPlaylistBuildingService = (
  currentUser: User,
  spotifyData: SpotifyData,
  createService: PlaylistBuildingServiceFactory = createPlaylistBuildingService
) => {
  if (
    !activePlaylistBuildingService ||
    activePlaylistBuildingService.accountId !== currentUser.id
  ) {
    activePlaylistBuildingService?.service.dispose?.();
    const service = createService(currentUser, spotifyData);
    activePlaylistBuildingService = {
      accountId: currentUser.id,
      sdkContextKey: getSdkContextKey(currentUser),
      service,
    };
    return service;
  }

  const active = activePlaylistBuildingService;
  const sdkContextKey = getSdkContextKey(currentUser);
  if (active.sdkContextKey !== sdkContextKey) {
    active.service.updateSdk(createSpotifySdk(currentUser.tokens));
    active.sdkContextKey = sdkContextKey;
  }
  active.service.updateSpotifyData(spotifyData);
  active.service.updateDatabase?.(getOptionalAccountDatabase(currentUser.id));
  return active.service;
};

export const resetPlaylistBuildingService = () => {
  activePlaylistBuildingService?.service.dispose?.();
  activePlaylistBuildingService = null;
};

export const usePlaylistBuildingService = () => {
  const currentUser = useCurrentUser();
  const spotifyData = useSpotifyData();
  if (!currentUser) {
    resetPlaylistBuildingService();
    throw new Error("Playlist builder requires an authenticated Spotify user");
  }
  const playlistBuildingService = getPlaylistBuildingService(
    currentUser,
    spotifyData
  );
  const [subscribedState, setSubscribedState] = useState(() => ({
    service: playlistBuildingService,
    state: playlistBuildingService.getState(),
  }));
  const state =
    subscribedState.service === playlistBuildingService
      ? subscribedState.state
      : playlistBuildingService.getState();

  useEffect(() => {
    setSubscribedState({
      service: playlistBuildingService,
      state: playlistBuildingService.getState(),
    });
    const unsubscribe = playlistBuildingService.subscribe(() => {
      setSubscribedState({
        service: playlistBuildingService,
        state: playlistBuildingService.getState(),
      });
    });
    return unsubscribe;
  }, [playlistBuildingService]);
  return {
    ...state,
    toggleArtistSelection: playlistBuildingService.toggleArtistSelection,
    toggleTrackSelection: playlistBuildingService.toggleTrackSelection,
    addAlbumToSelection: playlistBuildingService.addAlbumToSelection,
    removeArtist: playlistBuildingService.toggleArtistSelection,
    removeTrack: playlistBuildingService.toggleTrackSelection,
    clearSelection: playlistBuildingService.clearSelections,
    buildPlaylist: playlistBuildingService.buildPlaylist,
    resumePlaylistBuild: playlistBuildingService.resumePlaylistBuild,
    updateFormData: playlistBuildingService.updateFormData,
  };
};
