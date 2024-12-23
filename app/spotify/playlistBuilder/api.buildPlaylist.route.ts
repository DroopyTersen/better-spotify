import { requireAuth } from "~/auth/auth.server";
import { createSpotifySdk } from "../createSpotifySdk";
import type { Route } from "./+types/api.buildPlaylist.route";
import { buildPlaylist } from "./buildPlaylist.server";
import { BuildPlaylistInput } from "./playlistBuilder.types";

export const action = async ({ request }: Route.ActionArgs) => {
  let user = await requireAuth(request);
  let sdk = await createSpotifySdk(user.tokens);
  let body = (await request.json()) as BuildPlaylistInput;
  console.log("🚀 | action | body:", body);
  let result = await buildPlaylist(body, sdk);
  // console.log("🚀 | action | result:", result);
  // return redirect(`/playlist/${result.playlist.id}`);
  return Response.json(result);
};
export type BuildPlaylistResult = Awaited<ReturnType<typeof buildPlaylist>>;
