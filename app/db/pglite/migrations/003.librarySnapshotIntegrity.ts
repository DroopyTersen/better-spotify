export const librarySnapshotIntegritySql = `
ALTER TABLE "playlist_tracks" ADD COLUMN IF NOT EXISTS "id" text;
ALTER TABLE "playlist_tracks" ADD COLUMN IF NOT EXISTS "position" integer;

WITH ranked AS (
  SELECT
    "playlist_id",
    "track_id",
    row_number() OVER (
      PARTITION BY "playlist_id"
      ORDER BY "added_at" NULLS LAST, "track_id"
    ) - 1 AS "position"
  FROM "playlist_tracks"
)
UPDATE "playlist_tracks" AS target
SET
  "position" = ranked."position",
  "id" = target."playlist_id" || ':' || ranked."position"
FROM ranked
WHERE target."playlist_id" = ranked."playlist_id"
  AND target."track_id" = ranked."track_id"
  AND (target."id" IS NULL OR target."position" IS NULL);

ALTER TABLE "playlist_tracks"
  DROP CONSTRAINT IF EXISTS "playlist_tracks_playlist_id_track_id_pk";
ALTER TABLE "playlist_tracks" ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE "playlist_tracks" ALTER COLUMN "playlist_id" SET NOT NULL;
ALTER TABLE "playlist_tracks" ALTER COLUMN "track_id" SET NOT NULL;
ALTER TABLE "playlist_tracks" ALTER COLUMN "position" SET NOT NULL;
ALTER TABLE "playlist_tracks" ALTER COLUMN "added_at" DROP NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'playlist_tracks'::regclass
      AND contype = 'p'
  ) THEN
    ALTER TABLE "playlist_tracks"
      ADD CONSTRAINT "playlist_tracks_id_pk" PRIMARY KEY("id");
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "playlist_tracks_playlist_position_unique"
  ON "playlist_tracks" ("playlist_id", "position");
`;
