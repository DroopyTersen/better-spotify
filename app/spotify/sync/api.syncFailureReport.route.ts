import { z } from "zod";
import { requireAuth } from "~/auth/auth.server";
import type { Route } from "./+types/api.syncFailureReport.route";
import { apiErrorResponse, parseJsonMutation } from "../playlistBuilder/apiRequest.server";
import {
  SPOTIFY_SYNC_FAILURE_KINDS,
  SPOTIFY_SYNC_STAGES,
} from "./syncFailure";

const MAX_SYNC_FAILURE_REPORT_BYTES = 2 * 1024;

const SyncFailureReportSchema = z.object({
  reportId: z.uuid(),
  mode: z.enum(["full", "incremental"]),
  failure: z.object({
    stage: z.enum(SPOTIFY_SYNC_STAGES),
    kind: z.enum(SPOTIFY_SYNC_FAILURE_KINDS),
    status: z.number().int().min(100).max(599).nullable(),
  }),
});

export const action = async ({ request }: Route.ActionArgs) => {
  await requireAuth(request);
  try {
    const report = await parseJsonMutation(
      request,
      SyncFailureReportSchema,
      MAX_SYNC_FAILURE_REPORT_BYTES
    );
    console.info("Spotify sync failure", JSON.stringify(report));
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiErrorResponse(error, "Failed to record sync status");
  }
};
