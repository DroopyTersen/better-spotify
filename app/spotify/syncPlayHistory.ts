import { getDb } from "~/db/db.client";
import {
  albumArtistsTable,
  albumsTable,
  artistsTable,
  playHistoryTable,
  topTracksTable,
  artistTracks,
  tracksTable,
  genresTable,
  artistGenresTable,
  topArtistsTable,
} from "~/db/db.schema";
import { getPlayHistory } from "./getPlayHistory";
import { SpotifySdk } from "./createSpotifySdk";
import { eq, inArray, sql } from "drizzle-orm";
import { wait } from "~/toolkit/utils/wait";
import { Track } from "@spotify/web-api-ts-sdk";

export const resyncTopTracks = async (sdk: SpotifySdk) => {
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

export const resyncTopArtists = async (sdk: SpotifySdk) => {
  const db = getDb();
  let count = 0;
  let nextUrl = "first page";
  let MAX_LIMIT = 400;
  await db.delete(topArtistsTable);

  while (nextUrl && count < MAX_LIMIT) {
    console.log("🚀 | resyncTopArtists | nextUrl:", nextUrl);
    const nextPage = await sdk.currentUser.topItems(
      "artists",
      "long_term",
      50,
      count as any
    );
    let artists = nextPage.items;
    console.log("🚀 | resyncTopArtists | artists:", artists);

    await db
      .insert(artistsTable)
      .values(artists)
      .onConflictDoUpdate({
        target: artistsTable.id,
        set: {
          popularity: sql`excluded.popularity`,
          images: sql`excluded.images`,
        },
      });

    let genres = artists.flatMap((artist) => artist.genres);
    await db
      .insert(genresTable)
      .values(genres.map((genre) => ({ id: genre, name: genre })))
      .onConflictDoNothing();

    await db.update;
    let artistGenres = artists.flatMap((artist) =>
      artist.genres.map((genre) => ({
        artist_id: artist.id,
        genre_id: genre,
      }))
    );
    await db
      .insert(artistGenresTable)
      .values(artistGenres)
      .onConflictDoNothing();

    await db.insert(topArtistsTable).values(
      artists.map((a, index) => ({
        id: crypto.randomUUID(),
        artist_id: a.id,
        position: count + index + 1,
      }))
    );

    const artistCount = await db.$count(artistsTable);
    console.log("🚀 | artistCount:", artistCount);

    count += artists.length;
    nextUrl = nextPage?.next && nextPage.next !== nextUrl ? nextPage.next : "";
  }
  console.log("🚀 | resyncTopArtists | artistCount:", count);
};

export const resyncPlayHistory = async (sdk: SpotifySdk) => {
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

  // const albumIds = [...new Set(playHistory.map((item) => item.track.album.id))];
  // console.log("🚀 | resyncPlayHistory | albumIds:", albumIds);
  // const artistIds = [
  //   ...new Set(
  //     playHistory.flatMap((item) =>
  //       item.track.artists.map((artist) => artist.id)
  //     )
  //   ),
  // ];
  // console.log("🚀 | resyncPlayHistory | artistIds:", artistIds);

  // const existingAlbums = await db
  //   .select({
  //     id: albumsTable.id,
  //   })
  //   .from(albumsTable)
  //   .where(inArray(albumsTable.id, albumIds));

  // // filter out existing albums
  // const newAlbumIds = albumIds.filter(
  //   (albumId) => !existingAlbums.some((album) => album.id === albumId)
  // );

  // const batchSize = 100;
  // for (let i = 0; i < newAlbumIds.length; i += batchSize) {
  //   const batch = newAlbumIds.slice(i, i + batchSize);
  //   let newAlbums = await sdk.albums.get(batch);
  //   await db.insert(albumsTable).values(newAlbums);
  // }

  // const existingArtists = await db
  //   .select({
  //     id: artistsTable.id,
  //   })
  //   .from(artistsTable)
  //   .where(inArray(artistsTable.id, artistIds));

  // const newArtistIds = artistIds.filter(
  //   (artistId) => !existingArtists.some((artist) => artist.id === artistId)
  // );

  // let newArtists = await sdk.artists.get(newArtistIds);
  // await db.insert(artistsTable).values(newArtists);
  // const artistCount = await db.$count(artistsTable);
  // console.log("🚀 | resyncPlayHistory | artistCount:", artistCount);

  await wait(1000);

  // let albumArtists = artists.map((item) =>
  //   item.track.album.artists.map((artist) => ({
  //     album_id: item.track.album.id,
  //     artist_id: artist.id,
  //   }))
  // );
  // await db
  //   .insert(albumArtistsTable)
  //   .values(albumArtists.flat())
  //   .onConflictDoNothing();

  // Insert tracks with conflict handling
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
