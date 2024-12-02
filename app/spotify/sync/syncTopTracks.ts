import { getDb } from "~/db/db.client";
import {
  albumArtistsTable,
  albumsTable,
  artistsTable,
  artistTracks,
  topTracksTable,
  tracksTable,
} from "~/db/db.schema";
import { SpotifySdk } from "../createSpotifySdk";

export const syncTopTracks = async (sdk: SpotifySdk) => {
  const db = getDb();
  let count = 0;
  let nextUrl = "first page";
  let MAX_LIMIT = 1000;

  await db.delete(topTracksTable);
  let topTracksCount = await db.$count(topTracksTable);
  console.log("🚀 | resyncTopTracks | topTracksCount:", topTracksCount);
  while (nextUrl && count < MAX_LIMIT) {
    console.log("🚀 | resyncTopTracks | trackCount:", count);
    console.log("🚀 | resyncTopTracks | nextUrl:", nextUrl);
    const nextPage = await sdk.currentUser.topItems(
      "tracks",
      "long_term",
      50,
      count as any
    );
    let rawTracks = nextPage.items;
    let artists = rawTracks.flatMap((track) => track.artists);
    await db.insert(artistsTable).values(artists).onConflictDoNothing();

    let trackArtists = rawTracks.flatMap((track) =>
      track.artists.map((artist) => ({
        track_id: track.id,
        artist_id: artist.id,
      }))
    );

    await db.insert(tracksTable).values(rawTracks).onConflictDoNothing();
    await db.insert(topTracksTable).values(
      rawTracks.map((t, index) => ({
        id: crypto.randomUUID(),
        track_id: t.id,
        position: count++,
      }))
    );

    await db.insert(artistTracks).values(trackArtists).onConflictDoNothing();
    let albums = rawTracks.map((track) => track.album);
    let albumArtistRecords = albums.flatMap((album) => album.artists);
    await db
      .insert(artistsTable)
      .values(albumArtistRecords)
      .onConflictDoNothing();
    await db.insert(albumsTable).values(albums).onConflictDoNothing();
    let albumArtists = albums.flatMap((album) =>
      album.artists.map((artist) => ({
        album_id: album.id,
        artist_id: artist.id,
      }))
    );
    await db
      .insert(albumArtistsTable)
      .values(albumArtists)
      .onConflictDoNothing();

    nextUrl = nextPage?.next && nextPage.next !== nextUrl ? nextPage.next : "";

    const artistCount = await db.$count(artistsTable);
    console.log("🚀 | resyncPlayHistory | artistCount:", artistCount);

    const trackDBCount = await db.$count(tracksTable);
    console.log("🚀 | resyncPlayHistory | trackDBCount:", trackDBCount);
  }
  console.log("🚀 | resyncTopTracks | trackCount:", count);
};
