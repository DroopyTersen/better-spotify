import { LoaderFunctionArgs, useFetcher } from "react-router";
import { requireAuth } from "~/auth/auth.server";
import { useCurrentUser } from "~/auth/useCurrentUser";
import { SidebarLayout } from "~/components/layout/SidebarLayout";
import { Button } from "~/shadcn/components/ui/button";
import { createSpotifySdk } from "~/spotify/createSpotifySdk";
import { spotifyDb } from "~/spotify/spotify.db";
import { syncSpotifyData } from "~/spotify/syncSpotifyData";
import { Welcome } from "../welcome/welcome";
import type { Route } from "./+types/home";
import { getDb } from "~/db/db.client";
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
  await syncSpotifyData(sdk);
  return { success: true };
};
export const loader = async ({ request }: LoaderFunctionArgs) => {
  let user = await requireAuth(request);
};

export const clientLoader = async ({ request }: LoaderFunctionArgs) => {
  console.time("data-loading");
  let db = getDb();
  let play;
  let results = await db.transaction(
    async (tx) => {
      let [topTracks, topArtists, playHistory] = await Promise.all([
        spotifyDb.getTopTracks(tx, {
          limit: 150,
        }),
        spotifyDb.getTopArtists(tx, {
          limit: 50,
        }),
        spotifyDb.getPlayHistory(tx, { limit: 50 }),
      ]);
      return { topTracks, topArtists, playHistory };
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
      <pre className="text-xs">{JSON.stringify(loaderData, null, 2)}</pre>
    </SidebarLayout>
  );
}
