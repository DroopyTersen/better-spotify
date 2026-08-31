import { PageHeader } from "~/layout/PageHeader";
import type { Route } from "./+types/playlist.$playlistId.route";
import { requireAuth, type User } from "~/auth/auth.server";
import { useCurrentUser } from "~/auth/useCurrentUser";
import { useAsyncData } from "~/toolkit/hooks/useAsyncData";
import { getPlaylist } from "~/spotify/api/getPlaylist";
import { createSpotifySdk } from "~/spotify/createSpotifySdk";
import { PlaylistDisplay } from "~/spotify/components/PlaylistDisplay";
import { requireSpotifyId } from "~/spotify/spotifyId";
import { useState } from "react";

export const loader = async ({ request, params }: Route.LoaderArgs) => {
  await requireAuth(request);
  return { playlistId: requireSpotifyId(params.playlistId) };
};

export default function PlaylistRoute({ loaderData }: Route.ComponentProps) {
  let currentUser = useCurrentUser();
  const [reloadKey, setReloadKey] = useState(0);
  let {
    data: playlist,
    error,
    isLoading,
  } = useAsyncData(
    async (currentUser: User) => {
      if (!currentUser) return null;
      let sdk = createSpotifySdk(currentUser.tokens);
      return getPlaylist(sdk, loaderData.playlistId);
    },
    [currentUser, loaderData.playlistId, reloadKey],
    null
  );
  if (isLoading) {
    return (
      <>
        <PageHeader>Playlists</PageHeader>
        <p className="mx-auto max-w-5xl text-muted-foreground" role="status">
          Loading playlist…
        </p>
      </>
    );
  }
  if (error) {
    return (
      <>
        <PageHeader>Playlists</PageHeader>
        <p className="mx-auto max-w-5xl text-destructive" role="alert">
          This playlist could not be loaded. Please try again.
        </p>
      </>
    );
  }
  if (!playlist) return null;

  return (
    <>
      <PageHeader>Playlists</PageHeader>
      <PlaylistDisplay
        playlist={playlist}
        key={playlist.id}
        onPlaylistModified={() => setReloadKey((value) => value + 1)}
      />
    </>
  );
}
