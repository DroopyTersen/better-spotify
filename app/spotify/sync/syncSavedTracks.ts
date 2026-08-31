import { savedTracksTable } from "~/db/db.schema";
import type { SpotifySdk } from "../createSpotifySdk";
import { processOffsetPages } from "./pagination";
import {
  assertActiveSync,
  runSyncTransaction,
  type SpotifySyncContext,
} from "./syncContext";
import { writeTrackGraph } from "./syncDb";
import { normalizeTrack, normalizeTrackGraph, validDate } from "./syncRecords";

// At Spotify's maximum page size this permits a 250,000-track library while
// still failing explicitly if a malformed or implausibly large response would
// otherwise keep a full refresh running without an operational ceiling.
export const MAX_SAVED_TRACK_REQUESTS = 5_000;

export const syncSavedTracks = async (
  sdk: SpotifySdk,
  context: SpotifySyncContext
) => {
  const seenTrackIds = new Set<string>();
  const result = await runSyncTransaction(context, async (tx) => {
    await tx.delete(savedTracksTable);
    return processOffsetPages({
      maxRequests: MAX_SAVED_TRACK_REQUESTS,
      fetchPage: (limit, offset) =>
        sdk.currentUser.tracks.savedTracks(limit as 50, offset),
      processPage: async (savedItems) => {
        assertActiveSync(context);
        const trackGraph = normalizeTrackGraph(
          savedItems.map((item) => item.track)
        );
        const rows = savedItems.flatMap((item) => {
          const track = normalizeTrack(item.track);
          const addedAt = validDate(item.added_at);
          if (!track || !addedAt || seenTrackIds.has(track.id)) return [];
          seenTrackIds.add(track.id);
          return [
            {
              id: track.id,
              track_id: track.id,
              added_at: addedAt,
            },
          ];
        });
        if (rows.length !== savedItems.length) {
          throw new Error("Spotify returned an invalid or duplicate saved track");
        }

        await writeTrackGraph(tx, trackGraph);
        if (rows.length) await tx.insert(savedTracksTable).values(rows);
      },
    });
  });

  return { synchronized: result.items };
};
