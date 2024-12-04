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
  external_urls: jsonb().$type<{
    spotify: string;
  }>(),
  followers: jsonb().$type<{
    href: string | null;
    total: number;
  }>(),
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
  external_urls: jsonb().$type<{
    spotify: string;
  }>(),
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
  external_urls: jsonb().$type<{
    spotify: string;
  }>(),
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

export const playlistsTable = pgTable("playlists", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  collaborative: boolean("collaborative").default(false),
  public: boolean("public"),
  snapshot_id: text("snapshot_id"),
  external_urls: jsonb().$type<{
    spotify: string;
  }>(),
  uri: text("uri"),
  images: jsonb("images").$type<SpotifyImage[]>(),
  // Owner info
  owner: jsonb("owner").$type<{
    id: string;
    external_urls: {
      spotify: string;
    };
    display_name: string;
    href: string;
    uri: string;
  }>(),
});

export const playlistTracksTable = pgTable(
  "playlist_tracks",
  {
    playlist_id: text("playlist_id").references(() => playlistsTable.id),
    track_id: text("track_id").references(() => tracksTable.id),
    added_at: timestamp("added_at", { withTimezone: true }).notNull(),
    // Added by user info
    added_by: jsonb("added_by").$type<{
      id: string;
      external_urls: {
        spotify: string;
      };
      href: string;
      uri: string;
    }>(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.playlist_id, table.track_id] }),
  })
);

export const savedTracksTable = pgTable("saved_tracks", {
  id: text("id").primaryKey(),
  track_id: text("track_id").references(() => tracksTable.id),
  added_at: timestamp("added_at", { withTimezone: true }).notNull(),
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

export const playlistsRelations = relations(playlistsTable, ({ many }) => ({
  playlistTracks: many(playlistTracksTable),
}));

export const playlistTracksRelations = relations(
  playlistTracksTable,
  ({ one }) => ({
    playlist: one(playlistsTable, {
      fields: [playlistTracksTable.playlist_id],
      references: [playlistsTable.id],
    }),
    track: one(tracksTable, {
      fields: [playlistTracksTable.track_id],
      references: [tracksTable.id],
    }),
  })
);

export const savedTracksRelations = relations(savedTracksTable, ({ one }) => ({
  track: one(tracksTable, {
    fields: [savedTracksTable.track_id],
    references: [tracksTable.id],
  }),
}));
