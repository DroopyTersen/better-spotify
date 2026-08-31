import { isAbortError } from "./syncContext";

export const SPOTIFY_SYNC_STAGES = [
  "staging_database",
  "top_tracks",
  "top_tracks_pagination",
  "top_tracks_normalization",
  "top_tracks_write",
  "top_artists",
  "play_history",
  "saved_tracks",
  "artist_enrichment",
  "snapshot_read",
  "snapshot_publish",
  "provider_snapshot",
] as const;

export type SpotifySyncStage = (typeof SPOTIFY_SYNC_STAGES)[number];

export const SPOTIFY_SYNC_FAILURE_KINDS = [
  "unauthorized",
  "forbidden",
  "rate_limited",
  "provider_data",
  "provider_error",
  "network_error",
  "local_database",
  "unexpected",
] as const;

export type SpotifySyncFailureKind =
  (typeof SPOTIFY_SYNC_FAILURE_KINDS)[number];

export const SPOTIFY_SYNC_FAILURE_REASONS = [
  "pagination_unexpected_offset",
  "pagination_invalid_total",
  "pagination_total_changed",
  "pagination_safety_limit",
  "pagination_page_too_large",
  "pagination_reported_total_exceeded",
  "pagination_ended_early",
  "pagination_stalled",
  "top_track_unusable",
  "top_artist_unusable",
  "saved_track_invalid_or_duplicate",
  "play_history_item_unusable",
] as const;

export type SpotifySyncFailureReason =
  (typeof SPOTIFY_SYNC_FAILURE_REASONS)[number];

export type SpotifySyncFailure = Readonly<{
  stage: SpotifySyncStage;
  kind: SpotifySyncFailureKind;
  status: number | null;
  reason?: SpotifySyncFailureReason;
}>;

export class SpotifySyncStageError extends Error {
  constructor(
    readonly stage: SpotifySyncStage,
    cause: unknown
  ) {
    super("Spotify synchronization stage failed", { cause });
    this.name = "SpotifySyncStageError";
  }
}

export async function runSpotifySyncStage<Value>(
  stage: SpotifySyncStage,
  operation: () => Promise<Value>
): Promise<Value> {
  try {
    return await operation();
  } catch (error) {
    if (isAbortError(error) || error instanceof SpotifySyncStageError) {
      throw error;
    }
    throw new SpotifySyncStageError(stage, error);
  }
}

export function describeSpotifySyncFailure(
  error: unknown
): SpotifySyncFailure {
  const stage =
    error instanceof SpotifySyncStageError
      ? error.stage
      : "provider_snapshot";
  const cause =
    error instanceof SpotifySyncStageError ? error.cause : error;
  const message = cause instanceof Error ? cause.message : "";

  if (message === "The app has exceeded its rate limits.") {
    return { stage, kind: "rate_limited", status: 429 };
  }
  if (message.startsWith("Bad or expired token.")) {
    return { stage, kind: "unauthorized", status: 401 };
  }
  if (message.startsWith("Bad OAuth request")) {
    return { stage, kind: "forbidden", status: 403 };
  }

  const providerStatus = /^Unrecognised response code: ([1-5]\d\d)\b/.exec(
    message
  )?.[1];
  if (providerStatus) {
    return {
      stage,
      kind: "provider_error",
      status: Number(providerStatus),
    };
  }

  if (
    cause instanceof TypeError ||
    message === "Failed to fetch" ||
    message === "fetch failed"
  ) {
    return { stage, kind: "network_error", status: null };
  }
  if (message.startsWith("Spotify ")) {
    const reason = getProviderDataFailureReason(message);
    return {
      stage,
      kind: "provider_data",
      status: null,
      ...(reason ? { reason } : {}),
    };
  }
  if (
    stage === "staging_database" ||
    stage === "top_tracks_write" ||
    stage === "snapshot_read" ||
    stage === "snapshot_publish"
  ) {
    return { stage, kind: "local_database", status: null };
  }
  return { stage, kind: "unexpected", status: null };
}

export function getSpotifySyncFailureMessage(
  failure: SpotifySyncFailure
): string {
  if (failure.kind === "rate_limited") {
    return "Spotify temporarily rate-limited background sync. Your saved library remains available, and sync will retry automatically.";
  }

  const stageLabels: Record<SpotifySyncStage, string> = {
    staging_database: "preparing the local database",
    top_tracks: "loading top tracks",
    top_tracks_pagination: "loading top-track pages",
    top_tracks_normalization: "checking top-track data",
    top_tracks_write: "saving top tracks",
    top_artists: "loading top artists",
    play_history: "loading play history",
    saved_tracks: "loading saved tracks",
    artist_enrichment: "updating artist details",
    snapshot_read: "checking the refreshed library",
    snapshot_publish: "saving the refreshed library",
    provider_snapshot: "refreshing Spotify data",
  };
  return `Your saved library is available, but background Spotify sync failed while ${stageLabels[failure.stage]}.`;
}

function getProviderDataFailureReason(
  message: string
): SpotifySyncFailureReason | undefined {
  if (message === "Spotify pagination returned an unexpected offset") {
    return "pagination_unexpected_offset";
  }
  if (message === "Spotify pagination returned an invalid total") {
    return "pagination_invalid_total";
  }
  if (message === "Spotify pagination total changed during synchronization") {
    return "pagination_total_changed";
  }
  if (
    message.startsWith("Spotify pagination exceeded the ") &&
    message.endsWith(" safety limit")
  ) {
    return "pagination_safety_limit";
  }
  if (message === "Spotify pagination returned more items than requested") {
    return "pagination_page_too_large";
  }
  if (message === "Spotify pagination exceeded its reported total") {
    return "pagination_reported_total_exceeded";
  }
  if (message === "Spotify pagination ended before the snapshot was complete") {
    return "pagination_ended_early";
  }
  if (message === "Spotify pagination stalled before completion") {
    return "pagination_stalled";
  }
  if (message === "Spotify returned an invalid top track") {
    return "top_track_unusable";
  }
  if (message === "Spotify returned an invalid top artist") {
    return "top_artist_unusable";
  }
  if (message === "Spotify returned an invalid or duplicate saved track") {
    return "saved_track_invalid_or_duplicate";
  }
  if (message === "Spotify returned an invalid play-history item") {
    return "play_history_item_unusable";
  }
}
