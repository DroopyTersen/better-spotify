import { requireAuth } from "~/auth/auth.server";
import { createSpotifySdk, type SpotifySdk } from "../createSpotifySdk";
import { generatePlaylistModification } from "./generatePlaylistModification.server";
import {
  PlaylistModificationInput,
  BuildPlaylistTrack,
} from "./playlistBuilder.types";
import { ensurePlaylistTrack } from "./buildPlaylist.server";

export const action = async ({ request }: { request: Request }) => {
  const user = await requireAuth(request);
  const sdk = createSpotifySdk(user.tokens);
  const input = (await request.json()) as PlaylistModificationInput;

  try {
    // Generate modifications
    const modifications = await generatePlaylistModification(input);

    // Validate and ensure all tracks exist
    const validPlaylistTracks = await Promise.all(
      modifications.modifiedPlaylist.tracks.map((track) =>
        ensurePlaylistTrack(track, new Set(), sdk)
      )
    ).then((tracks) => tracks.filter((track) => track.id));

    // Clear the playlist
    // TODO: handle pagination
    let existingItems = await sdk.playlists.getPlaylistItems(input.playlistId);
    if (existingItems.total > 0) {
      await sdk.playlists.removeItemsFromPlaylist(input.playlistId, {
        tracks: existingItems.items.map((item) => ({
          uri: item.track.uri,
        })),
      });
    }

    // Then add the modified track list
    await sdk.playlists.addItemsToPlaylist(
      input.playlistId,
      validPlaylistTracks.map((track) => `spotify:track:${track.id}`)
    );

    return Response.json({
      ...modifications,
      modifiedPlaylist: {
        ...modifications.modifiedPlaylist,
        tracks: validPlaylistTracks,
      },
    });
  } catch (error) {
    console.error("Failed to modify playlist:", error);
    return Response.json(
      { error: "Failed to modify playlist" },
      { status: 500 }
    );
  }
};
