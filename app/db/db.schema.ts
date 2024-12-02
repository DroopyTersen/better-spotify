import { relations, eq } from "drizzle-orm";
import {
  boolean,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  bigint,
  pgView,
  jsonb,
} from "drizzle-orm/pg-core";

// Define the image type
type SpotifyImage = {
  url: string;
  height: number;
  width: number;
};

export const artistsTable = pgTable("artists", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  external_url: text("external_url"),
  href: text("href"),
  uri: text("uri"),
  popularity: integer("popularity"),
  images: jsonb("images").$type<SpotifyImage[]>(),
});

export const albumsTable = pgTable("albums", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  album_type: text("album_type"),
  total_tracks: integer("total_tracks"),
  release_date: text("release_date"),
  release_date_precision: text("release_date_precision"),
  external_url: text("external_url"),
  href: text("href"),
  uri: text("uri"),
  label: text("label"),
  popularity: integer("popularity"),
  images: jsonb("images").$type<SpotifyImage[]>(),
});

export const tracksTable = pgTable("tracks", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  album_id: text("album_id").references(() => albumsTable.id),
  disc_number: integer("disc_number"),
  duration_ms: integer("duration_ms"),
  explicit: boolean("explicit"),
  external_url: text("external_url"),
  href: text("href"),
  uri: text("uri"),
  is_playable: boolean("is_playable"),
  popularity: integer("popularity"),
  preview_url: text("preview_url"),
  track_number: integer("track_number"),
});

export const topTracksTable = pgTable("top_tracks", {
  id: text("id").primaryKey(),
  track_id: text("track_id").references(() => tracksTable.id),
  position: integer("position"),
});

export const playHistoryTable = pgTable("play_history", {
  id: text("id").primaryKey(),
  track_id: text("track_id").references(() => tracksTable.id),
  played_at: timestamp("played_at", { withTimezone: true }).notNull(),
  context_type: text("context_type"),
  context_href: text("context_href"),
  context_uri: text("context_uri"),
});

export const albumArtistsTable = pgTable(
  "album_artists",
  {
    album_id: text("album_id").references(() => albumsTable.id),
    artist_id: text("artist_id").references(() => artistsTable.id),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.album_id, table.artist_id] }),
  })
);
export const artistTracks = pgTable(
  "artist_tracks",
  {
    track_id: text("track_id").references(() => tracksTable.id),
    artist_id: text("artist_id").references(() => artistsTable.id),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.track_id, table.artist_id] }),
  })
);

export const genresTable = pgTable("genres", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
});

export const artistGenresTable = pgTable(
  "artist_genres",
  {
    artist_id: text("artist_id").references(() => artistsTable.id),
    genre_id: text("genre_id").references(() => genresTable.id),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.artist_id, table.genre_id] }),
  })
);

export const topArtistsTable = pgTable("top_artists", {
  id: text("id").primaryKey(),
  artist_id: text("artist_id").references(() => artistsTable.id),
  position: integer("position"),
});

// Define relationships
export const artistsRelations = relations(artistsTable, ({ many }) => ({
  albumArtists: many(albumArtistsTable),
  artistTracks: many(artistTracks),
  artistGenres: many(artistGenresTable),
  topArtists: many(topArtistsTable),
}));

export const albumsRelations = relations(albumsTable, ({ many }) => ({
  tracks: many(tracksTable),
  albumArtists: many(albumArtistsTable),
}));

export const tracksRelations = relations(tracksTable, ({ one, many }) => ({
  album: one(albumsTable, {
    fields: [tracksTable.album_id],
    references: [albumsTable.id],
  }),
  artistTracks: many(artistTracks),
  playHistory: many(playHistoryTable),
}));

export const playHistoryRelations = relations(playHistoryTable, ({ one }) => ({
  track: one(tracksTable, {
    fields: [playHistoryTable.track_id],
    references: [tracksTable.id],
  }),
}));

export const topTracksRelations = relations(topTracksTable, ({ one }) => ({
  track: one(tracksTable, {
    fields: [topTracksTable.track_id],
    references: [tracksTable.id],
  }),
}));

export const topArtistsRelations = relations(topArtistsTable, ({ one }) => ({
  artist: one(artistsTable, {
    fields: [topArtistsTable.artist_id],
    references: [artistsTable.id],
  }),
}));

// Add these view definitions after the existing tables and relations
export const trackHistoryView = pgView("track_history_view").as((qb) => {
  return qb
    .select({
      played_at: playHistoryTable.played_at,
      track_name: tracksTable.name,
      track_popularity: tracksTable.popularity,
      track_duration_ms: tracksTable.duration_ms,
      track_is_playable: tracksTable.is_playable,
      track_id: tracksTable.id,
      artist_name: artistsTable.name,
      artist_popularity: artistsTable.popularity,
      genre: genresTable.name,
      release_date: albumsTable.release_date,
      album_name: albumsTable.name,
      images: albumsTable.images,
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
    .leftJoin(albumsTable, eq(tracksTable.album_id, albumsTable.id));
});

export const artistHistoryView = pgView("artist_history_view").as((qb) => {
  return qb
    .select({
      artist_id: artistsTable.id,
      artist_name: artistsTable.name,
      artist_popularity: artistsTable.popularity,
      genre: genresTable.name,
      played_at: playHistoryTable.played_at,
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
    .leftJoin(genresTable, eq(artistGenresTable.genre_id, genresTable.id));
});

export const topTracksView = pgView("top_tracks_view").as((qb) => {
  return qb
    .select({
      position: topTracksTable.position,
      track_name: tracksTable.name,
      track_popularity: tracksTable.popularity,
      track_duration_ms: tracksTable.duration_ms,
      track_is_playable: tracksTable.is_playable,
      track_id: tracksTable.id,
      artist_name: artistsTable.name,
      artist_popularity: artistsTable.popularity,
      genre: genresTable.name,
      release_date: albumsTable.release_date,
      album_name: albumsTable.name,
      images: albumsTable.images,
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
    .orderBy(topTracksTable.position);
});

export const topArtistsView = pgView("top_artists_view").as((qb) => {
  return qb
    .select({
      position: topArtistsTable.position,
      artist_id: artistsTable.id,
      artist_name: artistsTable.name,
      artist_popularity: artistsTable.popularity,
      genre: genresTable.name,
      images: artistsTable.images,
    })
    .from(topArtistsTable)
    .leftJoin(artistsTable, eq(topArtistsTable.artist_id, artistsTable.id))
    .leftJoin(
      artistGenresTable,
      eq(artistsTable.id, artistGenresTable.artist_id)
    )
    .leftJoin(genresTable, eq(artistGenresTable.genre_id, genresTable.id))
    .orderBy(topArtistsTable.position);
});
