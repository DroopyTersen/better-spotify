import { eq } from "drizzle-orm";
import type { AccountDatabase, DB } from "~/db/db.client";
import { libraryMetadataTable } from "~/db/db.schema";

const FULL_SYNC_METADATA_KEY = "full_sync_version";
const FULL_SYNC_VERSION = "1";

export type SpotifySyncContext = Readonly<{
  accountId: string;
  database: AccountDatabase;
  signal: AbortSignal;
  isCurrent: () => boolean;
}>;

export type SyncTransaction = Parameters<
  Parameters<DB["transaction"]>[0]
>[0];

export function createAbortError(message = "Spotify synchronization was cancelled") {
  return new DOMException(message, "AbortError");
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function assertActiveSync(context: SpotifySyncContext): void {
  if (
    context.signal.aborted ||
    !context.isCurrent() ||
    context.database.accountId !== context.accountId
  ) {
    throw createAbortError();
  }
}

export async function runSyncTransaction<Result>(
  context: SpotifySyncContext,
  operation: (transaction: SyncTransaction) => Promise<Result>
): Promise<Result> {
  assertActiveSync(context);
  return context.database.db.transaction(async (transaction) => {
    assertActiveSync(context);
    const result = await operation(transaction);
    // Throwing here rolls back every write made by the callback when the
    // account context changed while a PGlite statement was in flight.
    assertActiveSync(context);
    return result;
  });
}

export async function isFullSyncComplete(
  database: AccountDatabase
): Promise<boolean> {
  const row = await database.db.query.libraryMetadataTable.findFirst({
    columns: { value: true },
    where: eq(libraryMetadataTable.key, FULL_SYNC_METADATA_KEY),
  });
  return row?.value === FULL_SYNC_VERSION;
}

export async function markFullSyncComplete(
  context: SpotifySyncContext
): Promise<void> {
  await runSyncTransaction(context, async (transaction) => {
    await transaction
      .insert(libraryMetadataTable)
      .values({ key: FULL_SYNC_METADATA_KEY, value: FULL_SYNC_VERSION })
      .onConflictDoUpdate({
        target: libraryMetadataTable.key,
        set: { value: FULL_SYNC_VERSION },
      });
  });
}

export async function markFullSyncIncomplete(
  context: SpotifySyncContext
): Promise<void> {
  await runSyncTransaction(context, async (transaction) => {
    await transaction
      .delete(libraryMetadataTable)
      .where(eq(libraryMetadataTable.key, FULL_SYNC_METADATA_KEY));
  });
}
