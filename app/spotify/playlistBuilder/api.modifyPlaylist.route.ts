import { requireAuth } from "~/auth/auth.server";
import { createSpotifySdk } from "../createSpotifySdk";
import { apiErrorResponse, parseJsonMutation } from "./apiRequest.server";
import { PlaylistModificationRequestSchema } from "./apiRequestSchemas";
import {
  modifyPlaylist,
  PlaylistModificationConflictError,
  PlaylistModificationResolutionError,
} from "./modifyPlaylist.server";

const MAX_MODIFY_PLAYLIST_BODY_BYTES = 128 * 1024;

export const action = async ({ request }: { request: Request }) => {
  const user = await requireAuth(request);

  try {
    const input = await parseJsonMutation(
      request,
      PlaylistModificationRequestSchema,
      MAX_MODIFY_PLAYLIST_BODY_BYTES
    );
    const sdk = createSpotifySdk(user.tokens);
    return Response.json(await modifyPlaylist(input, sdk));
  } catch (error) {
    if (error instanceof PlaylistModificationConflictError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof PlaylistModificationResolutionError) {
      return Response.json({ error: error.message }, { status: 422 });
    }
    return apiErrorResponse(error, "Failed to modify playlist");
  }
};
