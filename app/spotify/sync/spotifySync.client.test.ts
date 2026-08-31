import { afterEach, describe, expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import type { AccountDatabase } from "~/db/db.client";
import { applyMigrations } from "~/db/db.client";
import * as schema from "~/db/db.schema";
import type { SpotifySdk } from "../createSpotifySdk";
import { createSpotifySyncCoordinator } from "./spotifySync.client";
import {
  isFullSyncComplete,
  markFullSyncComplete,
  runSyncTransaction,
  type SpotifySyncContext,
} from "./syncContext";
import { syncSpotifyData } from "./syncSpotifyData";
import { syncPlayHistory } from "./syncPlayHistory";
import { SpotifySyncStageError } from "./syncFailure";

const sdk = {} as SpotifySdk;

describe("account-keyed Spotify synchronization", () => {
  const databases: PGlite[] = [];
  afterEach(async () => {
    await Promise.all(databases.splice(0).map((database) => database.close()));
  });

  test("runs different accounts independently", async () => {
    const gates = new Map<string, ReturnType<typeof deferred>>();
    const started: string[] = [];
    const coordinator = createSpotifySyncCoordinator({
      full: async () => undefined,
      incremental: async (_sdk, context) => {
        started.push(context.accountId);
        const gate = deferred();
        gates.set(context.accountId, gate);
        await gate.promise;
      },
    });

    const accountA = fakeDatabase("account-a");
    const accountB = fakeDatabase("account-b");
    const syncA = coordinator.synchronize({
      accountId: "account-a",
      database: accountA,
      sdk,
      mode: "incremental",
    });
    const syncB = coordinator.synchronize({
      accountId: "account-b",
      database: accountB,
      sdk,
      mode: "incremental",
    });

    expect(started).toEqual(["account-a", "account-b"]);
    gates.get("account-a")?.resolve();
    gates.get("account-b")?.resolve();
    await Promise.all([syncA, syncB]);
  });

  test("queues a full request behind an in-flight incremental request", async () => {
    const incrementalGate = deferred();
    const events: string[] = [];
    const coordinator = createSpotifySyncCoordinator({
      full: async () => {
        events.push("full");
      },
      incremental: async () => {
        events.push("incremental:start");
        await incrementalGate.promise;
        events.push("incremental:end");
      },
    });
    const database = fakeDatabase("account-a");
    const incremental = coordinator.synchronize({
      accountId: "account-a",
      database,
      sdk,
      mode: "incremental",
    });
    const full = coordinator.synchronize({
      accountId: "account-a",
      database,
      sdk,
      mode: "full",
    });

    expect(full).toBe(incremental);
    expect(events).toEqual(["incremental:start"]);
    incrementalGate.resolve();
    await full;
    expect(events).toEqual(["incremental:start", "incremental:end", "full"]);
  });

  test("cancels stale account work before its transaction can commit", async () => {
    const pg = new PGlite();
    databases.push(pg);
    await applyMigrations(pg);
    const database: AccountDatabase = {
      accountId: "account-a",
      pg,
      db: drizzle({ client: pg, schema }),
    };
    const gate = deferred();
    const coordinator = createSpotifySyncCoordinator({
      full: async () => undefined,
      incremental: async (_sdk, context) => {
        await gate.promise;
        await runSyncTransaction(context, async (transaction) => {
          await transaction
            .insert(schema.tracksTable)
            .values({ id: "stale-track", name: "Stale" });
        });
      },
    });

    const synchronization = coordinator.synchronize({
      accountId: "account-a",
      database,
      sdk,
      mode: "incremental",
    });
    coordinator.cancel("account-a");
    gate.resolve();

    await expect(synchronization).rejects.toMatchObject({ name: "AbortError" });
    expect(await database.db.$count(schema.tracksTable)).toBe(0);
  });

  test("rejects an account/database mismatch", async () => {
    const coordinator = createSpotifySyncCoordinator({
      full: async () => undefined,
      incremental: async () => undefined,
    });
    await expect(
      coordinator.synchronize({
        accountId: "account-b",
        database: fakeDatabase("account-a"),
        sdk,
        mode: "full",
      })
    ).rejects.toThrow("does not match");
  });

  test("publishes a full refresh atomically and preserves the prior generation on failure", async () => {
    const pg = new PGlite();
    databases.push(pg);
    await applyMigrations(pg);
    const database: AccountDatabase = {
      accountId: "account-a",
      pg,
      db: drizzle({ client: pg, schema }),
    };
    const controller = new AbortController();
    const context: SpotifySyncContext = {
      accountId: "account-a",
      database,
      signal: controller.signal,
      isCurrent: () => true,
    };
    await runSyncTransaction(context, async (transaction) => {
      await transaction
        .insert(schema.tracksTable)
        .values({ id: "complete-track", name: "Complete" });
      await transaction
        .insert(schema.topTracksTable)
        .values({ id: "long_term:1", track_id: "complete-track", position: 1 });
    });
    await markFullSyncComplete(context);
    const failedRefresh = await syncSpotifyData(sdk, context, [
        async (_sdk, transactionContext) => {
          expect(
            await isFullSyncComplete(transactionContext.database)
          ).toBe(false);
          await runSyncTransaction(transactionContext, async (transaction) => {
            await transaction.delete(schema.tracksTable);
            await transaction
              .insert(schema.tracksTable)
              .values({ id: "partial-track", name: "Partial" });
          });
        },
        async () => {
          throw new Error("provider failed midway");
        },
      ]).catch((error) => error);
    expect(failedRefresh).toBeInstanceOf(SpotifySyncStageError);
    expect((failedRefresh as SpotifySyncStageError).cause).toEqual(
      new Error("provider failed midway")
    );
    expect(await isFullSyncComplete(database)).toBe(true);
    expect(
      await database.db
        .select({ trackId: schema.topTracksTable.track_id })
        .from(schema.topTracksTable)
    ).toEqual([{ trackId: "complete-track" }]);

    await syncSpotifyData(sdk, context, [
      async (_sdk, transactionContext) => {
        await runSyncTransaction(transactionContext, async (transaction) => {
          await transaction.delete(schema.tracksTable);
          await transaction
            .insert(schema.tracksTable)
            .values({ id: "replacement-track", name: "Replacement" });
          await transaction.insert(schema.topTracksTable).values({
            id: "long_term:1",
            track_id: "replacement-track",
            position: 1,
          });
        });
      },
    ]);
    expect(await isFullSyncComplete(database)).toBe(true);
    expect(
      await database.db
        .select({ trackId: schema.topTracksTable.track_id })
        .from(schema.topTracksTable)
    ).toEqual([{ trackId: "replacement-track" }]);
  });

  test("an interrupted first full refresh remains unpublished and incomplete", async () => {
    const pg = new PGlite();
    databases.push(pg);
    await applyMigrations(pg);
    const database: AccountDatabase = {
      accountId: "account-a",
      pg,
      db: drizzle({ client: pg, schema }),
    };
    const controller = new AbortController();
    const context: SpotifySyncContext = {
      accountId: "account-a",
      database,
      signal: controller.signal,
      isCurrent: () => true,
    };

    const failedInitialRefresh = await syncSpotifyData(sdk, context, [
        async (_sdk, transactionContext) => {
          await runSyncTransaction(transactionContext, async (transaction) => {
            await transaction
              .insert(schema.tracksTable)
              .values({ id: "partial-track", name: "Partial" });
          });
        },
        async () => {
          throw new Error("provider failed midway");
        },
      ]).catch((error) => error);
    expect(failedInitialRefresh).toBeInstanceOf(SpotifySyncStageError);
    expect((failedInitialRefresh as SpotifySyncStageError).cause).toEqual(
      new Error("provider failed midway")
    );

    expect(await isFullSyncComplete(database)).toBe(false);
    expect(await database.db.$count(schema.tracksTable)).toBe(0);
  });

  test("keeps the live account database readable while provider staging is pending", async () => {
    const pg = new PGlite();
    databases.push(pg);
    await applyMigrations(pg);
    const database: AccountDatabase = {
      accountId: "account-a",
      pg,
      db: drizzle({ client: pg, schema }),
    };
    await database.db
      .insert(schema.tracksTable)
      .values({ id: "visible-track", name: "Visible" });
    const stageStarted = deferred();
    const providerGate = deferred();
    const context: SpotifySyncContext = {
      accountId: "account-a",
      database,
      signal: new AbortController().signal,
      isCurrent: () => true,
    };

    const synchronization = syncSpotifyData(sdk, context, [async () => {
      stageStarted.resolve();
      await providerGate.promise;
      throw new Error("provider unavailable");
    }]);
    await stageStarted.promise;

    expect(
      await resolvesWithin(database.db.$count(schema.tracksTable), 1_000)
    ).toBe(1);
    providerGate.resolve();
    const failure = await synchronization.catch((error) => error);
    expect(failure).toBeInstanceOf(SpotifySyncStageError);
    expect((failure as SpotifySyncStageError).cause).toEqual(
      new Error("provider unavailable")
    );
  });

  test("publishes and resumes a full-sync play-history continuation", async () => {
    const pg = new PGlite();
    databases.push(pg);
    await applyMigrations(pg);
    const database: AccountDatabase = {
      accountId: "account-a",
      pg,
      db: drizzle({ client: pg, schema }),
    };
    const context: SpotifySyncContext = {
      accountId: "account-a",
      database,
      signal: new AbortController().signal,
      isCurrent: () => true,
    };
    const requestPaths: string[] = [];
    let pageIndex = 0;
    const historySdk = {
      makeRequest(_method: string, path: string) {
        requestPaths.push(path);
        const currentPage = pageIndex;
        pageIndex += 1;
        const itemCount = currentPage < 10 ? 50 : 2;
        const items = Array.from({ length: itemCount }, (_, itemIndex) =>
          playedTrack(currentPage * 50 + itemIndex)
        );
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

    await syncSpotifyData(historySdk, context, [syncPlayHistory]);

    expect(await database.db.$count(schema.playHistoryTable)).toBe(500);
    expect(
      await database.db.query.libraryMetadataTable.findFirst({
        where: (metadata, { eq }) =>
          eq(metadata.key, "play_history_continuation_before"),
      })
    ).toMatchObject({ value: "10" });

    const finalWindow = await syncPlayHistory(historySdk, context);
    expect(finalWindow).toEqual({ inserted: 2, hasMore: false });
    expect(await database.db.$count(schema.playHistoryTable)).toBe(502);
    expect(requestPaths[10]).toBe(
      "me/player/recently-played?limit=50&before=10"
    );
    expect(
      await database.db.query.libraryMetadataTable.findFirst({
        where: (metadata, { eq }) =>
          eq(metadata.key, "play_history_continuation_before"),
      })
    ).toBeUndefined();
  });
});

function fakeDatabase(accountId: string): AccountDatabase {
  return { accountId } as AccountDatabase;
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function resolvesWithin<Value>(promise: Promise<Value>, timeoutMs: number) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error("live database read timed out")),
      timeoutMs
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function playedTrack(sequence: number) {
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
}
