import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { applyMigrations, type AccountDatabase } from "~/db/db.client";
import { libraryMetadataTable } from "~/db/db.schema";
import * as schema from "~/db/db.schema";
import { SpotifySdk } from "../createSpotifySdk";
import { syncPlayHistory } from "./syncPlayHistory";
import { syncSavedTracks } from "./syncSavedTracks";
import { syncTopArtists } from "./syncTopArtists";
import { syncTopTracks } from "./syncTopTracks";
import {
  assertActiveSync,
  markFullSyncIncomplete,
  runSyncTransaction,
  type SpotifySyncContext,
} from "./syncContext";
import { publishSyncSnapshot, readSyncSnapshot } from "./syncDb";

type FullSyncStage = (
  sdk: SpotifySdk,
  context: SpotifySyncContext
) => Promise<unknown>;

const defaultFullSyncStages: readonly FullSyncStage[] = [
  syncTopTracks,
  syncTopArtists,
  syncPlayHistory,
  syncSavedTracks,
];

export const syncSpotifyData = async (
  sdk: SpotifySdk,
  context: SpotifySyncContext,
  stages: readonly FullSyncStage[] = defaultFullSyncStages
) => {
  assertActiveSync(context);
  const stagingPg = new PGlite();
  try {
    await applyMigrations(stagingPg);
    assertActiveSync(context);
    const stagingDatabase: AccountDatabase = {
      accountId: context.accountId,
      pg: stagingPg,
      db: drizzle({ client: stagingPg, schema }),
    };
    const stagingContext: SpotifySyncContext = {
      ...context,
      database: stagingDatabase,
    };

    // Network-bound work builds a complete candidate away from the live cache.
    // The active account stays readable and unchanged if any stage fails.
    await markFullSyncIncomplete(stagingContext);
    for (const stage of stages) await stage(sdk, stagingContext);
    assertActiveSync(context);
    const snapshot = await readSyncSnapshot(stagingDatabase.db);
    assertActiveSync(context);

    // Only normalized local writes and the completion marker are published in
    // this short transaction. Cancellation during publication rolls it back.
    await runSyncTransaction(context, async (transaction) => {
      await publishSyncSnapshot(transaction, snapshot);
      await transaction
        .insert(libraryMetadataTable)
        .values({ key: "full_sync_version", value: "1" })
        .onConflictDoUpdate({
          target: libraryMetadataTable.key,
          set: { value: "1" },
        });
    });
  } finally {
    await stagingPg.close().catch(() => undefined);
  }
};
