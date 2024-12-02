import { getDb } from "~/db/db.client";
import {
  albumsTable,
  artistGenresTable,
  artistsTable,
  artistTracks,
  genresTable,
  playHistoryTable,
  topArtistsTable,
  topArtistsView,
  topTracksTable,
  topTracksView,
  trackHistoryView,
  tracksTable,
} from "~/db/db.schema";
import { eq, sql } from "drizzle-orm";

export const spotifyDb = {
  getPlayHistory: async ({
    limit = 100,
    offset = 0,
  }: { limit?: number; offset?: number } = {}) => {
    let db = getDb();
    return db
      .select({
        played_at: playHistoryTable.played_at,
        track_name: tracksTable.name,
        track_popularity: tracksTable.popularity,
        track_duration_ms: tracksTable.duration_ms,
        track_is_playable: tracksTable.is_playable,
        track_id: tracksTable.id,
        artist_id: artistsTable.id,
        artist_name: artistsTable.name,
        artist_popularity: artistsTable.popularity,
        genres: sql<string[]>`array_agg(distinct ${genresTable.name})`.as(
          "genres"
        ),
        release_date: albumsTable.release_date,
        album_name: albumsTable.name,
        images: artistsTable.images,
      })
      .from(playHistoryTable)
      .leftJoin(tracksTable, eq(playHistoryTable.track_id, tracksTable.id))
      .leftJoin(artistTracks, eq(tracksTable.id, artistTracks.track_id))
      .leftJoin(artistsTable, eq(artistTracks.artist_id, artistsTable.id))
      .leftJoin(
        artistGenresTable,
        eq(artistsTable.id, artistGenresTable.artist_id)
      )
      .leftJoin(genresTable, eq(artistGenresTable.genre_id, genresTable.id))
      .leftJoin(albumsTable, eq(tracksTable.album_id, albumsTable.id))
      .groupBy(
        playHistoryTable.played_at,
        tracksTable.id,
        tracksTable.name,
        tracksTable.popularity,
        tracksTable.duration_ms,
        tracksTable.is_playable,
        artistsTable.id,
        artistsTable.name,
        artistsTable.popularity,
        albumsTable.release_date,
        albumsTable.name,
        artistsTable.images
      );
  },
  getTopTracks: async ({
    limit = 100,
    offset = 0,
  }: { limit?: number; offset?: number } = {}) => {
    let db = getDb();
    return db
      .select({
        position: topTracksTable.position,
        track_name: tracksTable.name,
        track_popularity: tracksTable.popularity,
        track_duration_ms: tracksTable.duration_ms,
        track_is_playable: tracksTable.is_playable,
        track_id: tracksTable.id,
        artist_name: artistsTable.name,
        artist_popularity: artistsTable.popularity,
        genres: sql<string[]>`array_agg(distinct ${genresTable.name})`.as(
          "genres"
        ),
        release_date: albumsTable.release_date,
        album_name: albumsTable.name,
        images: artistsTable.images,
      })
      .from(topTracksTable)
      .leftJoin(tracksTable, eq(topTracksTable.track_id, tracksTable.id))
      .leftJoin(artistTracks, eq(tracksTable.id, artistTracks.track_id))
      .leftJoin(artistsTable, eq(artistTracks.artist_id, artistsTable.id))
      .leftJoin(
        artistGenresTable,
        eq(artistsTable.id, artistGenresTable.artist_id)
      )
      .leftJoin(genresTable, eq(artistGenresTable.genre_id, genresTable.id))
      .leftJoin(albumsTable, eq(tracksTable.album_id, albumsTable.id))
      .groupBy(
        topTracksTable.position,
        tracksTable.id,
        tracksTable.name,
        tracksTable.popularity,
        tracksTable.duration_ms,
        tracksTable.is_playable,
        artistsTable.name,
        artistsTable.popularity,
        albumsTable.release_date,
        albumsTable.name,
        artistsTable.images
      )
      .orderBy(topTracksTable.position)
      .limit(limit)
      .offset(offset);
  },
  getTopArtists: async ({
    limit = 100,
    offset = 0,
  }: { limit?: number; offset?: number } = {}) => {
    let db = getDb();
    return db
      .select({
        position: topArtistsTable.position,
        artist_id: artistsTable.id,
        artist_name: artistsTable.name,
        artist_popularity: artistsTable.popularity,
        genres: sql<string[]>`array_agg(distinct ${genresTable.name})`.as(
          "genres"
        ),
        images: artistsTable.images,
      })
      .from(topArtistsTable)
      .leftJoin(artistsTable, eq(topArtistsTable.artist_id, artistsTable.id))
      .leftJoin(
        artistGenresTable,
        eq(artistsTable.id, artistGenresTable.artist_id)
      )
      .leftJoin(genresTable, eq(artistGenresTable.genre_id, genresTable.id))
      .groupBy(
        topArtistsTable.position,
        artistsTable.id,
        artistsTable.name,
        artistsTable.popularity,
        artistsTable.images
      )
      .orderBy(topArtistsTable.position)
      .limit(limit)
      .offset(offset);
  },
};
