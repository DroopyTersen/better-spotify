import {
  LoaderFunctionArgs,
  Outlet,
  useFetcher,
  useRevalidator,
} from "react-router";
import { requireAuth } from "~/auth/auth.server";
import { useCurrentUser } from "~/auth/useCurrentUser";
import { SidebarLayout } from "~/layout/SidebarLayout";
import { Button } from "~/shadcn/components/ui/button";
import { createSpotifySdk } from "~/spotify/createSpotifySdk";
import { spotifyDb } from "~/spotify/spotify.db";
import { syncSpotifyData } from "~/spotify/sync/syncSpotifyData";
import { getDb } from "~/db/db.client";
import type { Route } from "./+types/root.layout";
import { useEffect } from "react";
import { syncPlayHistory } from "~/spotify/sync/syncPlayHistory";
import { syncFullArtistData } from "~/spotify/sync/syncFullArtistData";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Better Spotify" },
    { name: "description", content: "A Spotify client for the modern age" },
  ];
}

export const clientLoader = async ({ request }: Route.ClientLoaderArgs) => {
  console.time("data-loading");
  let db = getDb();
  let results = await db.transaction(
    async (tx) => {
      let [
        topPlaylists,
        topTracks,
        topArtists,
        playHistory,
        likedTracks,
        recentArtists,
      ] = await Promise.all([
        spotifyDb.getPlaylists(tx, {
          limit: 25,
        }),
        spotifyDb.getTopTracks(tx, {
          limit: 200,
        }),
        spotifyDb.getTopArtists(tx, {
          limit: 100,
        }),
        spotifyDb.getPlayHistory(tx, { limit: 100 }),
        spotifyDb.getLikedTracks(tx, { limit: 100 }),
        spotifyDb.getRecentArtists(tx, { limit: 100 }),
      ]);
      return {
        topPlaylists,
        topTracks,
        topArtists,
        playHistory,
        likedTracks,
        recentArtists,
      };
    },
    {
      accessMode: "read only",
      isolationLevel: "repeatable read",
    }
  );

  console.timeEnd("data-loading");
  return results;
};

export default function RootLayout({ loaderData }: Route.ComponentProps) {
  let currentUser = useCurrentUser();
  let sdk = currentUser?.tokens?.accessToken
    ? createSpotifySdk(currentUser?.tokens!)
    : null;
  let revalidator = useRevalidator();

  useEffect(() => {
    if (sdk) {
      syncPlayHistory(sdk).then((data) => {
        if (data.inserted > 1) {
          syncFullArtistData(sdk).then(() => {
            revalidator.revalidate();
          });
        }
      });
      // Set up interval to sync every 60 seconds
      const intervalId = setInterval(async () => {
        let data = await syncPlayHistory(sdk);
        if (data.inserted > 1) {
          syncFullArtistData(sdk).then(() => {
            revalidator.revalidate();
          });
        }
      }, 60 * 1000);

      // Cleanup interval on component unmount
      return () => clearInterval(intervalId);
    }
  }, []);

  return (
    <SidebarLayout playlists={loaderData?.topPlaylists || []}>
      <Outlet />
    </SidebarLayout>
  );
}
