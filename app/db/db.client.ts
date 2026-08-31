import { PGlite } from "@electric-sql/pglite";
import { setupTablesSql } from "./pglite/migrations/001.setupTables";
import { librarySnapshotIntegritySql } from "./pglite/migrations/003.librarySnapshotIntegrity";
import { preserveArtistOrderSql } from "./pglite/migrations/004.preserveArtistOrder";
import { createSingleton } from "~/toolkit/utils/createSingleton";
import { drizzle, PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "./db.schema";
const LIBRARY_SCHEMA_VERSION = "0.0.5";
export type DB = PgliteDatabase<typeof schema>;

export type AccountDatabase = Readonly<{
  accountId: string;
  db: DB;
  pg: PGlite;
}>;

type AccountDatabaseState = {
  database?: AccountDatabase;
  initialization?: Promise<AccountDatabase>;
};

type PGliteFactory = (databaseUri: string) => PGlite;

export function normalizeSpotifyAccountId(accountId: string): string {
  const normalized = accountId.trim();
  if (!normalized) {
    throw new Error("A Spotify account ID is required for local library access");
  }
  if (normalized.length > 256) {
    throw new Error("Spotify account ID exceeds the local library safety limit");
  }
  return normalized;
}

export function getAccountDatabaseUri(accountId: string): string {
  const encodedAccountId = [...new TextEncoder().encode(
    normalizeSpotifyAccountId(accountId)
  )]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `idb://better-spotify-account-${encodedAccountId}`;
}

export function createAccountDatabaseManager(
  createPGlite: PGliteFactory = (databaseUri) => new PGlite(databaseUri)
) {
  const databases = new Map<string, AccountDatabaseState>();

  const initialize = async (accountId: string): Promise<AccountDatabase> => {
    const normalizedAccountId = normalizeSpotifyAccountId(accountId);
    const current = databases.get(normalizedAccountId);
    if (current?.database) return current.database;
    if (current?.initialization) return current.initialization;

    const state: AccountDatabaseState = {};
    databases.set(normalizedAccountId, state);
    state.initialization = (async () => {
      let pg: PGlite | undefined;
      try {
        pg = createPGlite(getAccountDatabaseUri(normalizedAccountId));
        await applyMigrations(pg);
        const db = drizzle({ client: pg, schema });
        await db.query.genresTable.findFirst();
        const database = Object.freeze({
          accountId: normalizedAccountId,
          db,
          pg,
        });
        state.database = database;
        return database;
      } catch (error) {
        databases.delete(normalizedAccountId);
        await pg?.close().catch(() => undefined);
        throw error;
      } finally {
        state.initialization = undefined;
      }
    })();

    return state.initialization;
  };

  const get = (accountId: string): AccountDatabase | null =>
    databases.get(normalizeSpotifyAccountId(accountId))?.database ?? null;

  return { get, initialize };
}

const accountDatabaseManager = createSingleton(
  "better-spotify-account-database-manager",
  createAccountDatabaseManager
);

export const initAccountDatabase = (accountId: string) =>
  accountDatabaseManager.initialize(accountId);

export const getAccountDatabase = (accountId: string) => {
  const database = accountDatabaseManager.get(accountId);
  if (!database) {
    throw new Error("Account database not initialized");
  }
  return database;
};

export const getOptionalAccountDatabase = (accountId: string) =>
  accountDatabaseManager.get(accountId);

export const applyMigrations = async (pg: PGlite) => {
  await pg.transaction(async (tx) => {
    await tx.exec(setupTablesSql);
    const currentVersion = await tx.query<{ value: string }>(
      `SELECT value FROM library_metadata WHERE key = $1`,
      ["schema_version"]
    );
    if (currentVersion.rows[0]?.value !== LIBRARY_SCHEMA_VERSION) {
      await tx.exec(librarySnapshotIntegritySql);
      await tx.exec(preserveArtistOrderSql);
      await tx.query(
        `DELETE FROM library_metadata WHERE key = $1 OR key = $2`,
        ["full_sync_version", "play_history_continuation_before"]
      );
      await tx.query(
        `INSERT INTO library_metadata (key, value)
         VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
        ["schema_version", LIBRARY_SCHEMA_VERSION]
      );
    }
  });
};
