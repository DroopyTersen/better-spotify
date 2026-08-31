import type { DB } from "~/db/db.client";
import {
  albumArtistsTable,
  albumsTable,
  artistGenresTable,
  artistsTable,
  artistTracks,
  genresTable,
  libraryMetadataTable,
  playHistoryTable,
  savedTracksTable,
  topArtistsTable,
  topTracksTable,
  tracksTable,
} from "~/db/db.schema";
import { eq, inArray, sql } from "drizzle-orm";
import type {
  normalizeArtistGraph,
  normalizeTrackGraph,
} from "./syncRecords";

type SyncWriter = Pick<DB, "delete" | "insert">;
type ArtistGraph = ReturnType<typeof normalizeArtistGraph>;
type TrackGraph = ReturnType<typeof normalizeTrackGraph>;
const WRITE_BATCH_SIZE = 250;
const PLAY_HISTORY_CONTINUATION_KEY = "play_history_continuation_before";

const forEachBatch = async <Value>(
  values: Value[],
  operation: (batch: Value[]) => Promise<unknown>
) => {
  for (let index = 0; index < values.length; index += WRITE_BATCH_SIZE) {
    await operation(values.slice(index, index + WRITE_BATCH_SIZE));
  }
};

export async function writeArtists(
  db: SyncWriter,
  artists: ArtistGraph["artists"]
) {
  if (!artists.length) return;
  await forEachBatch(artists, (batch) =>
    db
      .insert(artistsTable)
      .values(batch)
      .onConflictDoUpdate({
        target: artistsTable.id,
        set: {
          name: sql`excluded.name`,
          external_urls: sql`coalesce(excluded.external_urls, ${artistsTable.external_urls})`,
          followers: sql`coalesce(excluded.followers, ${artistsTable.followers})`,
          href: sql`coalesce(excluded.href, ${artistsTable.href})`,
          uri: sql`coalesce(excluded.uri, ${artistsTable.uri})`,
          popularity: sql`coalesce(excluded.popularity, ${artistsTable.popularity})`,
          images: sql`coalesce(excluded.images, ${artistsTable.images})`,
        },
      })
  );
}

export async function writeArtistGraph(db: SyncWriter, graph: ArtistGraph) {
  await writeArtists(db, graph.artists);
  const artistIds = graph.artists.map(({ id }) => id);
  await forEachBatch(artistIds, (batch) =>
    db
      .delete(artistGenresTable)
      .where(inArray(artistGenresTable.artist_id, batch))
  );
  if (graph.genres.length) {
    await forEachBatch(graph.genres, (batch) =>
      db.insert(genresTable).values(batch).onConflictDoNothing()
    );
  }
  if (graph.artistGenres.length) {
    await forEachBatch(graph.artistGenres, (batch) =>
      db.insert(artistGenresTable).values(batch).onConflictDoNothing()
    );
  }
}

export async function writeTrackGraph(db: SyncWriter, graph: TrackGraph) {
  if (graph.albums.length) {
    await forEachBatch(graph.albums, (batch) =>
      db
        .insert(albumsTable)
        .values(batch)
        .onConflictDoUpdate({
          target: albumsTable.id,
          set: {
            name: sql`excluded.name`,
            album_type: sql`coalesce(excluded.album_type, ${albumsTable.album_type})`,
            total_tracks: sql`coalesce(excluded.total_tracks, ${albumsTable.total_tracks})`,
            release_date: sql`coalesce(excluded.release_date, ${albumsTable.release_date})`,
            release_date_precision: sql`coalesce(excluded.release_date_precision, ${albumsTable.release_date_precision})`,
            external_urls: sql`coalesce(excluded.external_urls, ${albumsTable.external_urls})`,
            href: sql`coalesce(excluded.href, ${albumsTable.href})`,
            uri: sql`coalesce(excluded.uri, ${albumsTable.uri})`,
            label: sql`coalesce(excluded.label, ${albumsTable.label})`,
            popularity: sql`coalesce(excluded.popularity, ${albumsTable.popularity})`,
            images: sql`coalesce(excluded.images, ${albumsTable.images})`,
          },
        })
    );
  }

  await writeArtists(db, graph.artists);

  if (graph.tracks.length) {
    await forEachBatch(graph.tracks, (batch) =>
      db
        .insert(tracksTable)
        .values(batch)
        .onConflictDoUpdate({
          target: tracksTable.id,
          set: {
            name: sql`excluded.name`,
            album_id: sql`coalesce(excluded.album_id, ${tracksTable.album_id})`,
            disc_number: sql`coalesce(excluded.disc_number, ${tracksTable.disc_number})`,
            duration_ms: sql`coalesce(excluded.duration_ms, ${tracksTable.duration_ms})`,
            explicit: sql`coalesce(excluded.explicit, ${tracksTable.explicit})`,
            external_urls: sql`coalesce(excluded.external_urls, ${tracksTable.external_urls})`,
            href: sql`coalesce(excluded.href, ${tracksTable.href})`,
            uri: sql`coalesce(excluded.uri, ${tracksTable.uri})`,
            is_playable: sql`coalesce(excluded.is_playable, ${tracksTable.is_playable})`,
            popularity: sql`coalesce(excluded.popularity, ${tracksTable.popularity})`,
            preview_url: sql`coalesce(excluded.preview_url, ${tracksTable.preview_url})`,
            track_number: sql`coalesce(excluded.track_number, ${tracksTable.track_number})`,
          },
        })
    );
  }

  await forEachBatch(graph.tracksWithCompleteArtists, (batch) =>
    db.delete(artistTracks).where(inArray(artistTracks.track_id, batch))
  );
  if (graph.artistTracks.length) {
    await forEachBatch(graph.artistTracks, (batch) =>
      db.insert(artistTracks).values(batch).onConflictDoNothing()
    );
  }
  await forEachBatch(graph.albumsWithCompleteArtists, (batch) =>
    db.delete(albumArtistsTable).where(inArray(albumArtistsTable.album_id, batch))
  );
  if (graph.albumArtists.length) {
    await forEachBatch(graph.albumArtists, (batch) =>
      db.insert(albumArtistsTable).values(batch).onConflictDoNothing()
    );
  }
}

