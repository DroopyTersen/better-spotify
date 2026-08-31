import { describe, expect, test } from "bun:test";
import type { AccountDatabase } from "~/db/db.client";
import {
  loadAccountLibrarySnapshot,
  withOptionalLibraryDeadline,
} from "./librarySnapshot.client";

describe("optional local library", () => {
  test("degrades to empty data when PGlite initialization fails", async () => {
    const result = await loadAccountLibrarySnapshot("account-a", {
      initialize: async () => {
        throw new Error("IndexedDB unavailable");
      },
      read: async () => {
        throw new Error("must not read");
      },
      isComplete: async () => false,
    });

    expect(result).toMatchObject({
      libraryAvailable: false,
      needsInitialSync: false,
      topTracks: [],
      playHistory: [],
    });
  });

  test("degrades when an initialized database query fails", async () => {
    const database = { accountId: "account-a" } as AccountDatabase;
    const result = await loadAccountLibrarySnapshot("account-a", {
      initialize: async () => database,
      read: async () => {
        throw new Error("query failed");
      },
      isComplete: async () => true,
    });

    expect(result.libraryAvailable).toBe(false);
    expect(result.likedTracks).toEqual([]);
  });

  test("degrades promptly when PGlite initialization never settles", async () => {
    const startedAt = performance.now();
    const result = await loadAccountLibrarySnapshot(
      "account-a",
      {
        initialize: () => new Promise<AccountDatabase>(() => undefined),
        read: async () => {
          throw new Error("must not read");
        },
        isComplete: async () => false,
      },
      10
    );

    expect(performance.now() - startedAt).toBeLessThan(250);
    expect(result).toMatchObject({
      libraryAvailable: false,
      needsInitialSync: false,
      topTracks: [],
      playHistory: [],
    });
  });

  test("bounds the shared optional-library operation used by route loaders", async () => {
    const startedAt = performance.now();

    await expect(
      withOptionalLibraryDeadline(
        () => new Promise<never>(() => undefined),
        10
      )
    ).rejects.toThrow("Optional local library timed out");
    expect(performance.now() - startedAt).toBeLessThan(250);
  });
});
