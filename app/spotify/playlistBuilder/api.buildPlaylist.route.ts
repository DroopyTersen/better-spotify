import {
  BuildPlaylistTrack,
  BuildPlaylistInput,
} from "./playlistBuilder.types";
import type { Route } from "./+types/api.buildPlaylist.route";
import { z } from "zod";
import { requireAuth } from "~/auth/auth.server";
import { createSpotifySdk } from "../createSpotifySdk";
import { buildPlaylist } from "./buildPlaylist.server";
import { redirect } from "react-router";

export const action = async ({ request }: Route.ActionArgs) => {
  let user = await requireAuth(request);
  let sdk = await createSpotifySdk(user.tokens);
  let body = (await request.json()) as BuildPlaylistInput;
  let result = await buildPlaylist(body, sdk);
  // console.log("🚀 | action | result:", result);
  // return redirect(`/playlist/${result.playlist.id}`);
  return Response.json(result);
};
