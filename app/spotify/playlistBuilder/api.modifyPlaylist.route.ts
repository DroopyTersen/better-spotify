import { requireAuth } from "~/auth/auth.server";
import { createSpotifySdk } from "../createSpotifySdk";
import { apiErrorResponse, parseJsonMutation } from "./apiRequest.server";
import { StartPlaylistModificationRequestSchema } from "./apiRequestSchemas";
import {
  modifyPlaylist,
  PlaylistModificationConflictError,
  PlaylistModificationResolutionError,
} from "./modifyPlaylist.server";
import {
  createPlaylistBuildUIMessageResponse,
  playlistBuildJobs,
} from "./playlistBuildJobs.server";
import { STARTING_MODIFICATION_PROGRESS } from "./playlistBuildProgress";
import type { Route } from "./+types/api.modifyPlaylist.route";

const MAX_MODIFY_PLAYLIST_BODY_BYTES = 128 * 1024;

export const action = async ({ request }: Route.ActionArgs) => {
  const user = await requireAuth(request);

  try {
    const { jobId, input } = await parseJsonMutation(
      request,
      StartPlaylistModificationRequestSchema,
      MAX_MODIFY_PLAYLIST_BODY_BYTES
    );
    const sdk = createSpotifySdk(user.tokens);
    const started = playlistBuildJobs.start({
      jobId,
      accountId: user.id,
      initialProgress: STARTING_MODIFICATION_PROGRESS,
      run: async (reportProgress) => {
        await modifyPlaylist(input, sdk, undefined, {
          onProgress: reportProgress,
        });
        return { playlistId: input.playlistId };
      },
      mapError: (error) => ({
        kind: "failed",
        message:
          error instanceof PlaylistModificationConflictError ||
          error instanceof PlaylistModificationResolutionError
            ? error.message
            : "The playlist tweak did not finish cleanly. Refresh the playlist before retrying.",
      }),
    });

    if (started.status === "conflict") {
      return Response.json(
        { error: "Another playlist operation is already running" },
        { status: 409 }
      );
    }
    if (started.status === "forbidden") {
      return Response.json(
        { error: "Playlist tweak is unavailable" },
        { status: 409 }
      );
    }

    return (
      createPlaylistBuildUIMessageResponse(jobId, user.id) ??
      Response.json(
        { error: "Playlist tweak is unavailable" },
        { status: 500 }
      )
    );
  } catch (error) {
    return apiErrorResponse(error, "Failed to modify playlist");
  }
};

export const loader = async ({ request }: Route.LoaderArgs) => {
  const user = await requireAuth(request);
  const jobId = new URL(request.url).searchParams.get("jobId");
  if (!jobId || !isUuid(jobId)) {
    return new Response(null, { status: 204 });
  }

  return (
    createPlaylistBuildUIMessageResponse(jobId, user.id) ??
    new Response(null, { status: 204 })
  );
};

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}
