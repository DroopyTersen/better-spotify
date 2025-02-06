import { z } from "zod";
import { google } from "@ai-sdk/google";
import { generateObject } from "ai";
import { PlaylistModificationInput } from "./playlistBuilder.types";

const PlaylistModificationSchema = z.object({
  _01_thought: z
    .string()
    .describe(
      "First restate the user's modification request in your own words. Then explain your thought process on how you will modify the playlist to meet their request."
    ),
  _02_modification_strategy: z
    .string()
    .describe(
      "Detailed explanation of how you'll modify the playlist, including which tracks to keep, remove, add, or reorder"
    ),
  _03_strategy_review: z
    .string()
    .describe(
      "Review your modification strategy. Consider: Are you maintaining good transitions? Have you preserved the core vibe? Are similar artists well distributed?"
    ),
  modifiedPlaylist: z.object({
    name: z.string(),
    tracks: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        artist_name: z.string(),
      })
    ),
  }),
});
/**
 * Generates a modified playlist based on natural language instructions
 */
export const generatePlaylistModification = async (
  input: PlaylistModificationInput
) => {
  const result = await generateObject({
    model: google("gemini-2.0-flash"),
    schema: PlaylistModificationSchema,
    messages: [
      {
        role: "system",
        content: PLAYLIST_MODIFICATION_PROMPT,
      },
      {
        role: "user",
        content: buildModificationMessage(input),
      },
    ],
  });
  console.log(
    "🚀 | generatePlaylistModification | result:",
    JSON.stringify(result.object, null, 2)
  );
  return result.object;
};

const buildModificationMessage = (input: PlaylistModificationInput): string => {
  return `Please modify this playlist according to these instructions: "${
    input.instructions
  }"

Current playlist tracks:
${input.currentTracks
  .map((track) => `${track.name} by ${track.artist_name}`)
  .join("\n")}`;
};

const PLAYLIST_MODIFICATION_PROMPT = `You are a professional music curator tasked with modifying an existing playlist based on natural language instructions. Your goal is to interpret the user's modification request and return a complete, modified playlist that incorporates their changes.

MODIFICATION PROCESS:
1. Analyze the Request:
   - Clearly understand what changes are being requested
   - Identify which tracks should be affected
   - Determine if the core playlist vibe should change

2. Plan Modifications:
   - Document your strategy for implementing changes
   - Consider impact on playlist flow and transitions
   - Plan track ordering to maintain energy progression

3. Review Strategy:
   - Verify changes align with user request
   - Check for good track distribution
   - Ensure transitions remain smooth
   - Validate core vibe preservation (unless change requested)

MODIFICATION TYPES TO SUPPORT:
1. Adding songs:
   - By specific artists
   - With specific characteristics (tempo, mood, etc.)
   - Similar to existing songs

2. Removing songs:
   - By specific artists
   - With specific characteristics

3. Reordering songs:
   - Improving flow and transitions
   - Grouping similar songs
   - Creating better energy progression

GUIDELINES:
- Preserve the playlist's core vibe unless explicitly instructed otherwise
- Return the complete final playlist with desired track order
- Explain your modification strategy clearly
- Don't cluster songs by the same artist
- Maintain good transitions between songs

OUTPUT REQUIREMENTS:
- Provide detailed chain-of-thought explanation
- Return complete modified playlist with all tracks in desired order
- Include Spotify track IDs for all tracks
- Maintain original tracks where appropriate`;
