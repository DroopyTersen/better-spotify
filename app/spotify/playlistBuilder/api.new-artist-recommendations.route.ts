import { requireAuth } from "~/auth/auth.server";
import { createSpotifySdk } from "../createSpotifySdk";
import type { Route } from "./+types/api.new-artist-recommendations.route";
import {
  findExactArtistNameMatch,
  generateArtistRecommendations,
  normalizeArtistName,
} from "./generateArtistRecommendations.server";
import { apiErrorResponse, parseJsonMutation } from "./apiRequest.server";
import { ArtistRecommendationRequestSchema } from "./apiRequestSchemas";
import { mapWithConcurrency } from "../api/mapWithConcurrency";

const MAX_ARTIST_RECOMMENDATION_BODY_BYTES = 64 * 1024;
const ARTIST_SEARCH_CONCURRENCY = 5;

export const action = async ({ request }: Route.ActionArgs) => {
  const user = await requireAuth(request);

  try {
    const input = await parseJsonMutation(
      request,
      ArtistRecommendationRequestSchema,
      MAX_ARTIST_RECOMMENDATION_BODY_BYTES
    );
    const sdk = createSpotifySdk(user.tokens);
    const recommendedNewArtists = await generateArtistRecommendations(input);
    const blockedArtistNames = new Set(
      [...input.artistsToMatch, ...input.artistsToExclude].map(
        normalizeArtistName
      )
    );
    const artists = await mapWithConcurrency(
      recommendedNewArtists,
      ARTIST_SEARCH_CONCURRENCY,
      async (artistName) => {
        const artistResults = await sdk.search(
          `artist:${JSON.stringify(artistName.trim())}`,
          ["artist"],
          "US",
          10
        );
        const fullArtist = findExactArtistNameMatch(
          artistResults.artists.items,
          artistName
        );
        if (!fullArtist) return null;
        return {
          artist_id: fullArtist.id,
          artist_name: fullArtist.name,
          images: fullArtist.images,
        };
      }
    );

    const seenArtistIds = new Set<string>();
    return Response.json(
      artists.filter((artist): artist is NonNullable<typeof artist> => {
        if (
          !artist?.artist_id ||
          blockedArtistNames.has(normalizeArtistName(artist.artist_name)) ||
          seenArtistIds.has(artist.artist_id)
        ) {
          return false;
        }
        seenArtistIds.add(artist.artist_id);
        return true;
      })
    );
  } catch (error) {
    return apiErrorResponse(error, "Failed to recommend artists");
  }
};
