import { topTracksTable } from "~/db/db.schema";
import type { SpotifySdk } from "../createSpotifySdk";
import { collectOffsetPages } from "./pagination";
import {
  assertActiveSync,
  runSyncTransaction,
  type SpotifySyncContext,
} from "./syncContext";
import { writeTrackGraph } from "./syncDb";
import { normalizeTrack, normalizeTrackGraph } from "./syncRecords";

const MAX_TOP_TRACKS = 500;

export const syncTopTracks = async (
  sdk: SpotifySdk,
  context: SpotifySyncContext
) => {
  const providerTracks = await collectOffsetPages({
    maxItems: MAX_TOP_TRACKS,
    fetchPage: (limit, offset) =>
      sdk.currentUser.topItems("tracks", "long_term", limit as 50, offset),
  });
  assertActiveSync(context);
  const trackGraph = normalizeTrackGraph(providerTracks);
  const rankings = providerTracks.flatMap((track, index) => {
    const normalized = normalizeTrack(track);
    return normalized
      ? [
          {
            id: `long_term:${index + 1}`,
            track_id: normalized.id,
            position: index + 1,
          },
        ]
      : [];
  });
  if (rankings.length !== providerTracks.length) {
    throw new Error("Spotify returned an invalid top track");
  }

  await runSyncTransaction(context, async (tx) => {
    await writeTrackGraph(tx, trackGraph);
    await tx.delete(topTracksTable);
    if (rankings.length) await tx.insert(topTracksTable).values(rankings);
  });

  return { synchronized: rankings.length };
};
