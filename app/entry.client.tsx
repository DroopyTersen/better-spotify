import { startTransition, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";
import { getDb, initDb } from "./db/db.client";
import { spotifyDb } from "./spotify/spotify.db";

console.log("Initializing db...");
console.time("db-init");
initDb().then(async () => {
  // let db = getDb();
  // await db.query.artistsTable.findFirst();
  // await spotifyDb.getTopTracks({ limit: 1 });
  console.timeEnd("db-init");
  console.log("db initialized");
  startTransition(() => {
    hydrateRoot(
      document,
      <StrictMode>
        <HydratedRouter />
      </StrictMode>
    );
  });
});
