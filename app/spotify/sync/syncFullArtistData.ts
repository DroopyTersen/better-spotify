import { artistsTable } from "~/db/db.schema";
import { asc, isNull } from "drizzle-orm";
import { spotifyWebApi } from "../api/spotifyWebApi";
import type { SpotifySdk } from "../createSpotifySdk";
import {
  assertActiveSync,
  runSyncTransaction,
  type SpotifySyncContext,
} from "./syncContext";
import { writeArtistGraph } from "./syncDb";
import { normalizeArtistGraph } from "./syncRecords";

const ARTIST_REQUEST_BATCH_SIZE = 5;
export const MAX_ARTIST_ENRICHMENTS_PER_SYNC = 25;

export const syncFullArtistData = async (
  sdk: SpotifySdk,
  context: SpotifySyncContext
) => {
  assertActiveSync(context);
  const db = context.database.db;
  const artistsWithoutImages = await db.query.artistsTable.findMany({
    columns: { id: true },
    where: isNull(artistsTable.images),
    orderBy: asc(artistsTable.id),
    limit: MAX_ARTIST_ENRICHMENTS_PER_SYNC,
  });
  assertActiveSync(context);
  const artistIds = [...new Set(artistsWithoutImages.map(({ id }) => id))];
  let synchronized = 0;
  let failed = 0;

  for (let index = 0; index < artistIds.length; index += ARTIST_REQUEST_BATCH_SIZE) {
    const batchIds = artistIds.slice(index, index + ARTIST_REQUEST_BATCH_SIZE);
    const results = await Promise.allSettled(
      batchIds.map((id) => spotifyWebApi.getArtists(sdk, [id]))
    );
    assertActiveSync(context);
    const providerArtists = results.flatMap((result) =>
      result.status === "fulfilled" && result.value.length === 1
        ? result.value
        : []
    );
    failed += batchIds.length - providerArtists.length;
    if (!providerArtists.length) continue;
    const graph = normalizeArtistGraph(providerArtists);
    await runSyncTransaction(context, (tx) => writeArtistGraph(tx, graph));
    synchronized += graph.artists.length;
  }

  return { attempted: artistIds.length, synchronized, failed };
};
