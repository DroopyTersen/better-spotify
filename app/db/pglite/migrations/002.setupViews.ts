export const setupViewsSql = `
DROP VIEW IF EXISTS "public"."artist_history_view";
DROP VIEW IF EXISTS "public"."top_artists_view";
DROP VIEW IF EXISTS "public"."top_tracks_view";
DROP VIEW IF EXISTS "public"."track_history_view";

CREATE VIEW "public"."artist_history_view" AS (
  select 
    "artists"."id",
    "artists"."name" as artist_name,
    "artists"."popularity" as artist_popularity,
    "genres"."name" as genre_name,
    "play_history"."played_at",
    "artists"."images"
  from "play_history"
  left join "tracks" on "play_history"."track_id" = "tracks"."id"
  left join "artist_tracks" on "tracks"."id" = "artist_tracks"."track_id"
  left join "artists" on "artist_tracks"."artist_id" = "artists"."id"
  left join "artist_genres" on "artists"."id" = "artist_genres"."artist_id"
  left join "genres" on "artist_genres"."genre_id" = "genres"."id"
);

CREATE VIEW "public"."top_artists_view" AS (
  select 
    "top_artists"."position",
    "artists"."id",
    "artists"."name" as artist_name,
    "artists"."popularity" as artist_popularity,
    "genres"."name" as genre_name,
    "artists"."images"
  from "top_artists"
  left join "artists" on "top_artists"."artist_id" = "artists"."id"
  left join "artist_genres" on "artists"."id" = "artist_genres"."artist_id"
  left join "genres" on "artist_genres"."genre_id" = "genres"."id"
  order by "top_artists"."position"
);

CREATE VIEW "public"."top_tracks_view" AS (
  select 
    "top_tracks"."position",
    "tracks"."name" as track_name,
    "tracks"."popularity" as track_popularity,
    "tracks"."duration_ms",
    "tracks"."is_playable",
    "tracks"."id",
    "artists"."name" as artist_name,
    "artists"."popularity" as artist_popularity,
    "genres"."name" as genre_name,
    "albums"."release_date",
    "albums"."name" as album_name,
    "albums"."images"
  from "top_tracks"
  left join "tracks" on "top_tracks"."track_id" = "tracks"."id"
  left join "artist_tracks" on "tracks"."id" = "artist_tracks"."track_id"
  left join "artists" on "artist_tracks"."artist_id" = "artists"."id"
  left join "artist_genres" on "artists"."id" = "artist_genres"."artist_id"
  left join "genres" on "artist_genres"."genre_id" = "genres"."id"
  left join "albums" on "tracks"."album_id" = "albums"."id"
  order by "top_tracks"."position"
);

CREATE VIEW "public"."track_history_view" AS (
  select 
    "play_history"."played_at",
    "tracks"."name" as track_name,
    "tracks"."popularity" as track_popularity,
    "tracks"."duration_ms",
    "tracks"."is_playable",
    "tracks"."id",
    "artists"."name" as artist_name,
    "artists"."popularity" as artist_popularity,
    "genres"."name" as genre_name,
    "albums"."release_date",
    "albums"."name" as album_name,
    "albums"."images"
  from "play_history"
  left join "tracks" on "play_history"."track_id" = "tracks"."id"
  left join "artist_tracks" on "tracks"."id" = "artist_tracks"."track_id"
  left join "artists" on "artist_tracks"."artist_id" = "artists"."id"
  left join "artist_genres" on "artists"."id" = "artist_genres"."artist_id"
  left join "genres" on "artist_genres"."genre_id" = "genres"."id"
  left join "albums" on "tracks"."album_id" = "albums"."id"
);
`;
