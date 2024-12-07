import { DB, getDb } from "~/db/db.client";
import {
  albumsTable,
  artistGenresTable,
  artistsTable,
  artistTracks,
  genresTable,
  playHistoryTable,
  topArtistsTable,
  topTracksTable,
  tracksTable,
  playlistsTable,
  playlistTracksTable,
  savedTracksTable,
} from "~/db/db.schema";
import { eq, sql, desc } from "drizzle-orm";
import { Prettify } from "~/toolkit/utils/typescript.utils";

export const spotifyDb = {
  getPlayHistory: async (
    db: DB,
    { limit = 100, offset = 0 }: { limit?: number; offset?: number } = {}
  ) => {
    const results = await db
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
      )
      .orderBy(desc(playHistoryTable.played_at))
      .limit(limit)
      .offset(offset);

    return [...new Map(results.map((item) => [item.track_id, item])).values()];
  },
  getTopTracks: async (
    db: DB,
    { limit = 100, offset = 0 }: { limit?: number; offset?: number } = {}
  ) => {
    const results = await db
      .select({
        position: topTracksTable.position,
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
        artistsTable.id,
        artistsTable.name,
        artistsTable.popularity,
        albumsTable.release_date,
        albumsTable.name,
        artistsTable.images
      )
      .orderBy(topTracksTable.position)
      .limit(limit)
      .offset(offset);

    return [...new Map(results.map((item) => [item.track_id, item])).values()];
  },
  getTopArtists: async (
    db: DB,
    { limit = 100, offset = 0 }: { limit?: number; offset?: number } = {}
  ) => {
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
  getTopGenres: async (
    db: DB,
    { limit = 100, offset = 0 }: { limit?: number; offset?: number } = {}
  ) => {
    return db
      .select({
        genre: genresTable.name,
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
      .groupBy(genresTable.name)
      .orderBy(topTracksTable.position)
      .limit(limit)
      .offset(offset)
      .then(
        (results) => results.map((r) => r.genre).filter(Boolean) as string[]
      );
  },
  getPlaylists: async (
    db: DB,
    { limit = 100, offset = 0 }: { limit?: number; offset?: number } = {}
  ) => {
    return db
      .select({
        playlist_id: playlistsTable.id,
        playlist_name: playlistsTable.name,
        description: playlistsTable.description,
        images: playlistsTable.images,
        external_urls: playlistsTable.external_urls,
        track_count: sql<number>`count(${playlistTracksTable.track_id})`.as(
          "track_count"
        ),
        last_added_at: sql<Date>`max(${playlistTracksTable.added_at})`.as(
          "last_added_at"
        ),
      })
      .from(playlistsTable)
      .leftJoin(
        playlistTracksTable,
        eq(playlistsTable.id, playlistTracksTable.playlist_id)
      )
      .groupBy(
        playlistsTable.id,
        playlistsTable.name,
        playlistsTable.description,
        playlistsTable.images
      )
      .orderBy(sql`max(${playlistTracksTable.added_at}) DESC`)
      .limit(limit)
      .offset(offset);
  },
  getLikedTracks: async (
    db: DB,
    { limit = 100, offset = 0 }: { limit?: number; offset?: number } = {}
  ) => {
    const results = await db
      .select({
        added_at: savedTracksTable.added_at,
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
      .from(savedTracksTable)
      .leftJoin(tracksTable, eq(savedTracksTable.track_id, tracksTable.id))
      .leftJoin(artistTracks, eq(tracksTable.id, artistTracks.track_id))
      .leftJoin(artistsTable, eq(artistTracks.artist_id, artistsTable.id))
      .leftJoin(
        artistGenresTable,
        eq(artistsTable.id, artistGenresTable.artist_id)
      )
      .leftJoin(genresTable, eq(artistGenresTable.genre_id, genresTable.id))
      .leftJoin(albumsTable, eq(tracksTable.album_id, albumsTable.id))
      .groupBy(
        savedTracksTable.added_at,
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
      )
      .orderBy(desc(savedTracksTable.added_at))
      .limit(limit)
      .offset(offset);

    return [...new Map(results.map((item) => [item.track_id, item])).values()];
  },
  getRecentArtists: async (
    db: DB,
    { limit = 50, offset = 0 }: { limit?: number; offset?: number } = {}
  ) => {
    return db
      .select({
        artist_id: artistsTable.id,
        artist_name: artistsTable.name,
        artist_popularity: artistsTable.popularity,
        genres: sql<string[]>`array_agg(distinct ${genresTable.name})`.as(
          "genres"
        ),
        images: artistsTable.images,
        last_played: sql<Date>`max(${playHistoryTable.played_at})`.as(
          "last_played"
        ),
        play_count:
          sql<number>`count(distinct ${playHistoryTable.played_at})`.as(
            "play_count"
          ),
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
      .groupBy(
        artistsTable.id,
        artistsTable.name,
        artistsTable.popularity,
        artistsTable.images
      )
      .orderBy(desc(sql`max(${playHistoryTable.played_at})`))
      .limit(limit)
      .offset(offset);
  },
  getBasicLikedTracks: async (db: DB) => {
    return db
      .select({
        saved_id: savedTracksTable.id,
        track_id: savedTracksTable.track_id,
        added_at: savedTracksTable.added_at,
      })
      .from(savedTracksTable);
  },
};

export type SpotifyPlaylist = {
  playlist_id: string;
  playlist_name: string;
  description: string | null;
  images: any[];
  external_urls: Record<string, string>;
  track_count: number | null;
};

export type SpotifyTopTrack = Awaited<
  ReturnType<typeof spotifyDb.getPlayHistory>
>[number];

export type SpotifyTopArtist = Awaited<
  ReturnType<typeof spotifyDb.getTopArtists>
>[number];

export type SpotifyLikedTrack = Awaited<
  ReturnType<typeof spotifyDb.getLikedTracks>
>[number];

export type SpotifyPlayedTrack = Prettify<
  Awaited<ReturnType<typeof spotifyDb.getPlayHistory>>[number]
>;

export type SpotifyRecentArtist = Awaited<
  ReturnType<typeof spotifyDb.getRecentArtists>
>[number];
