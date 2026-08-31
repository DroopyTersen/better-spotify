import {
  initAccountDatabase,
  type AccountDatabase,
} from "~/db/db.client";
import {
  createEmptySpotifyData,
  spotifyDb,
  type SpotifyData,
} from "../spotify.db";
import { isFullSyncComplete } from "./syncContext";

export const OPTIONAL_LIBRARY_SNAPSHOT_TIMEOUT_MS = 5_000;

type LibrarySnapshotDependencies = Readonly<{
  initialize: (accountId: string) => Promise<AccountDatabase>;
  read: (database: AccountDatabase) => Promise<SpotifyData>;
  isComplete: (database: AccountDatabase) => Promise<boolean>;
}>;

const defaultDependencies: LibrarySnapshotDependencies = {
  initialize: initAccountDatabase,
  read: ({ db }) => spotifyDb.getAllSpotifyData(db),
  isComplete: isFullSyncComplete,
};

export async function withOptionalLibraryDeadline<Value>(
  operation: () => Promise<Value>,
  timeoutMs = OPTIONAL_LIBRARY_SNAPSHOT_TIMEOUT_MS
): Promise<Value> {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
    throw new RangeError("Library snapshot timeout must be a positive safe integer");
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_resolve, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error("Optional local library timed out")),
        timeoutMs
      );
      if (typeof timeoutId === "object" && "unref" in timeoutId) {
        timeoutId.unref();
      }
    });
    return await Promise.race([Promise.resolve().then(operation), timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export async function loadAccountLibrarySnapshot(
  accountId: string,
  dependencies: LibrarySnapshotDependencies = defaultDependencies,
  timeoutMs = OPTIONAL_LIBRARY_SNAPSHOT_TIMEOUT_MS
) {
  try {
    const { spotifyData, fullSyncComplete } =
      await withOptionalLibraryDeadline(async () => {
        const database = await dependencies.initialize(accountId);
        const [spotifyData, fullSyncComplete] = await Promise.all([
          dependencies.read(database),
          dependencies.isComplete(database),
        ]);
        return { spotifyData, fullSyncComplete };
      }, timeoutMs);
    return {
      ...spotifyData,
      libraryAvailable: true as const,
      needsInitialSync: !fullSyncComplete,
      localLibraryWarning: null,
    };
  } catch {
    // PGlite is an optional browser read model. Keep authentication and live
    // Spotify routes usable if IndexedDB, WASM initialization, or a query fails.
    console.error("The local music library could not be opened");
    return {
      ...createEmptySpotifyData(),
      libraryAvailable: false as const,
      needsInitialSync: false,
      localLibraryWarning:
        "Your local music library is unavailable, but live Spotify features still work.",
    };
  }
}