export async function readSyncSnapshot(db: DB) {
  const [
    albums,
    artists,
    tracks,
    artistTrackRows,
    albumArtistRows,
    genres,
    artistGenreRows,
    topTracks,
    topArtists,
    savedTracks,
    playHistory,
    playHistoryContinuation,
  ] = await Promise.all([
    db.select().from(albumsTable),
    db.select().from(artistsTable),
    db.select().from(tracksTable),
    db.select().from(artistTracks),
    db.select().from(albumArtistsTable),
    db.select().from(genresTable),
    db.select().from(artistGenresTable),
    db.select().from(topTracksTable),
    db.select().from(topArtistsTable),
    db.select().from(savedTracksTable),
    db.select().from(playHistoryTable),
    db.query.libraryMetadataTable.findFirst({
      columns: { value: true },
      where: eq(libraryMetadataTable.key, PLAY_HISTORY_CONTINUATION_KEY),
    }),
  ]);
  return {
    albums,
    artists,
    tracks,
    artistTracks: artistTrackRows,
    albumArtists: albumArtistRows,
    genres,
    artistGenres: artistGenreRows,
    topTracks,
    topArtists,
    savedTracks,
    playHistory,
    playHistoryContinuationBefore: playHistoryContinuation?.value ?? null,
  };
}

export type SyncSnapshot = Awaited<ReturnType<typeof readSyncSnapshot>>;

export async function publishSyncSnapshot(
  db: SyncWriter,
  snapshot: SyncSnapshot
) {
  const stagedArtistTracks = snapshot.artistTracks.map((row) => {
    if (!row.track_id || !row.artist_id) {
      throw new Error("Staged Spotify artist-track relation is incomplete");
    }
    return {
      track_id: row.track_id,
      artist_id: row.artist_id,
      position: row.position,
    };
  });
  const stagedAlbumArtists = snapshot.albumArtists.map((row) => {
    if (!row.album_id || !row.artist_id) {
      throw new Error("Staged Spotify album-artist relation is incomplete");
    }
    return { album_id: row.album_id, artist_id: row.artist_id };
  });
  const stagedArtistGenres = snapshot.artistGenres.map((row) => {
    if (!row.artist_id || !row.genre_id) {
      throw new Error("Staged Spotify artist-genre relation is incomplete");
    }
    return { artist_id: row.artist_id, genre_id: row.genre_id };
  });

  await writeTrackGraph(db, {
    albums: snapshot.albums,
    artists: snapshot.artists,
    tracks: snapshot.tracks,
    artistTracks: stagedArtistTracks,
    albumArtists: stagedAlbumArtists,
    tracksWithCompleteArtists: snapshot.tracks.map(({ id }) => id),
    albumsWithCompleteArtists: snapshot.albums.map(({ id }) => id),
  });
  await writeArtistGraph(db, {
    artists: snapshot.artists,
    genres: snapshot.genres,
    artistGenres: stagedArtistGenres,
  });

  await db.delete(topTracksTable);
  await forEachBatch(snapshot.topTracks, (batch) =>
    db.insert(topTracksTable).values(batch)
  );
  await db.delete(topArtistsTable);
  await forEachBatch(snapshot.topArtists, (batch) =>
    db.insert(topArtistsTable).values(batch)
  );
  await db.delete(savedTracksTable);
  await forEachBatch(snapshot.savedTracks, (batch) =>
    db.insert(savedTracksTable).values(batch)
  );
  await forEachBatch(snapshot.playHistory, (batch) =>
    db.insert(playHistoryTable).values(batch).onConflictDoNothing()
  );
  await db
    .delete(libraryMetadataTable)
    .where(eq(libraryMetadataTable.key, PLAY_HISTORY_CONTINUATION_KEY));
  if (snapshot.playHistoryContinuationBefore) {
    await db.insert(libraryMetadataTable).values({
      key: PLAY_HISTORY_CONTINUATION_KEY,
      value: snapshot.playHistoryContinuationBefore,
    });
  }
}
