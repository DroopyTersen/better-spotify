import type { UIMessage } from "ai";

export type PlaylistBuildPhase =
  | "preparing"
  | "recommending"
  | "starting"
  | "finding-tracks"
  | "curating"
  | "verifying"
  | "creating"
  | "reconnecting"
  | "complete";

export type PlaylistBuildProgress = {
  phase: PlaylistBuildPhase;
  label: string;
  detail: string;
  percent: number;
};

export type PlaylistBuildProgressData = {
  jobId: string;
  progress: PlaylistBuildProgress;
};

export type PlaylistBuildCompletionData = {
  jobId: string;
  playlistId: string;
};

export type PlaylistBuildFailureData = {
  jobId: string;
  kind: "failed" | "residual";
  message: string;
};

export type PlaylistBuildUIMessage = UIMessage<
  unknown,
  {
    progress: PlaylistBuildProgressData;
    completion: PlaylistBuildCompletionData;
    failure: PlaylistBuildFailureData;
  }
>;

export const PREPARING_PLAYLIST_PROGRESS: PlaylistBuildProgress = {
  phase: "preparing",
  label: "Preparing your music",
  detail: "Gathering the tracks and artists you selected.",
  percent: 8,
};

export const RECOMMENDING_ARTISTS_PROGRESS: PlaylistBuildProgress = {
  phase: "recommending",
  label: "Finding promising matches",
  detail: "Looking for artists that fit your selection.",
  percent: 18,
};

export const STARTING_BUILD_PROGRESS: PlaylistBuildProgress = {
  phase: "starting",
  label: "Starting the build",
  detail: "Your playlist job is running safely on the server.",
  percent: 24,
};

export const FINDING_TRACKS_PROGRESS: PlaylistBuildProgress = {
  phase: "finding-tracks",
  label: "Exploring fresh tracks",
  detail: "Checking the recommended artists' catalogs.",
  percent: 32,
};

export const CURATING_PLAYLIST_PROGRESS: PlaylistBuildProgress = {
  phase: "curating",
  label: "Curating your playlist",
  detail: "Choosing and ordering songs for a cohesive listen.",
  percent: 48,
};

export const VERIFYING_TRACKS_PROGRESS: PlaylistBuildProgress = {
  phase: "verifying",
  label: "Checking every track",
  detail: "Matching each choice to a real Spotify track.",
  percent: 72,
};

export const CREATING_PLAYLIST_PROGRESS: PlaylistBuildProgress = {
  phase: "creating",
  label: "Creating it in Spotify",
  detail: "Writing the verified playlist to your library.",
  percent: 90,
};

export const PLAYLIST_COMPLETE_PROGRESS: PlaylistBuildProgress = {
  phase: "complete",
  label: "Playlist ready",
  detail: "Opening your finished playlist.",
  percent: 100,
};

export function getCurationProgress(
  completedSongs: number,
  requestedSongs: number
): PlaylistBuildProgress {
  const safeRequestedSongs = Math.max(1, requestedSongs);
  const safeCompletedSongs = Math.max(
    0,
    Math.min(completedSongs, safeRequestedSongs)
  );
  const percent = 48 + Math.round((safeCompletedSongs / safeRequestedSongs) * 20);

  return {
    ...CURATING_PLAYLIST_PROGRESS,
    detail:
      safeCompletedSongs > 0
        ? `Drafted ${safeCompletedSongs} of ${safeRequestedSongs} songs.`
        : CURATING_PLAYLIST_PROGRESS.detail,
    percent,
  };
}

export function getReconnectingProgress(
  lastProgress: PlaylistBuildProgress | null
): PlaylistBuildProgress {
  return {
    phase: "reconnecting",
    label: "Reconnecting to your build",
    detail: "The server is still working. Progress will resume when your connection returns.",
    percent: Math.min(lastProgress?.percent ?? STARTING_BUILD_PROGRESS.percent, 99),
  };
}
