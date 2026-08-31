import { RecentlyPlayedTracksPage } from "@spotify/web-api-ts-sdk";
import { SpotifySdk } from "../createSpotifySdk";
import { Prettify } from "~/toolkit/utils/typescript.utils";

export type RecentlyPlayedTrack = Prettify<
  RecentlyPlayedTracksPage["items"][number]
>;

type PlayHistoryOptions = {
  maxLimit?: number;
  before?: string;
  after?: string;
};

const loadPlayHistory = async (
  sdk: SpotifySdk,
  options?: PlayHistoryOptions,
  maxRequests = Number.POSITIVE_INFINITY
) => {
  const allTracks: RecentlyPlayedTrack[] = [];
  const maxLimit = options?.maxLimit ?? 200;
  if (!Number.isSafeInteger(maxLimit) || maxLimit < 1) {
    throw new RangeError("maxLimit must be a positive safe integer");
  }
  if (options?.before && options.after) {
    throw new Error("before and after cannot both be provided");
  }

  const params = new URLSearchParams({ limit: "50" });
  if (options?.before) params.set("before", parseCursor(options.before));
  if (options?.after) params.set("after", parseCursor(options.after));

  let requestPath = `me/player/recently-played?${params}`;
  const seenPaths = new Set<string>();
  let requestCount = 0;

  while (
    requestPath &&
    allTracks.length < maxLimit &&
    requestCount < maxRequests
  ) {
    if (seenPaths.has(requestPath)) {
      throw new Error("Spotify play-history pagination repeated a page");
    }
    seenPaths.add(requestPath);

    const page = await sdk.makeRequest<RecentlyPlayedTracksPage>(
      "GET",
      requestPath
    );
    requestCount += 1;
    if (!page || !Array.isArray(page.items)) {
      throw new Error("Spotify returned an invalid play-history page");
    }
    if (page.items.length > 50) {
      throw new Error("Spotify play-history page exceeded the requested limit");
    }

    allTracks.push(...page.items);
    if (page.next && page.items.length === 0) {
      throw new Error("Spotify play-history pagination stalled");
    }
    requestPath = page.next ? toSpotifyApiPath(page.next) : "";
  }

  if (requestPath && seenPaths.has(requestPath)) {
    throw new Error("Spotify play-history pagination repeated a page");
  }

  return { allTracks, maxLimit, requestPath };
};

export const getPlayHistory = async (
  sdk: SpotifySdk,
  options?: PlayHistoryOptions & { requireComplete?: boolean }
) => {
  const { allTracks, maxLimit, requestPath } = await loadPlayHistory(
    sdk,
    options
  );
  if (options?.requireComplete && (requestPath || allTracks.length > maxLimit)) {
    throw new RangeError(
      `Spotify returned more than ${maxLimit} play-history items`
    );
  }

  return allTracks.slice(0, maxLimit);
};

export const getPlayHistoryWindow = async (
  sdk: SpotifySdk,
  options: PlayHistoryOptions
) => {
  const maxLimit = options.maxLimit ?? 500;
  if (maxLimit % 50 !== 0) {
    throw new RangeError(
      "Play-history windows must align to Spotify's 50-item pages"
    );
  }
  const result = await loadPlayHistory(
    sdk,
    { ...options, maxLimit },
    maxLimit / 50
  );
  if (result.allTracks.length > maxLimit) {
    throw new RangeError("Spotify play-history page exceeded its bounded window");
  }
  return {
    items: result.allTracks,
    nextBefore: result.requestPath
      ? getBeforeCursor(result.requestPath)
      : null,
  };
};

function parseCursor(cursor: string): string {
  if (!/^\d+$/.test(cursor)) {
    throw new Error("Spotify play-history cursors must be Unix milliseconds");
  }
  return cursor;
}

function toSpotifyApiPath(nextUrl: string): string {
  const url = new URL(nextUrl);
  if (
    url.origin !== "https://api.spotify.com" ||
    url.pathname !== "/v1/me/player/recently-played"
  ) {
    throw new Error("Spotify returned an invalid play-history pagination URL");
  }
  return `${url.pathname.slice("/v1/".length)}${url.search}`;
}

function getBeforeCursor(requestPath: string): string {
  const url = new URL(requestPath, "https://api.spotify.com/v1/");
  const before = url.searchParams.get("before");
  if (url.pathname !== "/v1/me/player/recently-played" || !before) {
    throw new Error(
      "Spotify play-history continuation did not provide a before cursor"
    );
  }
  return parseCursor(before);
}
