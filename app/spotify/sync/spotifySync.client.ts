import type { AccountDatabase } from "~/db/db.client";
import type { SpotifySdk } from "../createSpotifySdk";
import { syncFullArtistData } from "./syncFullArtistData";
import { syncPlayHistory } from "./syncPlayHistory";
import { syncSpotifyData } from "./syncSpotifyData";
import {
  assertActiveSync,
  createAbortError,
  isAbortError,
  type SpotifySyncContext,
} from "./syncContext";
import { runSpotifySyncStage } from "./syncFailure";

export type SpotifySyncMode = "full" | "incremental";

export type SpotifySyncRequest = Readonly<{
  accountId: string;
  database: AccountDatabase;
  sdk: SpotifySdk;
  mode: SpotifySyncMode;
  signal?: AbortSignal;
}>;

type SyncOperation = (
  sdk: SpotifySdk,
  context: SpotifySyncContext
) => Promise<void>;

type SpotifySyncOperations = Readonly<{
  full: SyncOperation;
  incremental: SyncOperation;
}>;

type AccountSyncState = {
  accountId: string;
  controller: AbortController;
  latestRequest: SpotifySyncRequest;
  pendingMode: SpotifySyncMode | null;
  runningMode: SpotifySyncMode | null;
  running: Promise<void>;
};

const defaultOperations: SpotifySyncOperations = {
  full: syncSpotifyData,
  async incremental(sdk, context) {
    await runSpotifySyncStage("play_history", () =>
      syncPlayHistory(sdk, context)
    );
    // Artist artwork is useful enrichment, not part of the core library
    // snapshot. Each pass is bounded and tolerates individual provider
    // failures so a large library cannot delay or invalidate a full publish.
    await runSpotifySyncStage("artist_enrichment", () =>
      syncFullArtistData(sdk, context)
    );
  },
};

/**
 * Serializes synchronization per Spotify account. A full request that arrives
 * behind incremental work is queued and completes before the shared promise
 * resolves; work for different account databases never coalesces.
 */
export function createSpotifySyncCoordinator(
  operations: SpotifySyncOperations = defaultOperations
) {
  const accountStates = new Map<string, AccountSyncState>();

  const cancel = (accountId: string) => {
    const state = accountStates.get(accountId);
    if (!state) return;
    accountStates.delete(accountId);
    state.pendingMode = null;
    state.controller.abort(createAbortError());
  };

  const queueMode = (state: AccountSyncState, mode: SpotifySyncMode) => {
    if (mode === "full") {
      if (state.runningMode !== "full") state.pendingMode = "full";
      return;
    }
    if (!state.runningMode && !state.pendingMode) {
      state.pendingMode = "incremental";
    }
  };

  const runQueue = async (state: AccountSyncState) => {
    try {
      while (state.pendingMode) {
        const mode = state.pendingMode;
        const request = state.latestRequest;
        state.pendingMode = null;
        state.runningMode = mode;

        const context: SpotifySyncContext = {
          accountId: state.accountId,
          database: request.database,
          signal: state.controller.signal,
          isCurrent: () =>
            accountStates.get(state.accountId) === state &&
            !request.signal?.aborted,
        };

        try {
          assertActiveSync(context);
          await operations[mode](request.sdk, context);
          assertActiveSync(context);
        } catch (error) {
          if (isAbortError(error) || state.controller.signal.aborted) throw error;
          // A full request queued behind a failed incremental attempt still gets
          // its own chance to repair the complete account snapshot.
          if (!state.pendingMode) throw error;
        } finally {
          state.runningMode = null;
        }
      }
    } finally {
      if (accountStates.get(state.accountId) === state) {
        accountStates.delete(state.accountId);
      }
    }
  };

  const synchronize = (request: SpotifySyncRequest): Promise<void> => {
    if (request.database.accountId !== request.accountId) {
      return Promise.reject(
        new Error("Spotify sync account does not match its local database")
      );
    }
    if (request.signal?.aborted) {
      return Promise.reject(createAbortError());
    }

    let state = accountStates.get(request.accountId);
    if (!state) {
      state = {
        accountId: request.accountId,
        controller: new AbortController(),
        latestRequest: request,
        pendingMode: request.mode,
        runningMode: null,
        running: Promise.resolve(),
      };
      accountStates.set(request.accountId, state);
      state.running = runQueue(state);
    } else {
      state.latestRequest = request;
      queueMode(state, request.mode);
    }

    if (request.signal) {
      const abort = () => cancel(request.accountId);
      request.signal.addEventListener("abort", abort, { once: true });
      void state.running
        .finally(() => request.signal?.removeEventListener("abort", abort))
        .catch(() => undefined);
    }

    return state.running;
  };

  return { cancel, synchronize };
}

const spotifySyncCoordinator = createSpotifySyncCoordinator();

export const synchronizeSpotifyLibrary = (request: SpotifySyncRequest) =>
  spotifySyncCoordinator.synchronize(request);

export const cancelSpotifySynchronization = (accountId: string) =>
  spotifySyncCoordinator.cancel(accountId);
