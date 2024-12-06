import {
  BuildPlaylistTrack,
  BuildPlaylistInput,
} from "./playlistBuilder.types";
import type { Route } from "./+types/api.buildPlaylist.route";
import { z } from "zod";
import { requireAuth } from "~/auth/auth.server";
import { createSpotifySdk } from "../createSpotifySdk";
import { buildPlaylist } from "./buildPlaylist.server";

export const action = async ({ request }: Route.ActionArgs) => {
  let user = await requireAuth(request);
  let sdk = await createSpotifySdk(user.tokens);
  let body = await request.json();
  let input = BuildPlaylistInput.parse(body);
  console.log("🚀 | action | input:", input);
  let result = await buildPlaylist(input, sdk);
  console.log("🚀 | action | result:", result);
  return Response.json(result);
};
