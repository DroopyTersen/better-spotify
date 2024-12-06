import { PageHeader } from "~/layout/PageHeader";
import type { Route } from "./+types/playlist.$playlistId.route";
import { PlaylistBuilder } from "~/spotify/playlistBuilder/PlaylistBuilder";
import { useRouteData } from "~/toolkit/remix/useRouteData";
import { LoaderFunctionArgs } from "react-router";
import { requireAuth, type User } from "~/auth/auth.server";
import { useCurrentUser } from "~/auth/useCurrentUser";
import { useAsyncData } from "~/toolkit/hooks/useAsyncData";
import { getPlaylist } from "~/spotify/api/getPlaylist";
import { createSpotifySdk } from "~/spotify/createSpotifySdk";
import { PlaylistDisplay } from "~/spotify/components/PlaylistDisplay";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  let user = await requireAuth(request);
  return { playlistId: params.playlistId };
};

export default function PlaylistRoute({ params }: Route.ComponentProps) {
  let currentUser = useCurrentUser();
  let {
    data: playlist,
    error,
    isLoading,
  } = useAsyncData(
    async (currentUser: User) => {
      if (!currentUser) return null;
      let sdk = createSpotifySdk(currentUser.tokens);
      return getPlaylist(sdk, params.playlistId);
    },
    [currentUser],
    null
  );
  if (!playlist) return null;

  return (
    <>
      <PageHeader title={playlist.name} />
      <PlaylistDisplay playlist={playlist} key={playlist.id} />
    </>
  );
}
