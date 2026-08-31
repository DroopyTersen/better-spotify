import { topTracksTable } from "~/db/db.schema";
import type { SpotifySdk } from "../createSpotifySdk";
import { collectOffsetPages } from "./pagination";
import {
  assertActiveSync,
  runSyncTransaction,
  type SpotifySyncContext,
} from "./syncContext";
import { writeTrackGraph } from "./syncDb";
import { runSpotifySyncStage } from "./syncFailure";
import { normalizeTrack, normalizeTrackGraph } from "./syncRecords";

const MAX_TOP_TRACKS = 500;

export const syncTopTracks = async (
  sdk: SpotifySdk,
  context: SpotifySyncContext
) => {
  const providerTracks = await runSpotifySyncStage(
    "top_tracks_pagination",
    () =>
      collectOffsetPages({
        maxItems: MAX_TOP_TRACKS,
        fetchPage: (limit, offset) =>
          sdk.currentUser.topItems(
            "tracks",
            "long_term",
            limit as 50,
            offset
          ),
      })
  );
  assertActiveSync(context);
  // Top-item snapshots can retain local, removed, or otherwise unavailable
  // entries that have no cacheable Spotify ID. Keep the usable rankings and
  // their original positions instead of invalidating the entire library sync.
  const normalizedTracks = await runSpotifySyncStage(
    "top_tracks_normalization",
    async () =>
      providerTracks.flatMap((sourceTrack, index) => {
        const track = normalizeTrack(sourceTrack);
        return track
          ? [
              {
                sourceTrack,
                ranking: {
                  id: `long_term:${index + 1}`,
                  track_id: track.id,
                  position: index + 1,
                },
              },
            ]
          : [];
      })
  );
  const trackGraph = normalizeTrackGraph(
    normalizedTracks.map(({ sourceTrack }) => sourceTrack)
  );
  const rankings = normalizedTracks.map(({ ranking }) => ranking);

  await runSpotifySyncStage("top_tracks_write", () =>
    runSyncTransaction(context, async (tx) => {
      await writeTrackGraph(tx, trackGraph);
      await tx.delete(topTracksTable);
      if (rankings.length) await tx.insert(topTracksTable).values(rankings);
    })
  );

  return {
    synchronized: rankings.length,
    skipped: providerTracks.length - rankings.length,
  };
};
