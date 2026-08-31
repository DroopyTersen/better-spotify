import type { SnapshotReference } from "@spotify/web-api-ts-sdk";
import type { SpotifySdk } from "../createSpotifySdk";
import { spotifyWebApi } from "../api/spotifyWebApi";
import {
  generatePlaylistModification,
  type PlaylistModification,
} from "./generatePlaylistModification.server";
import {
  hasDuplicateTrackIds,
  resolvePlaylistTracks,
} from "./buildPlaylist.server";
import type { PlaylistModificationInput } from "./playlistBuilder.types";

export const PLAYLIST_MODIFICATION_CONFLICT_MESSAGE =
  "This playlist changed after it was loaded. Refresh it and try again.";
export const PLAYLIST_MODIFICATION_RESOLUTION_MESSAGE =
  "At least one requested track could not be found on Spotify.";

export class PlaylistModificationConflictError extends Error {
  constructor() {
    super(PLAYLIST_MODIFICATION_CONFLICT_MESSAGE);
    this.name = "PlaylistModificationConflictError";
  }
}

export class PlaylistModificationResolutionError extends Error {
  constructor(message = PLAYLIST_MODIFICATION_RESOLUTION_MESSAGE) {
    super(message);
    this.name = "PlaylistModificationResolutionError";
  }
}

export type PlaylistModificationSource = {
  snapshotId: string;
  tracks: PlaylistModificationInput["currentTracks"];
};

export type ModifyPlaylistDependencies = {
  loadSource: (
    sdk: SpotifySdk,
    playlistId: string
  ) => Promise<PlaylistModificationSource>;
  generateModification: typeof generatePlaylistModification;
  resolveTracks: typeof resolvePlaylistTracks;
  replaceItems: (
    sdk: SpotifySdk,
    playlistId: string,
    uris: string[]
  ) => Promise<SnapshotReference>;
};

const defaultDependencies: ModifyPlaylistDependencies = {
  loadSource: loadPlaylistModificationSource,
  generateModification: generatePlaylistModification,
  resolveTracks: resolvePlaylistTracks,
  replaceItems: spotifyWebApi.replacePlaylistItems,
};

export async function loadPlaylistModificationSource(
  sdk: SpotifySdk,
  playlistId: string
): Promise<PlaylistModificationSource> {
  const playlist = await spotifyWebApi.getPlaylist(sdk, playlistId);
  if (playlist.itemsAvailability === "unavailable") {
    throw new PlaylistModificationResolutionError(
      "Spotify does not make this playlist's tracks available to this app. Only playlists you own or collaborate on can be modified."
    );
  }
  if (!playlist.snapshot_id) {
    throw new PlaylistModificationResolutionError(
      "Spotify did not provide a playlist version, so this playlist cannot be safely modified."
    );
  }
  if (playlist.tracks.items.length !== playlist.tracks.total) {
    throw new PlaylistModificationResolutionError(
      "This playlist contains unavailable or unsupported items and cannot be safely modified."
    );
  }

  const tracks = playlist.tracks.items.map(({ track }) => {
    if (!track?.id || !Array.isArray(track.artists)) {
      throw new PlaylistModificationResolutionError(
        "This playlist contains unavailable or unsupported items and cannot be safely modified."
      );
    }
    return {
      id: track.id,
      name: track.name,
      artist_name: track.artists.map((artist) => artist.name).join(", "),
    };
  });

  return { snapshotId: playlist.snapshot_id, tracks };
}

export async function modifyPlaylist(
  input: PlaylistModificationInput,
  sdk: SpotifySdk,
  dependencies: ModifyPlaylistDependencies = defaultDependencies
): Promise<PlaylistModification & { snapshotId: string }> {
  const requestedSource: PlaylistModificationSource = {
    snapshotId: input.snapshotId,
    tracks: input.currentTracks,
  };
  const initialSource = await dependencies.loadSource(sdk, input.playlistId);
  assertPlaylistSourceUnchanged(requestedSource, initialSource);

  const modifications = await dependencies.generateModification({
    ...input,
    currentTracks: initialSource.tracks,
  });
  if (modifications.modifiedPlaylist.tracks.length > 100) {
    throw new PlaylistModificationResolutionError(
      "The modified playlist cannot contain more than 100 tracks."
    );
  }

  const verifiedTracks = new Map(
    initialSource.tracks.map((track) => [track.id, track])
  );
  const resolvedTracks = await dependencies.resolveTracks(
    modifications.modifiedPlaylist.tracks,
    verifiedTracks,
    sdk
  );
  if (!resolvedTracks || hasDuplicateTrackIds(resolvedTracks)) {
    throw new PlaylistModificationResolutionError();
  }
  const modifiedTracks = resolvedTracks.map((track) => {
    if (!track.artist_name) {
      throw new PlaylistModificationResolutionError();
    }
    return {
      id: track.id,
      name: track.name,
      artist_name: track.artist_name,
    };
  });

  // Recheck after all slow AI/search work and immediately before the write.
  // Spotify documents snapshot_id as a precondition for reorder, but replace
  // accepts only uris; therefore a small GET-to-PUT race remains unavoidable.
  const latestSource = await dependencies.loadSource(sdk, input.playlistId);
  assertPlaylistSourceUnchanged(initialSource, latestSource);

  const result = await dependencies.replaceItems(
    sdk,
    input.playlistId,
    modifiedTracks.map((track) => `spotify:track:${track.id}`)
  );

  return {
    ...modifications,
    modifiedPlaylist: {
      ...modifications.modifiedPlaylist,
      tracks: modifiedTracks,
    },
    snapshotId: result.snapshot_id,
  };
}

export function assertPlaylistSourceUnchanged(
  expected: PlaylistModificationSource,
  actual: PlaylistModificationSource
): void {
  if (
    expected.snapshotId !== actual.snapshotId ||
    expected.tracks.length !== actual.tracks.length ||
    expected.tracks.some((track, index) => track.id !== actual.tracks[index]?.id)
  ) {
    throw new PlaylistModificationConflictError();
  }
}
