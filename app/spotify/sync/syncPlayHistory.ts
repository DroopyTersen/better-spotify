import { getDb } from "~/db/db.client";
import {
  albumsTable,
  artistsTable,
  artistTracks,
  playHistoryTable,
  tracksTable,
} from "~/db/db.schema";
import { wait } from "~/toolkit/utils/wait";
import { getPlayHistory } from "../api/getPlayHistory";
import { SpotifySdk } from "../createSpotifySdk";

export const syncPlayHistory = async (sdk: SpotifySdk) => {
  console.log("resyncPlayHistory");
  const db = getDb();
  // Delete existing play history
  await db.delete(playHistoryTable);

  // Fetch all tracks from Spotify
  const playHistory = await getPlayHistory(sdk);

  const albums = playHistory.map((item) => item.track.album);
  await db.insert(albumsTable).values(albums).onConflictDoNothing();
  const albumCount = await db.$count(albumsTable);
  console.log("🚀 | resyncPlayHistory | albumCount:", albumCount);

  let artists = playHistory.flatMap((item) => item.track.artists);
  await db.insert(artistsTable).values(artists).onConflictDoNothing();
  const artistCount = await db.$count(artistsTable);
  console.log("🚀 | resyncPlayHistory | artistCount:", artistCount);

  await db
    .insert(tracksTable)
    .values(playHistory.map((item) => item.track))
    .onConflictDoNothing();

  const trackCount = await db.$count(tracksTable);
  console.log("🚀 | resyncPlayHistory | trackCount:", trackCount);

  const trackArtists = playHistory.map((item) =>
    item.track.artists.map((artist) => ({
      track_id: item.track.id,
      artist_id: artist.id,
    }))
  );

  await db
    .insert(artistTracks)
    .values(trackArtists.flat())
    .onConflictDoNothing();

  // Insert all play history records
  await db.insert(playHistoryTable).values(
    playHistory.map((item) => ({
      id: crypto.randomUUID(),
      track_id: item.track.id,
      context_href: item?.context?.href,
      context_type: item?.context?.type,
      played_at: new Date(item.played_at),
    }))
  );
  const count = await db.$count(playHistoryTable);
  console.log("count", count);

  return {
    playHistoryCount: playHistory.length,
  };
};
