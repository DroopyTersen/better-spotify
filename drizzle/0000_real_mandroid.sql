CREATE TABLE IF NOT EXISTS "album_artists" (
	"album_id" text,
	"artist_id" text,
	CONSTRAINT "album_artists_album_id_artist_id_pk" PRIMARY KEY("album_id","artist_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "albums" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"album_type" text,
	"total_tracks" integer,
	"release_date" text,
	"release_date_precision" text,
	"external_url" text,
	"href" text,
	"uri" text,
	"label" text,
	"popularity" integer,
	"images" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "artist_genres" (
	"artist_id" text,
	"genre_id" text,
	CONSTRAINT "artist_genres_artist_id_genre_id_pk" PRIMARY KEY("artist_id","genre_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "artist_tracks" (
	"track_id" text,
	"artist_id" text,
	CONSTRAINT "artist_tracks_track_id_artist_id_pk" PRIMARY KEY("track_id","artist_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "artists" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"external_url" text,
	"href" text,
	"uri" text,
	"popularity" integer,
	"images" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "genres" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "genres_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "play_history" (
	"id" text PRIMARY KEY NOT NULL,
	"track_id" text,
	"played_at" timestamp with time zone NOT NULL,
	"context_type" text,
	"context_href" text,
	"context_uri" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "top_artists" (
	"id" text PRIMARY KEY NOT NULL,
	"artist_id" text,
	"position" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "top_tracks" (
	"id" text PRIMARY KEY NOT NULL,
	"track_id" text,
	"position" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tracks" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"album_id" text,
	"disc_number" integer,
	"duration_ms" integer,
	"explicit" boolean,
	"external_url" text,
	"href" text,
	"uri" text,
	"is_playable" boolean,
	"popularity" integer,
	"preview_url" text,
	"track_number" integer
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "album_artists" ADD CONSTRAINT "album_artists_album_id_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."albums"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "album_artists" ADD CONSTRAINT "album_artists_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "artist_genres" ADD CONSTRAINT "artist_genres_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "artist_genres" ADD CONSTRAINT "artist_genres_genre_id_genres_id_fk" FOREIGN KEY ("genre_id") REFERENCES "public"."genres"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "artist_tracks" ADD CONSTRAINT "artist_tracks_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "artist_tracks" ADD CONSTRAINT "artist_tracks_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "play_history" ADD CONSTRAINT "play_history_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "top_artists" ADD CONSTRAINT "top_artists_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "top_tracks" ADD CONSTRAINT "top_tracks_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tracks" ADD CONSTRAINT "tracks_album_id_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."albums"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE VIEW "public"."artist_history_view" AS (select "artists"."id", "artists"."name", "artists"."popularity", "genres"."name", "play_history"."played_at", "artists"."images" from "play_history" left join "tracks" on "play_history"."track_id" = "tracks"."id" left join "artist_tracks" on "tracks"."id" = "artist_tracks"."track_id" left join "artists" on "artist_tracks"."artist_id" = "artists"."id" left join "artist_genres" on "artists"."id" = "artist_genres"."artist_id" left join "genres" on "artist_genres"."genre_id" = "genres"."id");--> statement-breakpoint
CREATE VIEW "public"."top_artists_view" AS (select "top_artists"."position", "artists"."id", "artists"."name", "artists"."popularity", "genres"."name", "artists"."images" from "top_artists" left join "artists" on "top_artists"."artist_id" = "artists"."id" left join "artist_genres" on "artists"."id" = "artist_genres"."artist_id" left join "genres" on "artist_genres"."genre_id" = "genres"."id" order by "top_artists"."position");--> statement-breakpoint
CREATE VIEW "public"."top_tracks_view" AS (select "top_tracks"."position", "tracks"."name", "tracks"."popularity", "tracks"."duration_ms", "tracks"."is_playable", "tracks"."id", "artists"."name", "artists"."popularity", "genres"."name", "albums"."release_date", "albums"."name", "albums"."images" from "top_tracks" left join "tracks" on "top_tracks"."track_id" = "tracks"."id" left join "artist_tracks" on "tracks"."id" = "artist_tracks"."track_id" left join "artists" on "artist_tracks"."artist_id" = "artists"."id" left join "artist_genres" on "artists"."id" = "artist_genres"."artist_id" left join "genres" on "artist_genres"."genre_id" = "genres"."id" left join "albums" on "tracks"."album_id" = "albums"."id" order by "top_tracks"."position");--> statement-breakpoint
CREATE VIEW "public"."track_history_view" AS (select "play_history"."played_at", "tracks"."name", "tracks"."popularity", "tracks"."duration_ms", "tracks"."is_playable", "tracks"."id", "artists"."name", "artists"."popularity", "genres"."name", "albums"."release_date", "albums"."name", "albums"."images" from "play_history" left join "tracks" on "play_history"."track_id" = "tracks"."id" left join "artist_tracks" on "tracks"."id" = "artist_tracks"."track_id" left join "artists" on "artist_tracks"."artist_id" = "artists"."id" left join "artist_genres" on "artists"."id" = "artist_genres"."artist_id" left join "genres" on "artist_genres"."genre_id" = "genres"."id" left join "albums" on "tracks"."album_id" = "albums"."id");