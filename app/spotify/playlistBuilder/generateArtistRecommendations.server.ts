import { google, GoogleGenerativeAIProviderMetadata } from "@ai-sdk/google";

import { generateObject, generateText } from "ai";
import { z } from "zod";

const ArtistRecommendationsResponse = z.object({
  thought: z
    .string()
    .describe(
      "Explain your thought process for recommending artists based on the input artists and any custom instructions"
    ),
  recommended_artists: z
    .array(z.string())
    .describe("Array of artist names that would complement the input artists"),
});
export const GenerateArtistRecommendationInput = z.object({
  artistsToMatch: z
    .array(z.string())
    .describe("Array of artist names to match"),
  artistsToExclude: z
    .array(z.string())
    .describe("Array of artist names to exclude"),
  customInstructions: z
    .string()
    .describe("Custom instructions for the artist recommendations")
    .optional(),
  desiredArtistCount: z
    .number()
    .describe("Desired number of artists to recommend"),
});
export type GenerateArtistRecommendationInput = z.infer<
  typeof GenerateArtistRecommendationInput
>;
export const generateArtistRecommendations = async (input: {
  artistsToMatch: string[];
  artistsToExclude: string[];
  customInstructions?: string;
  desiredArtistCount?: number;
}) => {
  const desiredArtistCount = (input.desiredArtistCount || 10) + 1;
  const userPrompt = `Please recommend ${
    input.desiredArtistCount || 10
  } artists similar to: \n\n${input.artistsToMatch.join("\n")}

DO NOT recommend these artists because the user already listens to them and we are looking for fresh new artist recommendations: 
<artists_to_exclude>
${input.artistsToExclude.join("\n")}
</artists_to_exclude>

${
  input.customInstructions
    ? `The user has provided the following additional instructions regarding the playlist and artist recommendations they are striving for: ${input.customInstructions}`
    : ""
}`;
  console.log("🚀 | userPrompt:", userPrompt);

  // Generate random temperature between 0.2 and 1.2
  const temperature = Math.random() * (1.2 - 0.2) + 0.2;

  let result2 = await generateObject({
    model: google("gemini-2.0-flash"),
    schema: ArtistRecommendationsResponse,
    temperature,
    prompt: ARTIST_RECOMMENDATION_PROMPT + "\n\n" + userPrompt,
  });
  let recommendedArtists = result2.object.recommended_artists.filter(
    (artist) => !input.artistsToExclude.includes(artist)
  );
  console.log("🚀 | recommendedArtists:", result2.usage, recommendedArtists);

  return recommendedArtists;
};

const ARTIST_RECOMMENDATION_PROMPT = `You are a music expert with deep knowledge of artists across all genres and eras. Your task is to recommend artists that would complement a given set of artists while following specific guidelines.

GUIDELINES:
1. NEVER recommend artists that are in the exclude list
2. NEVER recommend artists that are in the input list
3. Provide exactly the number of artists requested in the prompt (defaults to 10 if not specified)
4. Focus on artists that capture similar:
   - Musical style
   - Energy levels
   - Genre elements
   - Emotional resonance
5. If the input artists span multiple genres:
   - Recommend artists that represent each genre
   - Find artists that bridge between the genres
6. Prioritize artists that:
   - Are well-established enough to have a solid catalog
   - Have a distinctive sound that complements the input artists
   - Would sound natural on a playlist with the input artists
7. Provide variety in your recommendations:
   - Mix established and newer artists
   - Include artists from different eras
   - Balance mainstream and indie artists
8. Please use Google Search to find the most relevant artists.


Your response must be valid JSON matching the schema provided. Focus on quality over quantity in your recommendations.`;
