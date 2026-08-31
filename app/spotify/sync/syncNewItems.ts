import { spotifyWebApi } from "../api/spotifyWebApi";
import type { SpotifySdk } from "../createSpotifySdk";
import { syncFullArtistData } from "./syncFullArtistData";
import {
  assertActiveSync,
  runSyncTransaction,
  type SpotifySyncContext,
} from "./syncContext";
import { writeArtistGraph, writeTrackGraph } from "./syncDb";
import {
  normalizeArtistGraph,
  normalizeTrackGraph,
  uniqueNonEmptyIds,
} from "./syncRecords";

const PROVIDER_REQUEST_BATCH_SIZE = 25;

const fetchInBatches = async <Value>(
  ids: string[],
  fetchBatch: (ids: string[]) => Promise<Value[]>
) => {
  const values: Value[] = [];
  for (let index = 0; index < ids.length; index += PROVIDER_REQUEST_BATCH_SIZE) {
    values.push(
      ...(await fetchBatch(ids.slice(index, index + PROVIDER_REQUEST_BATCH_SIZE)))
    );
  }
  return values;
};

export const syncNewArtists = async (
  sdk: SpotifySdk,
  artistIds: string[],
  context: SpotifySyncContext
) => {
  const ids = uniqueNonEmptyIds(artistIds);
  if (!ids.length) return { synchronized: 0 };

  const providerArtists = await fetchInBatches(ids, (batch) =>
    spotifyWebApi.getArtists(sdk, batch)
  );
  assertActiveSync(context);
  const graph = normalizeArtistGraph(providerArtists);
  if (graph.artists.length !== ids.length) {
    throw new Error("Spotify returned incomplete artist details");
  }

  await runSyncTransaction(context, (tx) => writeArtistGraph(tx, graph));
  return { synchronized: graph.artists.length };
};

export const syncNewTracks = async (
  sdk: SpotifySdk,
  trackIds: string[],
  context: SpotifySyncContext
) => {
  const ids = uniqueNonEmptyIds(trackIds);
  if (!ids.length) return { synchronized: 0 };

  const providerTracks = await fetchInBatches(ids, (batch) =>
    spotifyWebApi.getTracks(sdk, batch)
  );
  assertActiveSync(context);
  const graph = normalizeTrackGraph(providerTracks);
  if (graph.tracks.length !== ids.length) {
    throw new Error("Spotify returned incomplete track details");
  }

  await runSyncTransaction(context, (tx) => writeTrackGraph(tx, graph));
  await syncFullArtistData(sdk, context);
  return { synchronized: graph.tracks.length };
};
