import type { DeepPartial } from "ai";
import { z } from "zod";
import {
  generateStructuredObject,
  type StructuredGenerationRequest,
} from "./aiGeneration.server";
import type { GeneratePlaylistInput } from "./playlistBuilder.types";

const PlaylistTrackResponse = z.object({
  id: z
    .string()
    .describe(
      "A supplied Spotify track ID, or an empty string when no verified ID was supplied"
    ),
  name: z.string().trim().min(1).max(500).describe("Track name"),
  artist_name: z.string().trim().min(1).max(500).describe("Artist name"),
});

export const PlaylistCurationResponse = z.object({
  playlist: z.object({
    name: z
      .string()
      .trim()
      .min(1)
      .max(500)
      .describe("A concise, creative playlist name"),
    tracks: z.array(PlaylistTrackResponse).min(1),
  }),
});

export type PlaylistCurationResponse = z.infer<typeof PlaylistCurationResponse>;

export function createPlaylistCurationResponseSchema(songCount: number) {
  if (!Number.isInteger(songCount) || songCount < 1) {
    throw new Error("songCount must be a positive integer");
  }

  return PlaylistCurationResponse.extend({
    playlist: PlaylistCurationResponse.shape.playlist.extend({
      tracks: z.array(PlaylistTrackResponse).length(songCount),
    }),
  });
}

type PlaylistGenerator = (
  request: StructuredGenerationRequest<PlaylistCurationResponse>
) => Promise<PlaylistCurationResponse>;

export const generatePlaylist = async (
  input: GeneratePlaylistInput,
  generate: PlaylistGenerator = generateStructuredObject,
  onPartialOutput?: (partialOutput: DeepPartial<PlaylistCurationResponse>) => void
) => {
  return generate({
    instructions: PLAYLIST_CURATION_INSTRUCTIONS,
    prompt: buildPlaylistPrompt(input),
    schema: createPlaylistCurationResponseSchema(input.formData.songCount),
    onPartialOutput,
  });
};

export function buildPlaylistPrompt(input: GeneratePlaylistInput): string {
  const sections = [
    `Create a playlist with exactly ${input.formData.songCount} songs.\nNew versus familiar distribution: ${input.formData.newStuffAmount}.`,
  ];

  if (input.formData.customInstructions?.trim()) {
    sections.push(
      `<custom_instructions>\n${input.formData.customInstructions.trim()}\n</custom_instructions>`
    );
  }

  if (input.data.selectedTracks.length > 0) {
    sections.push(`<selected_tracks>
${input.data.selectedTracks
  .map(
    (track) =>
      `${track.track_id} | ${track.track_name ?? ""} | ${
        track.artist_name ?? ""
      }`
  )
  .join("\n")}
</selected_tracks>`);
  }

  if (input.data.selectedArtists.length > 0) {
    sections.push(`<selected_artists>
${input.data.selectedArtists
  .map((artist) => artist.artist_name)
  .filter(Boolean)
  .join("\n")}
</selected_artists>`);
  }

  sections.push(`<familiar_songs_pool>
${JSON.stringify({
  liked_tracks: input.data.familiarSongsPool?.likedTracks ?? [],
  top_tracks: input.data.familiarSongsPool?.topTracks ?? [],
  artist_catalogs: input.data.familiarSongsPool?.artistCatalogs ?? [],
})}
</familiar_songs_pool>`);

  if (input.newSongs.length > 0) {
    sections.push(`<new_songs_pool>
${input.newSongs
  .map((song) => `${song.id} | ${song.name} | ${song.artist_name ?? ""}`)
  .join("\n")}
</new_songs_pool>`);
  }

  return sections.join("\n\n");
}

const PLAYLIST_CURATION_INSTRUCTIONS = `You are a professional music curator. Create one cohesive playlist that follows the user's requested vibe and uses referenced artists and tracks as style anchors.

Selection rules:
- Return exactly the requested number of unique tracks.
- For "none", use only familiar songs. For "sprinkle", use about 20% new songs. For "half", use about 50% new songs. For "all", use only new songs and treat selected familiar tracks and artists as style references rather than required inclusions.
- Unless the distribution is "all", include every selected track and at least one track by every selected artist when the supplied pools make that possible.
- Prioritize liked tracks among familiar choices.
- Keep the requested genre, mood, energy, and instrumentation coherent. Do not add unrelated music merely for variety.
- Avoid duplicate tracks, avoid adjacent tracks by the same artist, and normally use no more than three tracks by one new artist.
- Order the songs for a natural musical flow while distributing selected and new material throughout.
- Only return a non-empty Spotify ID when that exact ID appears in a supplied pool or selected track. Never invent an ID; use an empty string for any otherwise suitable track.
- If the user supplied only custom instructions and no usable song pools, choose fitting tracks from your music knowledge and leave their IDs empty.
- Give the playlist a concise name.`;
