import { createSpotifySdk } from "~/spotify/createSpotifySdk";
import { syncSpotifyData } from "~/spotify/sync/syncSpotifyData";
import type { Route } from "./+types/sync.route";
export const clientAction = async ({ request }: Route.ClientActionArgs) => {
  let { user } = await request.json();
  console.log("🚀 | clientAction | user:", user);
  let sdk = await createSpotifySdk(user.tokens);
  await syncSpotifyData(sdk);
  return { success: true };
};
