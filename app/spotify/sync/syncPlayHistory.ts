import { libraryMetadataTable, playHistoryTable } from "~/db/db.schema";
import { desc, eq } from "drizzle-orm";
import { getPlayHistoryWindow } from "../api/getPlayHistory";
import type { SpotifySdk } from "../createSpotifySdk";
import {
  assertActiveSync,
  runSyncTransaction,
  type SpotifySyncContext,
} from "./syncContext";
import { writeTrackGraph } from "./syncDb";
import {
  normalizePlayHistoryItem,
  normalizeTrackGraph,
} from "./syncRecords";

const PLAY_HISTORY_WINDOW_SIZE = 500;
const PLAY_HISTORY_CONTINUATION_KEY = "play_history_continuation_before";

export const syncPlayHistory = async (
  sdk: SpotifySdk,
  context: SpotifySyncContext
) => {
  assertActiveSync(context);
  const db = context.database.db;
  const [[mostRecent], continuation] = await Promise.all([
    db
      .select({ played_at: playHistoryTable.played_at })
      .from(playHistoryTable)
      .orderBy(desc(playHistoryTable.played_at))
      .limit(1),
    db.query.libraryMetadataTable.findFirst({
      columns: { value: true },
      where: eq(libraryMetadataTable.key, PLAY_HISTORY_CONTINUATION_KEY),
    }),
  ]);
  assertActiveSync(context);
  const after = mostRecent?.played_at.getTime().toString();

  const window = await getPlayHistoryWindow(sdk, {
    ...(continuation ? { before: continuation.value } : { after }),
    maxLimit: PLAY_HISTORY_WINDOW_SIZE,
  });
  assertActiveSync(context);
  const normalizedItems = window.items.flatMap((item) => {
    const normalized = normalizePlayHistoryItem(item);
    return normalized ? [normalized] : [];
  });
  if (normalizedItems.length !== window.items.length) {
    throw new Error("Spotify returned an invalid play-history item");
  }

  const uniqueItems = [
    ...new Map(normalizedItems.map((item) => [item.row.id, item])).values(),
  ];
  const trackGraph = normalizeTrackGraph(
    uniqueItems.map((item) => item.sourceTrack)
  );
  const inserted = await runSyncTransaction(context, async (tx) => {
    let insertedRows: { id: string }[] = [];
    if (uniqueItems.length) {
      await writeTrackGraph(tx, trackGraph);
      insertedRows = await tx
        .insert(playHistoryTable)
        .values(uniqueItems.map((item) => item.row))
        .onConflictDoNothing()
        .returning({ id: playHistoryTable.id });
    }
    if (window.nextBefore) {
      await tx
        .insert(libraryMetadataTable)
        .values({
          key: PLAY_HISTORY_CONTINUATION_KEY,
          value: window.nextBefore,
        })
        .onConflictDoUpdate({
          target: libraryMetadataTable.key,
          set: { value: window.nextBefore },
        });
    } else {
      await tx
        .delete(libraryMetadataTable)
        .where(eq(libraryMetadataTable.key, PLAY_HISTORY_CONTINUATION_KEY));
    }
    return insertedRows;
  });

  return { inserted: inserted.length, hasMore: Boolean(window.nextBefore) };
};
