import { z } from "zod";
import {
  generateStructuredObject,
  type StructuredGenerationRequest,
} from "./aiGeneration.server";

const DEFAULT_ARTIST_COUNT = 10;
const ARTIST_CANDIDATE_BUFFER = 3;

const ArtistRecommendationsResponse = z.object({
  recommended_artists: z.array(z.string().trim().min(1).max(200)).min(1),
});

type ArtistRecommendationsResponse = z.infer<
  typeof ArtistRecommendationsResponse
>;

export function createArtistRecommendationsResponseSchema(
  candidateCount: number
) {
  if (!Number.isInteger(candidateCount) || candidateCount < 1) {
    throw new Error("candidateCount must be a positive integer");
  }

  return ArtistRecommendationsResponse.extend({
    recommended_artists: z
      .array(z.string().trim().min(1).max(200))
      .length(candidateCount),
  });
}

export const GenerateArtistRecommendationInput = z.object({
  artistsToMatch: z.array(z.string().min(1)).min(1),
  artistsToExclude: z.array(z.string().min(1)),
  customInstructions: z
    .string()
    .describe("Custom instructions for the artist recommendations")
    .optional(),
  desiredArtistCount: z.number().int().positive(),
});

export type GenerateArtistRecommendationInput = z.infer<
  typeof GenerateArtistRecommendationInput
>;

type ArtistRecommendationRequest = Omit<
  GenerateArtistRecommendationInput,
  "desiredArtistCount"
> & {
  desiredArtistCount?: number;
};

type ArtistRecommendationGenerator = (
  request: StructuredGenerationRequest<ArtistRecommendationsResponse>
) => Promise<ArtistRecommendationsResponse>;

export const generateArtistRecommendations = async (
  input: ArtistRecommendationRequest,
  generate: ArtistRecommendationGenerator = generateStructuredObject
) => {
  const desiredArtistCount = getDesiredArtistCount(input.desiredArtistCount);
  const candidateCount = desiredArtistCount + ARTIST_CANDIDATE_BUFFER;
  const result = await generate({
    instructions: ARTIST_RECOMMENDATION_INSTRUCTIONS,
    prompt: buildArtistRecommendationPrompt(input, candidateCount),
    schema: createArtistRecommendationsResponseSchema(candidateCount),
  });

  return normalizeArtistRecommendations(
    result.recommended_artists,
    input,
    desiredArtistCount
  );
};

export function buildArtistRecommendationPrompt(
  input: ArtistRecommendationRequest,
  candidateCount =
    getDesiredArtistCount(input.desiredArtistCount) + ARTIST_CANDIDATE_BUFFER
): string {
  const sections = [
    `Recommend exactly ${candidateCount} candidate artists. The best ${getDesiredArtistCount(
      input.desiredArtistCount
    )} valid, unique recommendations will be used.`,
    `<artists_to_match>\n${input.artistsToMatch.join(
      "\n"
    )}\n</artists_to_match>`,
    `<artists_to_exclude>\n${input.artistsToExclude.join(
      "\n"
    )}\n</artists_to_exclude>`,
  ];

  if (input.customInstructions?.trim()) {
    sections.push(
      `<custom_instructions>\n${input.customInstructions.trim()}\n</custom_instructions>`
    );
  }

  return sections.join("\n\n");
}

export function normalizeArtistRecommendations(
  candidates: string[],
  input: Pick<
    ArtistRecommendationRequest,
    "artistsToMatch" | "artistsToExclude"
  >,
  desiredArtistCount: number
): string[] {
  const blockedArtists = new Set(
    [...input.artistsToMatch, ...input.artistsToExclude].map(normalizeArtistName)
  );
  const seen = new Set<string>();
  const recommendations: string[] = [];

  for (const candidate of candidates) {
    const trimmedCandidate = candidate.trim();
    const normalizedCandidate = normalizeArtistName(trimmedCandidate);
    if (
      !normalizedCandidate ||
      blockedArtists.has(normalizedCandidate) ||
      seen.has(normalizedCandidate)
    ) {
      continue;
    }

    seen.add(normalizedCandidate);
    recommendations.push(trimmedCandidate);

    if (recommendations.length === desiredArtistCount) {
      return recommendations;
    }
  }

  throw new Error(
    `Expected ${desiredArtistCount} unique artist recommendations, received ${recommendations.length}`
  );
}

function getDesiredArtistCount(desiredArtistCount?: number): number {
  const count = desiredArtistCount ?? DEFAULT_ARTIST_COUNT;
  if (!Number.isInteger(count) || count < 1) {
    throw new Error("desiredArtistCount must be a positive integer");
  }
  return count;
}

export function normalizeArtistName(name: string): string {
  return name.trim().toLocaleLowerCase();
}

export function findExactArtistNameMatch<TArtist extends { name: string }>(
  candidates: readonly TArtist[],
  expectedName: string
): TArtist | undefined {
  const normalizedExpectedName = normalizeArtistName(expectedName);
  return candidates.find(
    (candidate) => normalizeArtistName(candidate.name) === normalizedExpectedName
  );
}

const ARTIST_RECOMMENDATION_INSTRUCTIONS = `You are a music expert with broad knowledge of artists across genres and eras. Recommend artists that would sound natural alongside the supplied reference artists.

Requirements:
- Never recommend an artist from either supplied list.
- Return the exact number of candidate artists requested.
- Match musical style, energy, genre, instrumentation, and emotional tone.
- When the references span genres, cover those genres and include artists that bridge them naturally.
- Prefer artists with a meaningful catalog and a distinctive, complementary sound.
- Include a thoughtful mix of established and newer artists, eras, and mainstream and independent acts.
- Do not return duplicates or spelling variants of the same artist.`;
