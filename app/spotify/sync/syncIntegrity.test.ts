import { afterEach, describe, expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { applyMigrations } from "~/db/db.client";
import * as schema from "~/db/db.schema";
import { librarySnapshotIntegritySql } from "~/db/pglite/migrations/003.librarySnapshotIntegrity";
import { preserveArtistOrderSql } from "~/db/pglite/migrations/004.preserveArtistOrder";
import { spotifyDb } from "~/spotify/spotify.db";
import type { SpotifySdk } from "~/spotify/createSpotifySdk";
import { collectOffsetPages, processOffsetPages } from "./pagination";
import {
  MAX_ARTIST_ENRICHMENTS_PER_SYNC,
  syncFullArtistData,
} from "./syncFullArtistData";
import { syncPlayHistory } from "./syncPlayHistory";
import { syncSavedTracks } from "./syncSavedTracks";
import type { SpotifySyncContext } from "./syncContext";
import { writeTrackGraph } from "./syncDb";
import {
  normalizePlayHistoryItem,
  normalizePlaylistOccurrences,
  normalizeTrackGraph,
  uniqueNonEmptyIds,
} from "./syncRecords";

describe("offset pagination", () => {
  test("loads every raw page with monotonically increasing offsets", async () => {
    const requestedOffsets: number[] = [];
    const items = await collectOffsetPages({
      maxItems: 10,
      pageSize: 2,
      async fetchPage(limit, offset) {
        requestedOffsets.push(offset);
        return offset === 0
          ? { items: ["one", "two"], limit, offset, total: 3, next: "next" }
          : { items: ["three"], limit, offset, total: 3, next: null };
      },
    });

    expect(items).toEqual(["one", "two", "three"]);
    expect(requestedOffsets).toEqual([0, 2]);
  });

  test("fails closed on incomplete, stalled, or oversized snapshots", async () => {
    await expect(
      collectOffsetPages({
        maxItems: 10,
        fetchPage: async () => ({
          items: ["one"],
          limit: 50,
          offset: 0,
          total: 2,
          next: null,
        }),
      })
    ).rejects.toThrow("ended before");

    await expect(
      collectOffsetPages({
        maxItems: 10,
        fetchPage: async () => ({
          items: [],
          limit: 50,
          offset: 0,
          total: 1,
          next: "next",
        }),
      })
    ).rejects.toThrow("stalled");

    await expect(
      collectOffsetPages({
        maxItems: 10,
        fetchPage: async () => ({
          items: [],
          limit: 50,
          offset: 0,
          total: 11,
          next: "next",
        }),
      })
    ).rejects.toThrow(RangeError);
  });

  test("fails closed when a provider total changes between pages", async () => {
    const pages = [
      { items: ["one", "two"], limit: 2, offset: 0, total: 4, next: "next" },
      { items: ["three"], limit: 2, offset: 2, total: 3, next: null },
    ];

    await expect(
      collectOffsetPages({
        maxItems: 10,
        pageSize: 2,
        fetchPage: async () => pages.shift()!,
      })
    ).rejects.toThrow("total changed");
  });

  test("fails closed when a page exceeds its request or reported total", async () => {
    await expect(
      collectOffsetPages({
        maxItems: 10,
        pageSize: 1,
        fetchPage: async () => ({
          items: ["one", "two"],
          limit: 1,
          offset: 0,
          total: 2,
          next: null,
        }),
      })
    ).rejects.toThrow("more items than requested");

    await expect(
      collectOffsetPages({
        maxItems: 10,
        pageSize: 2,
        fetchPage: async () => ({
          items: ["one", "two"],
          limit: 2,
          offset: 0,
          total: 1,
          next: null,
        }),
      })
    ).rejects.toThrow("exceeded its reported total");
  });

  test("streams a saved-library-sized total above 10,000 without retaining pages", async () => {
    const total = 10_001;
    let processedItems = 0;
    let largestRetainedPage = 0;

    const result = await processOffsetPages({
      maxRequests: 5_000,
      async fetchPage(limit, offset) {
        const count = Math.min(limit, total - offset);
        const items = Array.from({ length: count }, (_, index) => offset + index);
        return {
          items,
          limit,
          offset,
          total,
          next: offset + count < total ? "next" : null,
        };
      },
      processPage(items) {
        largestRetainedPage = Math.max(largestRetainedPage, items.length);
        processedItems += items.length;
      },
    });

    expect(result).toEqual({ items: total, requests: 201 });
    expect(processedItems).toBe(total);
    expect(largestRetainedPage).toBe(50);
  });

  test("fails explicitly at the streaming request circuit breaker", async () => {
    await expect(
      processOffsetPages({
        maxRequests: 2,
        pageSize: 1,
        fetchPage: async (_limit, offset) => ({
          items: [offset],
          limit: 1,
          offset,
          total: 3,
          next: "next",
        }),
        processPage: () => undefined,
      })
    ).rejects.toThrow("2-request safety limit");
  });
});

describe("Spotify 2026 snapshot normalization", () => {
  const track = {
    id: "track-1",
    name: "Track",
    album: {
      id: "album-1",
      name: "Album",
      images: [{ url: "https://image", height: null, width: null }],
      artists: [{ id: "artist-1", name: "Artist" }],
    },
    artists: [{ id: "artist-1", name: "Artist" }],
  };

  test("maps removed optional fields to nullable cache columns", () => {
    const graph = normalizeTrackGraph([track, track]);

    expect(graph.tracks).toHaveLength(1);
    expect(graph.tracks[0]).toMatchObject({
      id: "track-1",
      album_id: "album-1",
      popularity: null,
      preview_url: null,
    });
    expect(graph.albums[0]).toMatchObject({
      id: "album-1",
      label: null,
      popularity: null,
    });
    expect(graph.artists[0]).toMatchObject({
      id: "artist-1",
      followers: null,
      popularity: null,
    });
    expect(graph.artistTracks).toHaveLength(1);
  });

  test("preserves repeated playlist tracks as distinct ordered occurrences", () => {
    const occurrences = normalizePlaylistOccurrences({
      id: "playlist-1",
      tracks: {
        items: [
          { track, added_at: null, added_by: null },
          { track, added_at: "2026-08-30T12:00:00.000Z", added_by: null },
        ],
      },
    });

    expect(occurrences.map(({ id, position, track_id }) => ({
      id,
      position,
      track_id,
    }))).toEqual([
      { id: "playlist-1:0", position: 0, track_id: "track-1" },
      { id: "playlist-1:1", position: 1, track_id: "track-1" },
    ]);
    expect(occurrences[0]?.added_at).toBeNull();
  });

  test("uses stable play IDs and deduplicates requested entity IDs", () => {
    const play = normalizePlayHistoryItem({
      track,
      played_at: "2026-08-30T12:00:00.000Z",
      context: null,
    });

    expect(play?.row.id).toBe("2026-08-30T12:00:00.000Z:track-1");
    expect(play?.row.context_uri).toBeNull();
    expect(uniqueNonEmptyIds([" one ", "one", "", "two"])).toEqual([
      "one",
      "two",
    ]);
  });

  test("preserves Spotify artist order in normalized track relations", () => {
    const collaboration = {
      ...track,
      artists: [
        { id: "z-primary", name: "Primary" },
        { id: "a-featured", name: "Featured" },
      ],
    };

    expect(normalizeTrackGraph([collaboration]).artistTracks).toEqual([
      { track_id: "track-1", artist_id: "z-primary", position: 0 },
      { track_id: "track-1", artist_id: "a-featured", position: 1 },
    ]);
  });
});

describe("PGlite integrity", () => {
  const databases: PGlite[] = [];
  afterEach(async () => {
    await Promise.all(databases.splice(0).map((db) => db.close()));
  });

  test("upgrades the old composite key and permits repeated tracks", async () => {
    const pg = new PGlite();
    databases.push(pg);
    await pg.exec(`
      CREATE TABLE playlist_tracks (
        playlist_id text,
        track_id text,
        added_at timestamp with time zone NOT NULL,
        added_by jsonb,
        CONSTRAINT playlist_tracks_playlist_id_track_id_pk
          PRIMARY KEY (playlist_id, track_id)
      );
      INSERT INTO playlist_tracks (playlist_id, track_id, added_at)
      VALUES ('playlist-1', 'track-1', '2026-08-30T12:00:00.000Z');
    `);

    await pg.exec(librarySnapshotIntegritySql);
    await pg.exec(librarySnapshotIntegritySql);
    await pg.exec(`
      INSERT INTO playlist_tracks (
        id, playlist_id, track_id, position, added_at
      ) VALUES ('playlist-1:1', 'playlist-1', 'track-1', 1, NULL);
    `);

    const result = await pg.query<{
      id: string;
      position: number;
      track_id: string;
    }>(`
      SELECT id, position, track_id
      FROM playlist_tracks
      ORDER BY position
    `);
    expect(result.rows).toEqual([
      { id: "playlist-1:0", position: 0, track_id: "track-1" },
      { id: "playlist-1:1", position: 1, track_id: "track-1" },
    ]);
  });

  test("drops legacy occurrences whose primary artist order cannot be recovered", async () => {
    const pg = new PGlite();
    databases.push(pg);
    await pg.exec(`
      CREATE TABLE artist_tracks (track_id text, artist_id text);
      CREATE TABLE play_history (id text);
      CREATE TABLE saved_tracks (id text);
      CREATE TABLE top_tracks (id text);
      INSERT INTO artist_tracks VALUES ('track-1', 'featured-artist');
      INSERT INTO play_history VALUES ('play-1');
      INSERT INTO saved_tracks VALUES ('saved-1');
      INSERT INTO top_tracks VALUES ('ranking-1');
    `);

    await pg.exec(preserveArtistOrderSql);
    await pg.exec(preserveArtistOrderSql);

    expect((await pg.query(`SELECT * FROM artist_tracks`)).rows).toEqual([]);
    expect((await pg.query(`SELECT * FROM play_history`)).rows).toEqual([]);
    expect((await pg.query(`SELECT * FROM saved_tracks`)).rows).toEqual([]);
    expect((await pg.query(`SELECT * FROM top_tracks`)).rows).toEqual([]);
  });

  test("persists album relationships and rolls back partial graph writes", async () => {
    const pg = new PGlite();
    databases.push(pg);
    await applyMigrations(pg);
    const db = drizzle({ client: pg, schema });
    const sourceTrack = {
      id: "track-1",
      name: "Track",
      album: { id: "album-1", name: "Album", artists: [] },
      artists: [],
    };

    await db.transaction((tx) =>
      writeTrackGraph(tx, normalizeTrackGraph([sourceTrack]))
    );
    expect(
      (await db.query.tracksTable.findFirst({
        where: (tracks, { eq }) => eq(tracks.id, "track-1"),
      }))?.album_id
    ).toBe("album-1");

    await expect(
      db.transaction(async (tx) => {
        await writeTrackGraph(
          tx,
          normalizeTrackGraph([{ ...sourceTrack, id: "track-2" }])
        );
        throw new Error("force rollback");
      })
    ).rejects.toThrow("force rollback");
    expect(
      await db.query.tracksTable.findFirst({
        where: (tracks, { eq }) => eq(tracks.id, "track-2"),
      })
    ).toBeUndefined();
  });

  test("rolls back streamed saved-track pages when a later page fails", async () => {
    const pg = new PGlite();
    databases.push(pg);
    await applyMigrations(pg);
    const db = drizzle({ client: pg, schema });
    const database = { accountId: "account-a", pg, db };
    const context: SpotifySyncContext = {
      accountId: "account-a",
      database,
      signal: new AbortController().signal,
      isCurrent: () => true,
    };
    const previousTrack = {
      id: "previous-track",
      name: "Previous",
      album: { id: "previous-album", name: "Previous", artists: [] },
      artists: [],
    };
    await db.transaction(async (tx) => {
      await writeTrackGraph(tx, normalizeTrackGraph([previousTrack]));
      await tx.insert(schema.savedTracksTable).values({
        id: "previous-track",
        track_id: "previous-track",
        added_at: new Date("2026-08-29T00:00:00.000Z"),
      });
    });

    const replacementTrack = {
      id: "replacement-track",
      name: "Replacement",
      album: { id: "replacement-album", name: "Replacement", artists: [] },
      artists: [],
    };
    const savedTracksSdk = {
      currentUser: {
        tracks: {
          savedTracks(_limit: number, offset: number) {
            if (offset > 0) return Promise.reject(new Error("provider failed"));
            return Promise.resolve({
              items: [
                {
                  added_at: "2026-08-30T00:00:00.000Z",
                  track: replacementTrack,
                },
              ],
              limit: 50,
              offset: 0,
              total: 2,
              next: "next",
            });
          },
        },
      },
    } as unknown as SpotifySdk;

    await expect(syncSavedTracks(savedTracksSdk, context)).rejects.toThrow(
      "provider failed"
    );
    expect(
      await db
        .select({ id: schema.savedTracksTable.id })
        .from(schema.savedTracksTable)
    ).toEqual([{ id: "previous-track" }]);
    expect(
      await db.query.tracksTable.findFirst({
        where: (tracks, { eq }) => eq(tracks.id, "replacement-track"),
      })
    ).toBeUndefined();
  });

  test("invalidates full-sync completeness when the schema version changes", async () => {
    const pg = new PGlite();
    databases.push(pg);
    await applyMigrations(pg);
    await pg.query(
      `INSERT INTO library_metadata (key, value) VALUES ($1, $2)`,
      ["full_sync_version", "1"]
    );
    await pg.query(
      `INSERT INTO library_metadata (key, value) VALUES ($1, $2)`,
      ["play_history_continuation_before", "123"]
    );
    await pg.query(
      `UPDATE library_metadata SET value = $1 WHERE key = $2`,
      ["outdated-schema", "schema_version"]
    );

    await applyMigrations(pg);

    const marker = await pg.query<{ value: string }>(
      `SELECT value FROM library_metadata WHERE key = $1`,
      ["full_sync_version"]
    );
    expect(marker.rows).toEqual([]);
    const continuation = await pg.query<{ value: string }>(
      `SELECT value FROM library_metadata WHERE key = $1`,
      ["play_history_continuation_before"]
    );
    expect(continuation.rows).toEqual([]);
  });

  test("bounds artist enrichment and keeps individual provider failures best effort", async () => {
    const pg = new PGlite();
    databases.push(pg);
    await applyMigrations(pg);
    const db = drizzle({ client: pg, schema });
    const database = { accountId: "account-a", pg, db };
    const context: SpotifySyncContext = {
      accountId: "account-a",
      database,
      signal: new AbortController().signal,
      isCurrent: () => true,
    };
    await db.insert(schema.artistsTable).values(
      Array.from({ length: 30 }, (_, index) => ({
        id: `artist-${String(index).padStart(2, "0")}`,
        name: `Artist ${index}`,
        images: null,
      }))
    );
    const requestedArtists: string[] = [];
    const sdk = {
      makeRequest(_method: string, path: string) {
        const id = path.slice("artists/".length);
        requestedArtists.push(id);
        if (id === "artist-03") {
          return Promise.reject(new Error("transient provider failure"));
        }
        return Promise.resolve({
          id,
          name: id,
          images: [{ url: `https://images/${id}`, height: 64, width: 64 }],
        });
      },
    } as unknown as SpotifySdk;

    await expect(syncFullArtistData(sdk, context)).resolves.toEqual({
      attempted: MAX_ARTIST_ENRICHMENTS_PER_SYNC,
      synchronized: MAX_ARTIST_ENRICHMENTS_PER_SYNC - 1,
      failed: 1,
    });
    expect(requestedArtists).toHaveLength(MAX_ARTIST_ENRICHMENTS_PER_SYNC);
    const cachedArtists = await db.query.artistsTable.findMany({
      columns: { id: true, images: true },
    });
    expect(cachedArtists.filter(({ images }) => images !== null)).toHaveLength(
      MAX_ARTIST_ENRICHMENTS_PER_SYNC - 1
    );
    expect(cachedArtists.filter(({ images }) => images === null)).toHaveLength(6);
  });

  test("preserves repeated track rankings and play occurrences in read models", async () => {
    const pg = new PGlite();
    databases.push(pg);
    await applyMigrations(pg);
    const db = drizzle({ client: pg, schema });
    const sourceTrack = {
      id: "track-1",
      name: "Track",
      album: { id: "album-1", name: "Album", artists: [] },
      artists: [],
    };

    await db.transaction(async (tx) => {
      await writeTrackGraph(tx, normalizeTrackGraph([sourceTrack]));
      await tx.insert(schema.topTracksTable).values([
        { id: "long_term:1", track_id: "track-1", position: 1 },
        { id: "long_term:2", track_id: "track-1", position: 2 },
      ]);
      await tx.insert(schema.playHistoryTable).values([
        {
          id: "play-1",
          track_id: "track-1",
          played_at: new Date("2026-08-30T12:00:00.000Z"),
        },
        {
          id: "play-2",
          track_id: "track-1",
          played_at: new Date("2026-08-30T12:01:00.000Z"),
        },
      ]);
    });

    expect(
      (await spotifyDb.getTopTracks(db)).map(({ ranking_id }) => ranking_id)
    ).toEqual(["long_term:1", "long_term:2"]);
    expect(
      (await spotifyDb.getPlayHistory(db)).map(({ play_id }) => play_id)
    ).toEqual(["play-2", "play-1"]);
  });

  test("uses Spotify's first artist across ranked, liked, played, and ID reads", async () => {
    const pg = new PGlite();
    databases.push(pg);
    await applyMigrations(pg);
    const db = drizzle({ client: pg, schema });
    const collaboration = {
      id: "track-1",
      name: "Collaboration",
      album: { id: "album-1", name: "Album", artists: [] },
      artists: [
        { id: "z-primary", name: "Primary" },
        { id: "a-featured", name: "Featured" },
      ],
    };

    await db.transaction(async (tx) => {
      await writeTrackGraph(tx, normalizeTrackGraph([collaboration]));
      await tx.insert(schema.topTracksTable).values({
        id: "long_term:1",
        track_id: "track-1",
        position: 1,
      });
      await tx.insert(schema.savedTracksTable).values({
        id: "track-1",
        track_id: "track-1",
        added_at: new Date("2026-08-30T12:00:00.000Z"),
      });
      await tx.insert(schema.playHistoryTable).values({
        id: "play-1",
        track_id: "track-1",
        played_at: new Date("2026-08-30T12:01:00.000Z"),
      });
    });

    const [ranked] = await spotifyDb.getTopTracks(db);
    const [liked] = await spotifyDb.getLikedTracks(db);
    const [played] = await spotifyDb.getPlayHistory(db);
    const [byId] = await spotifyDb.getTracksByIds(db, ["track-1"]);

    expect([ranked.artist_id, liked.artist_id, played.artist_id, byId.artist_id])
      .toEqual(["z-primary", "z-primary", "z-primary", "z-primary"]);
  });

  test("commits a greater-than-500 play-history gap in resumable windows", async () => {
    const pg = new PGlite();
    databases.push(pg);
    await applyMigrations(pg);
    const db = drizzle({ client: pg, schema });
    const database = { accountId: "account-a", pg, db };
    const context: SpotifySyncContext = {
      accountId: "account-a",
      database,
      signal: new AbortController().signal,
      isCurrent: () => true,
    };
    const oldTrack = {
      id: "old-track",
      name: "Old",
      album: { id: "old-album", name: "Old", artists: [] },
      artists: [],
    };
    await db.transaction(async (tx) => {
      await writeTrackGraph(tx, normalizeTrackGraph([oldTrack]));
      await tx.insert(schema.playHistoryTable).values({
        id: "old-play",
        track_id: "old-track",
        played_at: new Date("2026-08-29T00:00:00.000Z"),
      });
    });

    const requestPaths: string[] = [];
    let pageIndex = 0;
    const sdk = {
      makeRequest(_method: string, path: string) {
        requestPaths.push(path);
        const currentPage = pageIndex;
        pageIndex += 1;
        const itemCount = currentPage < 10 ? 50 : 2;
        const items = Array.from({ length: itemCount }, (_, itemIndex) => {
          const sequence = currentPage * 50 + itemIndex;
          const artist = { id: "artist-1", name: "Artist" };
          return {
            played_at: new Date(
              Date.UTC(2026, 7, 30, 0, 0, sequence)
            ).toISOString(),
            context: null,
            track: {
              id: `track-${sequence}`,
              name: `Track ${sequence}`,
              album: {
                id: `album-${sequence}`,
                name: `Album ${sequence}`,
                artists: [artist],
              },
              artists: [artist],
            },
          };
        });
        return Promise.resolve({
          href: "",
          items,
          limit: 50,
          next:
            currentPage < 10
              ? `https://api.spotify.com/v1/me/player/recently-played?limit=50&before=${currentPage + 1}`
              : null,
          total: items.length,
        });
      },
    } as unknown as SpotifySdk;

    const firstWindow = await syncPlayHistory(sdk, context);
    expect(firstWindow).toEqual({ inserted: 500, hasMore: true });
    expect(await db.$count(schema.playHistoryTable)).toBe(501);
    expect(
      await db.query.libraryMetadataTable.findFirst({
        where: (metadata, { eq }) =>
          eq(metadata.key, "play_history_continuation_before"),
      })
    ).toMatchObject({ value: "10" });

    const finalWindow = await syncPlayHistory(sdk, context);
    expect(finalWindow).toEqual({ inserted: 2, hasMore: false });
    expect(await db.$count(schema.playHistoryTable)).toBe(503);
    expect(requestPaths[10]).toBe(
      "me/player/recently-played?limit=50&before=10"
    );
    expect(
      await db.query.libraryMetadataTable.findFirst({
        where: (metadata, { eq }) =>
          eq(metadata.key, "play_history_continuation_before"),
      })
    ).toBeUndefined();
  });
});
