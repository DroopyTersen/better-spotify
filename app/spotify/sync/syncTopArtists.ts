import { getDb } from "~/db/db.client";
import {
  artistGenresTable,
  artistsTable,
  genresTable,
  topArtistsTable,
} from "~/db/db.schema";

import { sql } from "drizzle-orm";
import { SpotifySdk } from "../createSpotifySdk";

export const syncTopArtists = async (sdk: SpotifySdk) => {
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
