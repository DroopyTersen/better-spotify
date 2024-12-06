import { getDb } from "~/db/db.client";
import { artistGenresTable, artistsTable, genresTable } from "~/db/db.schema";

import { isNull, sql } from "drizzle-orm";
import { SpotifySdk } from "../createSpotifySdk";

export const syncFullArtistData = async (sdk: SpotifySdk) => {
  const db = getDb();
  let artistsWithNoImages = await db.query.artistsTable.findMany({
    where: isNull(artistsTable.images),
  });
  let artistIds = artistsWithNoImages.map((artist) => artist.id);
  console.log(
    "🚀 | syncFullArtistData | artists with no images:",
    artistIds.length
  );

  // Process artists in batches of 25
  const BATCH_SIZE = 25;
  for (let i = 0; i < artistIds.length; i += BATCH_SIZE) {
    const batchIds = artistIds.slice(i, i + BATCH_SIZE);

    // Get full artist data for current batch
    let fullArtists = await sdk.artists.get(batchIds);
    if (fullArtists.length > 0) {
      // Update artists table with images
      await db
        .insert(artistsTable)
        .values(fullArtists)
        .onConflictDoUpdate({
          target: artistsTable.id,
          set: { images: sql`excluded.images` },
        });
    }

    // Insert genres for current batch
    let genres = fullArtists.flatMap((artist) => artist.genres);
    if (genres.length > 0) {
      await db
        .insert(genresTable)
        .values(genres.map((genre) => ({ id: genre, name: genre })))
        .onConflictDoNothing();
    }

    // Link artists to genres for current batch
    let artistGenres = fullArtists.flatMap((artist) =>
      artist.genres.map((genre) => ({
        artist_id: artist.id,
        genre_id: genre,
      }))
    );
    if (artistGenres.length > 0) {
      await db
        .insert(artistGenresTable)
        .values(artistGenres)
        .onConflictDoNothing();
    }

    // Log progress
    console.log(`Processed ${i + BATCH_SIZE} of ${artistIds.length} artists`);
  }
};
