import { LoaderFunctionArgs, Outlet, useFetcher } from "react-router";
import { requireAuth } from "~/auth/auth.server";
import { useCurrentUser } from "~/auth/useCurrentUser";
import { SidebarLayout } from "~/layout/SidebarLayout";
import { Button } from "~/shadcn/components/ui/button";
import { createSpotifySdk } from "~/spotify/createSpotifySdk";
import { spotifyDb } from "~/spotify/spotify.db";
import { syncSpotifyData } from "~/spotify/sync/syncSpotifyData";
import { getDb } from "~/db/db.client";
import type { Route } from "./+types/root.layout";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Better Spotify" },
    { name: "description", content: "A Spotify client for the modern age" },
  ];
}

export const clientAction = async ({ request }: Route.ClientActionArgs) => {
  let { user } = await request.json();
  console.log("🚀 | clientAction | user:", user);
  let sdk = await createSpotifySdk(user.tokens);
  await syncSpotifyData(sdk);
  return { success: true };
};

export const clientLoader = async ({ request }: Route.ClientLoaderArgs) => {
  console.time("data-loading");
  let db = getDb();

  let results = await db.transaction(
    async (tx) => {
      let [topPlaylists, topTracks, topArtists, playHistory] =
        await Promise.all([
          spotifyDb.getPlaylists(tx, {
            limit: 25,
          }),
          spotifyDb.getTopTracks(tx, {
            limit: 150,
          }),
          spotifyDb.getTopArtists(tx, {
            limit: 50,
          }),
          spotifyDb.getPlayHistory(tx, { limit: 50 }),
        ]);
      return { topPlaylists, topTracks, topArtists, playHistory };
    },
    {
      accessMode: "read only",
      isolationLevel: "repeatable read",
    }
  );

  console.timeEnd("data-loading");
  return results;
};
export default function Home({ loaderData }: Route.ComponentProps) {
  return (
    <SidebarLayout playlists={loaderData?.topPlaylists || []}>
      <Outlet />
      <pre className="text-xs">{JSON.stringify(loaderData, null, 2)}</pre>
    </SidebarLayout>
  );
}
