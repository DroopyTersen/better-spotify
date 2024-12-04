import { getDb } from "~/db/db.client";
import {
  albumsTable,
  artistsTable,
  artistTracks,
  savedTracksTable,
  tracksTable,
} from "~/db/db.schema";
import { SpotifySdk } from "../createSpotifySdk";

export const syncSavedTracks = async (sdk: SpotifySdk) => {
  console.log("syncSavedTracks");
  const db = getDb();

  // Clear existing saved tracks
  await db.delete(savedTracksTable);

  let count = 0;
  let nextUrl = "first page";
  const MAX_LIMIT = 1000;

  while (nextUrl && count < MAX_LIMIT) {
    // Get next page of saved tracks
    const nextPage = await sdk.currentUser.tracks.savedTracks(50, count);
    const savedTracks = nextPage.items;

    // Insert albums
    const albums = savedTracks.map((item) => item.track.album);
    await db.insert(albumsTable).values(albums).onConflictDoNothing();

    // Insert artists
    const artists = savedTracks.flatMap((item) => item.track.artists);
    await db.insert(artistsTable).values(artists).onConflictDoNothing();

    // Insert tracks
    await db
      .insert(tracksTable)
      .values(savedTracks.map((item) => item.track))
      .onConflictDoNothing();

    // Insert artist-track relationships
    const trackArtists = savedTracks.flatMap((item) =>
      item.track.artists.map((artist) => ({
        track_id: item.track.id,
        artist_id: artist.id,
      }))
    );
    await db.insert(artistTracks).values(trackArtists).onConflictDoNothing();

    // Insert saved tracks records
    await db.insert(savedTracksTable).values(
      savedTracks.map((item) => ({
        id: crypto.randomUUID(),
        track_id: item.track.id,
        added_at: new Date(item.added_at),
      }))
    );

    count += savedTracks.length;
    nextUrl = nextPage?.next || "";
    console.log("🚀 | syncSavedTracks | count:", count);
  }

  const savedTracksCount = await db.$count(savedTracksTable);
  console.log("🚀 | syncSavedTracks | total saved tracks:", savedTracksCount);
};
