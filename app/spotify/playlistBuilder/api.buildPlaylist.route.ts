import { requireAuth } from "~/auth/auth.server";
import { createSpotifySdk } from "../createSpotifySdk";
import type { Route } from "./+types/api.buildPlaylist.route";
import { apiErrorResponse, parseJsonMutation } from "./apiRequest.server";
import { StartPlaylistBuildRequestSchema } from "./apiRequestSchemas";
import {
  buildPlaylist,
  PlaylistCreationResidualError,
} from "./buildPlaylist.server";
import {
  createPlaylistBuildUIMessageResponse,
  playlistBuildJobs,
} from "./playlistBuildJobs.server";

const MAX_BUILD_PLAYLIST_BODY_BYTES = 1024 * 1024;

export const action = async ({ request }: Route.ActionArgs) => {
  const user = await requireAuth(request);

  try {
    const { jobId, input } = await parseJsonMutation(
      request,
      StartPlaylistBuildRequestSchema,
      MAX_BUILD_PLAYLIST_BODY_BYTES
    );
    const sdk = createSpotifySdk(user.tokens);
    const started = playlistBuildJobs.start({
      jobId,
      accountId: user.id,
      run: async (reportProgress) => {
        const result = await buildPlaylist(input, sdk, {
          onProgress: reportProgress,
        });
        return { playlistId: result.playlist.id };
      },
      mapError: (error) =>
        error instanceof PlaylistCreationResidualError
          ? {
              kind: "residual",
              message:
                "Spotify may have left a partial playlist in your library. Check Spotify before retrying.",
            }
          : {
              kind: "failed",
              message:
                "The playlist could not be built. Your selection is unchanged—please try again.",
            },
    });

    if (started.status === "conflict") {
      return Response.json(
        { error: "A playlist build is already running" },
        { status: 409 }
      );
    }
    if (started.status === "forbidden") {
      return Response.json(
        { error: "Playlist build is unavailable" },
        { status: 409 }
      );
    }

    return (
      createPlaylistBuildUIMessageResponse(jobId, user.id) ??
      Response.json(
        { error: "Playlist build is unavailable" },
        { status: 500 }
      )
    );
  } catch (error) {
    return apiErrorResponse(error, "Failed to build playlist");
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

export type BuildPlaylistResult = Awaited<ReturnType<typeof buildPlaylist>>;

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}
