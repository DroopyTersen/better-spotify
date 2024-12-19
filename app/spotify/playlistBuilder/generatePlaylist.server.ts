import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { generateObject, streamObject } from "ai";
import { z } from "zod";
import { GeneratePlaylistInput } from "./playlistBuilder.types";

export const PlaylistCurationResponse = z.object({
  _01_thought: z
    .string()
    .describe(
      "First restate the user's playlist request in your own words. Then explain your thought process on how you will curate the playlist to meet the request. Do not cluster songs by the same artist together. Try to sprinkle new stuff in the middle of familiar stuff."
    ),
  _02_track_name_candidates: z
    .array(z.string())
    .describe(
      "Array of track names followed by artist names that you think could be good for the playlist. Format as <track_name> | <artist_name>. Don't cluster songs by the same artist together."
    ),
  _03_track_name_candidate_review: z
    .string()
    .describe(
      "A review of the track_name_candidates array. Explain why you included or excluded certain tracks. Do not cluster songs by the same artist together. Try to sprinkle new stuff in the middle of familiar stuff."
    ),
  playlist: z.object({
    name: z.string().describe("2-3 word creative name for the playlist"),
    tracks: z
      .array(
        z.object({
          id: z.string().describe("Spotify track ID"),
          name: z.string().describe("Track name"),
          artist_name: z.string().describe("Artist name"),
        })
      )
      .describe(
        "Finalized sorted array of tracks to include in the playlist. The length should match the desired number of songs."
      ),
  }),
});

export type PlaylistCurationResponse = z.infer<typeof PlaylistCurationResponse>;

export const generatePlaylist = async (input: GeneratePlaylistInput) => {

  let stream = streamObject({
    model: google("gemini-2.0-flash-exp"),
    schema: PlaylistCurationResponse,
    messages: [
      {
        role: "system",
        content: PLAYLIST_CURATION_PROMPT,
      },
      {
        role: "user",
        content: `Please create me a playlist with ${
          input.formData.songCount
        } songs total.

Distribution of new vs familiar music: ${input.formData.newStuffAmount}
${
  input.formData.customInstructions
    ? `\nCustom Instructions: ${input.formData.customInstructions}`
    : ""
}

The user has specified these tracks should be included:
<selected_tracks>
${input.data.selectedTracks
  .map((t) => `${t.track_id} - ${t.track_name} by ${t.artist_name}`)
  .join("\n")}
</selected_tracks>

The user has specified these artists should be included:
<selected_artists>
${input.data.selectedArtists.map((a) => a.artist_name).join("\n")}
</selected_artists>

Here are the songs you can choose from:

<familiar_songs_pool>
${JSON.stringify(
  {
    liked_tracks: input.data.familiarSongsPool?.likedTracks,
    top_tracks: input.data.familiarSongsPool?.topTracks,
    artist_catalogs: input.data.familiarSongsPool?.artistCatalogs,
  },
  null,
  2
)}
</familiar_songs_pool>

<new_songs_pool>
${input.newSongs
  .map(
    (song) =>
      `${song.id} - ${song.name} by ${song.artist_name} Popularity: ${song.popularity}`
  )
  .join("\n")}
</new_songs_pool>`,
      },
    ],
  });

  for await (const chunk of stream.partialObjectStream) {
    console.log(chunk);
  }
  return stream.object;
};

const PLAYLIST_CURATION_PROMPT = `You are a professional music curator with deep knowledge of music genres, artists, and song relationships. Your task is to create a cohesive playlist that balances familiar and new music while following specific guidelines.

DISTRIBUTION GUIDELINES:
Based on the newStuffAmount parameter:
- "none": Use only familiar songs
- "sprinkle": ~20% new songs, 80% familiar
- "half": ~50% new songs, 50% familiar
- "all": Use ENTIRELY new songs. Even disregard the specified tracks.

CURATION GUIDELINES:
1. Song Selection:
   - Must include all specified tracks, but distribute them throughout the playlist
   - Start with a randomly chosen specified track to hook the listener
   - For familiar songs:
     * Prioritize tracks from the user's liked_tracks pool
     * Include at least one song from each specified artist
   - For new songs:
     * Select tracks that complement the familiar songs' style
     * Prioritize tracks with higher popularity scores (>30)
     * Aim for variety in new artists (2-3 songs per new artist maximum)

2. Song Order:
   - Create a natural flow considering:
     * Energy levels
     * Genre compatibility
     * Tempo transitions
   - Distribute specified tracks throughout the playlist (don't cluster them)
   - Alternate between familiar and new songs based on newStuffAmount
   - Don't cluster songs by the same artist together
   - End with an impactful song (either familiar or new)

REQUIRED OUTPUT FORMAT:
{
  "thought": "Explain your understanding of the request and curation approach",
  "track_name_candidates": ["<track_name> | <artist_name>"],
  "track_name_candidate_review": "Review of your selection process",
  "playlist": {
    "name": "2-3 word creative name",
    "tracks": [{"id": "spotify_id", "name": "track_name", "artist_name": "artist_name"}]
  }
}

IMPORTANT:
- Only select from provided song pools
- Follow the newStuffAmount distribution guideline
- Keep playlist name concise (2-3 words)
- Response must be valid JSON
- Don't cluster same artists together
- Distribute specified tracks throughout the playlist
- Prioritize liked_tracks for familiar songs`;
