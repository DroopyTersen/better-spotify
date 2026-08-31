import { z } from "zod";
import type { DeepPartial } from "ai";
import {
  generateStructuredObject,
  type StructuredGenerationRequest,
} from "./aiGeneration.server";
import type { PlaylistModificationInput } from "./playlistBuilder.types";

export const PlaylistModificationSchema = z.object({
  modifiedPlaylist: z.object({
    name: z.string().trim().min(1).max(500),
    tracks: z
      .array(
        z.object({
          id: z
            .string()
            .describe(
              "The supplied Spotify ID for an existing track, or an empty string for a new track"
            ),
          name: z.string().trim().min(1).max(500),
          artist_name: z.string().trim().min(1).max(500),
        })
      )
      .min(1)
      .max(100),
  }),
});

export type PlaylistModification = z.infer<
  typeof PlaylistModificationSchema
>;

type PlaylistModificationGenerator = (
  request: StructuredGenerationRequest<PlaylistModification>
) => Promise<PlaylistModification>;

/** Generates a modified playlist from natural-language instructions. */
export const generatePlaylistModification = async (
  input: PlaylistModificationInput,
  generate: PlaylistModificationGenerator = generateStructuredObject,
  onPartialOutput?: (partialOutput: DeepPartial<PlaylistModification>) => void
) => {
  return generate({
    instructions: PLAYLIST_MODIFICATION_INSTRUCTIONS,
    prompt: buildModificationPrompt(input),
    schema: PlaylistModificationSchema,
    onPartialOutput,
  });
};

export function buildModificationPrompt(
  input: PlaylistModificationInput
): string {
  return `<modification_instructions>
${input.instructions.trim()}
</modification_instructions>

<current_playlist>
${input.currentTracks
  .map((track) => `${track.id} | ${track.name} | ${track.artist_name}`)
  .join("\n")}
</current_playlist>`;
}

const PLAYLIST_MODIFICATION_INSTRUCTIONS = `You are a professional music curator. Apply the requested changes and return the complete final playlist in its intended order.

Requirements:
- Correctly handle additions, removals, substitutions, and reordering.
- Preserve the playlist's core vibe unless the user explicitly asks to change it.
- Maintain natural transitions and avoid adjacent tracks by the same artist.
- Keep all unaffected tracks unless the request requires removing them.
- Preserve the supplied Spotify ID exactly for every retained existing track.
- For a newly suggested track, use an empty ID. Never invent a Spotify ID; the application will resolve new tracks through Spotify.
- Return at least one track and give the resulting playlist a concise name.`;
