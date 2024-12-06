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
import { desc } from "drizzle-orm";

export const syncPlayHistory = async (sdk: SpotifySdk) => {
  console.log("resyncPlayHistory");
  const db = getDb();
  let mostRecentItems = await db
    .select({
      played_at: playHistoryTable.played_at,
    })
    .from(playHistoryTable)
    .orderBy(desc(playHistoryTable.played_at))
    .limit(1);
  let mostRecentPlayedAt = mostRecentItems[0]?.played_at;
  // Delete existing play history
  let after = mostRecentPlayedAt
    ? mostRecentPlayedAt.getTime().toString()
    : undefined;
  // Fetch all tracks from Spotify
  const playHistory = await getPlayHistory(sdk, {
    after,
  });
  if (playHistory.length < 1) {
    return {
      inserted: 0,
    };
  }

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
  await db
    .insert(playHistoryTable)
    .values(
      playHistory.map((item) => ({
        id: new Date().getTime().toString() + item.track.id,
        track_id: item.track.id,
        context_href: item?.context?.href,
        context_type: item?.context?.type,
        played_at: new Date(item.played_at),
      }))
    )
    .onConflictDoNothing();
  const count = await db.$count(playHistoryTable);
  console.log("count", count);

  return {
    inserted: playHistory.length,
  };
};
