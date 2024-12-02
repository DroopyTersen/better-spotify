import {
  artistsTable,
  playlistsTable,
  playlistTracksTable,
  tracksTable,
} from "~/db/db.schema";
import { SpotifySdk } from "../createSpotifySdk";
import { getDb } from "~/db/db.client";
export const syncPlaylists = async (sdk: SpotifySdk) => {
  let db = getDb();
  console.log("syncPlaylists");
  let count = 0;
  let nextUrl = "first page";
  let MAX_LIMIT = 400;
  while (nextUrl && count < MAX_LIMIT) {
    let nextPage = await sdk.currentUser.playlists.playlists(50, count);
    let playListItems = nextPage.items.filter(
      (p) => p && p?.id && p?.collaborative === false
    );
    console.log("🚀 | syncPlaylists | playListItems:", playListItems);

    // Process playlists in batches of 5
    for (let i = 0; i < playListItems.length; i += 5) {
      const batch = playListItems.slice(i, i + 5);

      // Fetch full playlist details in parallel
      const fullPlaylists = await Promise.all(
        batch.map((playlist) => sdk.playlists.getPlaylist(playlist.id))
      );
      console.log("🚀 | syncPlaylists | fullPlaylists:", fullPlaylists);

      // Insert all playlists from batch
      await db
        .insert(playlistsTable)
        .values(fullPlaylists)
        .onConflictDoNothing();

      // Insert all tracks from batch
      let playListTracks = fullPlaylists.flatMap((playlist) =>
        playlist.tracks.items.map((track) => track.track)
      );
      await db.insert(tracksTable).values(playListTracks).onConflictDoNothing();
      // Insert all playlist tracks records
      let playlistTracksRecords = fullPlaylists.map((playlist) => {
        return playlist.tracks.items.map((track) => ({
          playlist_id: playlist.id,
          track_id: track.track.id,
          added_at: new Date(track.added_at),
          added_by: track.added_by,
        }));
      });
      await db
        .insert(playlistTracksTable)
        .values(playlistTracksRecords.flat())
        .onConflictDoNothing();

      // Insert all the artists
      let playlistArtists = fullPlaylists.flatMap((playlist) =>
        playlist.tracks.items.map((track) => track.track.artists)
      );
      await db
        .insert(artistsTable)
        .values(playlistArtists.flat())
        .onConflictDoNothing();
    }

    count += playListItems.length;
    nextUrl = nextPage.next || "";
    console.log("🚀 | syncPlaylists | count:", count);
  }
};
