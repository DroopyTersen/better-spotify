import { SpotifySdk } from "../createSpotifySdk";
import { getDb } from "~/db/db.client";
import {
  artistGenresTable,
  artistsTable,
  genresTable,
  tracksTable,
  artistTracks,
  albumsTable,
} from "~/db/db.schema";
import { sql } from "drizzle-orm";

export const syncSearchSelectedArtist = async (
  sdk: SpotifySdk,
  artistId: string
) => {
  const db = getDb();

  // Get full artist data
  const artist = await sdk.artists.get(artistId);
  if (!artist) return null;

  // Insert artist
  await db
    .insert(artistsTable)
    .values(artist)
    .onConflictDoUpdate({
      target: artistsTable.id,
      set: {
        popularity: sql`excluded.popularity`,
        images: sql`excluded.images`,
      },
    });

  // Insert genres
  if (artist.genres.length > 0) {
    await db
      .insert(genresTable)
      .values(artist.genres.map((genre) => ({ id: genre, name: genre })))
      .onConflictDoNothing();

    // Link artist to genres
    await db
      .insert(artistGenresTable)
      .values(
        artist.genres.map((genre) => ({
          artist_id: artist.id,
          genre_id: genre,
        }))
      )
      .onConflictDoNothing();
  }

  return artist;
};

export const syncSearchSelectedTrack = async (
  sdk: SpotifySdk,
  trackId: string
) => {
  const db = getDb();

  // Get full track data
  const track = await sdk.tracks.get(trackId);
  if (!track) return null;

  // Insert track
  await db.insert(tracksTable).values(track).onConflictDoNothing();

  // Insert album
  if (track.album) {
    await db.insert(albumsTable).values(track.album).onConflictDoNothing();
  }

  // Insert artists and create track-artist relationships
  if (track.artists.length > 0) {
    await db.insert(artistsTable).values(track.artists).onConflictDoNothing();

    await db
      .insert(artistTracks)
      .values(
        track.artists.map((artist) => ({
          track_id: track.id,
          artist_id: artist.id,
        }))
      )
      .onConflictDoNothing();
  }

  return track;
};
