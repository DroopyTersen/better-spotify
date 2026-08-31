export const preserveArtistOrderSql = `
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'artist_tracks'
      AND column_name = 'position'
  ) THEN
    ALTER TABLE "artist_tracks" ADD COLUMN "position" integer;

    -- Legacy rows never recorded Spotify's artist array order. Drop only the
    -- affected cached occurrences instead of inventing a primary collaborator;
    -- the schema-version marker forces a truthful full refresh.
    DELETE FROM "play_history";
    DELETE FROM "saved_tracks";
    DELETE FROM "top_tracks";
    DELETE FROM "artist_tracks";
  END IF;
END $$;

ALTER TABLE "artist_tracks" ALTER COLUMN "position" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "artist_tracks_track_position_unique"
  ON "artist_tracks" ("track_id", "position");
`;
