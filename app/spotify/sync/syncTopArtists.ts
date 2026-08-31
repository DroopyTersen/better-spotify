import { topArtistsTable } from "~/db/db.schema";
import type { SpotifySdk } from "../createSpotifySdk";
import {
  collectAllOffsetPages,
  MAX_COMPLETE_TOP_ITEM_REQUESTS,
} from "./pagination";
import {
  assertActiveSync,
  runSyncTransaction,
  type SpotifySyncContext,
} from "./syncContext";
import { writeArtistGraph } from "./syncDb";
import { normalizeArtist, normalizeArtistGraph } from "./syncRecords";

export const syncTopArtists = async (
  sdk: SpotifySdk,
  context: SpotifySyncContext
) => {
  const providerArtists = await collectAllOffsetPages({
    maxRequests: MAX_COMPLETE_TOP_ITEM_REQUESTS,
    fetchPage: (limit, offset) =>
      sdk.currentUser.topItems("artists", "long_term", limit as 50, offset),
  });
  assertActiveSync(context);
  const artistGraph = normalizeArtistGraph(providerArtists);
  const rankings = providerArtists.flatMap((artist, index) => {
    const normalized = normalizeArtist(artist);
    return normalized
      ? [
          {
            id: `long_term:${index + 1}`,
            artist_id: normalized.id,
            position: index + 1,
          },
        ]
      : [];
  });
  if (rankings.length !== providerArtists.length) {
    throw new Error("Spotify returned an invalid top artist");
  }

  await runSyncTransaction(context, async (tx) => {
    await writeArtistGraph(tx, artistGraph);
    await tx.delete(topArtistsTable);
    if (rankings.length) await tx.insert(topArtistsTable).values(rankings);
  });

  return { synchronized: rankings.length };
};
