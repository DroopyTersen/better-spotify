// @ts-ignore
import { PGlite } from "https://cdn.jsdelivr.net/npm/@electric-sql/pglite/dist/index.js";
import { setupTablesSql } from "./pglite/migrations/001.setupTables";
import { createSingleton } from "~/toolkit/utils/createSingleton";
import { drizzle, PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "./db.schema";
let _pg: PGlite;
const VERSION = "0.0.3";
export type DB = PgliteDatabase<typeof schema>;
let _db: DB;
export const initDb = async () => {
  if (_pg) {
    return _pg;
  }
  _pg = await createSingleton("pg", async () => {
    let pg = new PGlite("idb://better-spotify");
    let dbVersion = localStorage.getItem("dbVersion");
    if (!dbVersion || dbVersion !== VERSION) {
      await applyMigrations(pg);
      localStorage.setItem("dbVersion", VERSION);
    }
    return pg;
  });
  _db = drizzle({
    client: _pg,
    schema,
  });
  await _db.query.genresTable.findFirst();
  return _pg;
};

export const getDb = () => {
  if (!_db) {
    throw new Error("Database not initialized");
  }
  return _db;
};

export const applyMigrations = async (pg: PGlite) => {
  // Get all SQL files in the current directory
  await pg.exec(setupTablesSql);

  console.log("All migrations applied successfully!!!");
};
