import { afterEach, describe, expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { tracksTable } from "./db.schema";
import {
  createAccountDatabaseManager,
  getAccountDatabaseUri,
} from "./db.client";

describe("account-scoped PGlite", () => {
  const databases: PGlite[] = [];
  afterEach(async () => {
    await Promise.all(databases.splice(0).map((database) => database.close()));
  });

  test(
    "keeps durable database identities and rows isolated by Spotify account",
    async () => {
      const openedUris: string[] = [];
      const manager = createAccountDatabaseManager((uri) => {
        openedUris.push(uri);
        const pg = new PGlite();
        databases.push(pg);
        return pg;
      });

      const accountA = await manager.initialize("account-a");
      const accountB = await manager.initialize("account-b");
      await accountA.db
        .insert(tracksTable)
        .values({ id: "private-track", name: "A" });

      expect(await accountA.db.$count(tracksTable)).toBe(1);
      expect(await accountB.db.$count(tracksTable)).toBe(0);
      expect(manager.get("account-a")).toBe(accountA);
      expect(await manager.initialize("account-a")).toBe(accountA);
      expect(openedUris).toEqual([
        getAccountDatabaseUri("account-a"),
        getAccountDatabaseUri("account-b"),
      ]);
      expect(openedUris[0]).not.toBe(openedUris[1]);
    }
  );

  test("does not reuse a failed account initialization", async () => {
    let attempts = 0;
    const manager = createAccountDatabaseManager(() => {
      attempts += 1;
      if (attempts === 1) throw new Error("storage unavailable");
      const pg = new PGlite();
      databases.push(pg);
      return pg;
    });

    await expect(manager.initialize("account-a")).rejects.toThrow(
      "storage unavailable"
    );
    await expect(manager.initialize("account-a")).resolves.toMatchObject({
      accountId: "account-a",
    });
    expect(attempts).toBe(2);
  });

  test("uses a bounded opaque storage name", () => {
    expect(getAccountDatabaseUri("account/a@example.com")).not.toContain(
      "account/a@example.com"
    );
    expect(() => getAccountDatabaseUri(" ")).toThrow("account ID is required");
    expect(() => getAccountDatabaseUri("x".repeat(257))).toThrow("safety limit");
  });
});
