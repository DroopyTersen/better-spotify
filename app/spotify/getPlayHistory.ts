import { RecentlyPlayedTracksPage } from "@spotify/web-api-ts-sdk";
import { SpotifySdk } from "./createSpotifySdk";
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
  let before: string | undefined = options?.before;
  let after: string | undefined = options?.after;
  console.log("🚀 | hasMorePages:", hasMorePages);
  while (hasMorePages) {
    // Add 'before' parameter if we have a timestamp from previous iteration
    if (before) {
      // Convert ISO timestamp to Unix timestamp in milliseconds
      const beforeTimestamp = new Date(before).getTime();
      params.set("before", beforeTimestamp.toString());
    }
    if (after) {
      params.set("after", after);
    }

    console.log("🚀 | params:", params.toString());
    // const page = await sdk.player.getRecentlyPlayedTracks(LIMIT, {
    //   timestamp: "",
    //   type: "b"
    // });
    const page = await sdk.makeRequest<RecentlyPlayedTracksPage>(
      "GET",
      `me/player/recently-played?${params.toString()}`
    );
    console.log("🚀 | page:", page);

    allTracks.push(...page.items);

    // If we got fewer items than requested, we've reached the end
    if (page.items.length < LIMIT) {
      hasMorePages = false;
    } else {
      // Get timestamp of oldest track for next page request
      // Convert to milliseconds and subtract 1 to avoid duplicates
      before = page.items[page.items.length - 1].played_at;
    }
    console.log("🚀 | hasMorePages:", hasMorePages);
  }
  console.log("🚀 | allTracks:", allTracks);

  return allTracks;
};
