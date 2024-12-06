import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";

import { generateObject } from "ai";
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

export const generateArtistRecommendations = async (input: {
  artistsToMatch: string[];
  artistsToExclude: string[];
  customInstructions?: string;
  desiredArtistCount?: number;
}) => {
  const userPrompt = `Please recommend ${
    input.desiredArtistCount || 10
  } artists similar to: \n\n${input.artistsToMatch.join("\n")}

DO NOT include these artists: \n\n${input.artistsToExclude.join("\n")}

${
  input.customInstructions
    ? `Additional instructions: ${input.customInstructions}`
    : ""
}`;

  console.log("userPrompt", userPrompt);

  const result = await generateObject({
    // model: openai("gpt-4o", { structuredOutputs: true }),
    model: anthropic("claude-3-5-sonnet-20241022"),

    schema: ArtistRecommendationsResponse,
    messages: [
      {
        role: "system",
        content: ARTIST_RECOMMENDATION_PROMPT,
      },
      {
        role: "user",
        content: userPrompt,
      },
    ],
  });

  console.log(
    "🚀 | result.object.recommended_artists:",
    result.object.recommended_artists
  );
  return result.object.recommended_artists;
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

Your response must be valid JSON matching the schema provided. Focus on quality over quantity in your recommendations.`;
