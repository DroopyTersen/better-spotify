import { LoaderFunctionArgs, useFetcher } from "react-router";
import { requireAuth } from "~/auth/auth.server";
import { useCurrentUser } from "~/auth/useCurrentUser";
import { SidebarLayout } from "~/layout/SidebarLayout";
import { Button } from "~/shadcn/components/ui/button";
import { createSpotifySdk } from "~/spotify/createSpotifySdk";
import { spotifyDb } from "~/spotify/spotify.db";
import { syncSpotifyData } from "~/spotify/sync/syncSpotifyData";
import { Welcome } from "../welcome/welcome";
import type { Route } from "./+types/home";
import { getDb } from "~/db/db.client";
import { Portal } from "~/toolkit/components/Portal/Portal";
import { PageHeader } from "~/layout/PageHeader";
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
  let sdk = await createSpotifySdk(user.tokens);
  let devices = await sdk.player.getAvailableDevices();
  return { devices: devices.devices };
};

export default function Home({ loaderData }: Route.ComponentProps) {
  console.log("🚀 | Home | loaderData:", loaderData);
  return (
    <>
      <PageHeader title="Dashboard" />
      <Welcome />
    </>
  );
}
