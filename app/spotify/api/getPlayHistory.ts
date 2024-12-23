import { RecentlyPlayedTracksPage } from "@spotify/web-api-ts-sdk";
import { SpotifySdk } from "../createSpotifySdk";
import { Prettify } from "~/toolkit/utils/typescript.utils";

export type RecentlyPlayedTrack = Prettify<
  RecentlyPlayedTracksPage["items"][number]
>;
export const getPlayHistory = async (
  sdk: SpotifySdk,
  options?: {
    maxLimit?: number;
    before?: string;
    after?: string;
  }
) => {
  const allTracks: RecentlyPlayedTrack[] = [];
  const LIMIT = 50; // Maximum allowed by Spotify API
  const MAX_LIMIT = options?.maxLimit ?? 200;
  let params = new URLSearchParams({
    limit: LIMIT.toString(),
  });

  let hasMorePages = true;
  let after: string | undefined = options?.after || "2000-01-01";

  while (hasMorePages && allTracks.length < MAX_LIMIT) {
    if (after) {
      params.set("after", after);
    }
    console.log("🚀 | params:", Object.fromEntries(params), options);

    // const page = await sdk.player.getRecentlyPlayedTracks(LIMIT, {
    //   timestamp: "",
    //   type: "b"
    // });
    const page = await sdk.makeRequest<RecentlyPlayedTracksPage>(
      "GET",
      `me/player/recently-played?${params.toString()}`
    );

    allTracks.push(...page.items);

    if (page.items.length < LIMIT) {
      hasMorePages = false;
    } else {
      // Get timestamp of oldest track for next page request
      after = page.items[page.items.length - 1].played_at;
    }
  }

  return allTracks;
};
