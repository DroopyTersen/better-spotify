import type { Route } from "./+types/home";
import { Welcome } from "../welcome/welcome";
import { SidebarLayout } from "~/components/layout/SidebarLayout";
import { LoaderFunctionArgs, useFetcher } from "react-router";
import { requireAuth } from "~/auth/auth.server";
import { json } from "node:stream/consumers";
import { useCurrentUser } from "~/auth/useCurrentUser";
import { Button } from "~/shadcn/components/ui/button";
import {
  resyncPlayHistory,
  resyncTopArtists,
  resyncTopTracks,
} from "~/spotify/syncPlayHistory";
import { createSpotifySdk } from "~/spotify/createSpotifySdk";
import { getDb } from "~/db/db.client";
import {
  albumsTable,
  artistGenresTable,
  artistsTable,
  artistTracks,
  genresTable,
  playHistoryTable,
  topArtistsView,
  topTracksTable,
  topTracksView,
  trackHistoryView,
  tracksTable,
} from "~/db/db.schema";
import { eq } from "drizzle-orm";
import { spotifyDb } from "~/spotify/spotify.db";
export function meta({}: Route.MetaArgs) {
  return [
    { title: "New React Router App" },
    { name: "description", content: "Welcome to React Router!" },
  ];
}

export const clientAction = async ({ request }: Route.ClientActionArgs) => {
  let { user } = await request.json();
  console.log("🚀 | clientAction | user:", user);
  let sdk = await createSpotifySdk(user.tokens);
  await resyncPlayHistory(sdk);
  await resyncTopTracks(sdk);
  await resyncTopArtists(sdk);
  return { success: true };
};
export const loader = async ({ request }: LoaderFunctionArgs) => {
  let user = await requireAuth(request);
};

export const clientLoader = async ({ request }: LoaderFunctionArgs) => {
  let [topTracks, topArtists, playHistory] = await Promise.all([
    spotifyDb.getTopTracks({
      limit: 20,
    }),
    spotifyDb.getTopArtists({
      limit: 25,
    }),
    spotifyDb.getPlayHistory({ limit: 5 }),
  ]);
  return { topTracks: [], topArtists, playHistory };
};
export default function Home({ loaderData }: Route.ComponentProps) {
  let user = useCurrentUser();
  let fetcher = useFetcher();
  let syncPlayHistory = () => {
    console.log("🚀 | syncPlayHistory | user:", user);
    if (!user?.tokens) return;
    fetcher.submit(
      { user },
      {
        method: "POST",
        encType: "application/json",
      }
    );
  };
  return (
    <SidebarLayout>
      <h1>Home</h1>
      <Welcome />
      <Button
        type="button"
        disabled={fetcher.state !== "idle"}
        onClick={syncPlayHistory}
      >
        Sync Play History
      </Button>
      <pre>{JSON.stringify(loaderData, null, 2)}</pre>
    </SidebarLayout>
  );
}
