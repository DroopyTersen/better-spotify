// @ts-ignore
import { PGlite } from "https://cdn.jsdelivr.net/npm/@electric-sql/pglite/dist/index.js";
import { setupTablesSql } from "./pglite/migrations/001.setupTables";
import { createSingleton } from "~/toolkit/utils/createSingleton";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "./db.schema";
let _pg: PGlite;
export const initDb = async (dataDir?: string) => {
  if (_pg) {
    return _pg;
  }
  _pg = await createSingleton("pg", async () => {
    let pg = new PGlite("idb://better-spotify");
    await applyMigrations(pg);
    return pg;
  });
  return _pg;
};

export const getDb = () => {
  if (!_pg) {
    throw new Error("Database not initialized");
  }
  return drizzle({
    client: _pg,
    schema,
  });
};

export const applyMigrations = async (pg: PGlite) => {
  // Get all SQL files in the current directory
  await pg.exec(setupTablesSql);

  console.log("All migrations applied successfully!!!");
};
