import { useEffect } from "react";
import { Outlet, useRevalidator } from "react-router";
import { requireAuth } from "~/auth/auth.server";
import { useCurrentUser } from "~/auth/useCurrentUser";
import { getDb } from "~/db/db.client";
import { SidebarLayout } from "~/layout/SidebarLayout";
import { createSpotifySdk } from "~/spotify/createSpotifySdk";
import { PlaylistSelectionProvider } from "~/spotify/playlistBuilder/PlaylistSelectionContext";
import { spotifyDb } from "~/spotify/spotify.db";
import { syncFullArtistData } from "~/spotify/sync/syncFullArtistData";
import { syncPlayHistory } from "~/spotify/sync/syncPlayHistory";
import type { Route } from "./+types/root.layout";

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

export const clientLoader = async ({
  request,
  serverLoader,
}: Route.ClientLoaderArgs) => {
  console.time("data-loading");
  let db = getDb();
  let { user, playlists, devices } = await serverLoader();
  let results = await db.transaction(
    async (tx) => {
      let [
        topTracks,
        topArtists,
        playHistory,
        likedTracks,
        recentArtists,
        basicLikedTracks,
      ] = await Promise.all([
        spotifyDb.getTopTracks(tx, {
          limit: 200,
        }),
        spotifyDb.getTopArtists(tx, {
          limit: 100,
        }),
        spotifyDb.getPlayHistory(tx, { limit: 100 }),
        spotifyDb.getLikedTracks(tx, { limit: 100 }),
        spotifyDb.getRecentArtists(tx, { limit: 100 }),
        spotifyDb.getBasicLikedTracks(tx),
      ]);
      return {
        topTracks,
        topArtists,
        playHistory,
        likedTracks,
        recentArtists,
        playlists,
        devices,
        basicLikedTracks,
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
  console.log("🚀 | RootLayout | loaderData:", loaderData);
  useEffect(() => {
    revalidator.revalidate();
  }, []);
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

  if (!("topTracks" in loaderData)) return null;

  return (
    <PlaylistSelectionProvider>
      <SidebarLayout
        playlists={(loaderData?.playlists || []) as any}
        devices={loaderData.devices}
      >
        <Outlet />
      </SidebarLayout>
    </PlaylistSelectionProvider>
  );
}
