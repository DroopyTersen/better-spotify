import { useEffect } from "react";
import { Outlet, useRevalidator } from "react-router";
import { requireAuth, User } from "~/auth/auth.server";
import { useCurrentUser } from "~/auth/useCurrentUser";
import { getDb } from "~/db/db.client";
import { SidebarLayout } from "~/layout/SidebarLayout";
import { createSpotifySdk } from "~/spotify/createSpotifySdk";
import { spotifyDb } from "~/spotify/spotify.db";
import { syncFullArtistData } from "~/spotify/sync/syncFullArtistData";
import { syncPlayHistory } from "~/spotify/sync/syncPlayHistory";
import type { Route } from "./+types/root.layout";
import { tracksTable } from "~/db/db.schema";
import { syncSpotifyData } from "~/spotify/sync/syncSpotifyData";
import { wait } from "~/toolkit/utils/wait";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Better Spotify" },
    { name: "description", content: "A Spotify client for the modern age" },
  ];
}
export const loader = async ({ request }: Route.LoaderArgs) => {
  let user = await requireAuth(request);
  let sdk = createSpotifySdk(user.tokens!);
  let [playlists, devicesResults] = await Promise.all([
    sdk.currentUser.playlists.playlists(50).then((result) => {
      return result.items
        .filter((r) => r?.id)
        .map((r) => ({
          playlist_id: r.id,
          playlist_name: r.name,
          description: r.description,
          images: r.images,
          external_urls: r.external_urls,
          track_count: r.tracks?.total,
        }));
    }),
    sdk.player.getAvailableDevices(),
  ]);
  return { user, playlists, devices: devicesResults.devices };
};

declare global {
  interface Window {
    __currentUser: User;
  }
}
export const clientLoader = async ({
  request,
  serverLoader,
}: Route.ClientLoaderArgs) => {
  console.time("data-loading");
  let db = getDb();
  let { user, playlists, devices } = await serverLoader();
  window.__currentUser = user as User;
  let sdk = createSpotifySdk(user.tokens!);
  let trackCount = await db.$count(tracksTable);
  if (trackCount === 0) {
    syncSpotifyData(sdk);
    await wait(3000);
  }
  let dbResults = await spotifyDb.getAllSpotifyData(db);

  console.timeEnd("data-loading");
  return {
    ...dbResults,
    user,
    playlists,
    devices,
  };
};

export default function RootLayout({ loaderData }: Route.ComponentProps) {
  let currentUser = useCurrentUser();
  let sdk = currentUser?.tokens?.accessToken
    ? createSpotifySdk(currentUser?.tokens!)
    : null;
  let revalidator = useRevalidator();
  useEffect(() => {
    revalidator.revalidate();
  }, []);
  useEffect(() => {
    if (sdk) {
      syncPlayHistory(sdk).then((data) => {
        console.log("🚀 | syncPlayHistory | data:", data);
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

  if (!("topTracks" in loaderData)) return null;

  return (
    <SidebarLayout
      playlists={(loaderData?.playlists || []) as any}
      devices={loaderData.devices}
    >
      <Outlet />
    </SidebarLayout>
  );
}
