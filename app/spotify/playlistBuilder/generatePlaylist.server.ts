import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { generateObject, streamObject } from "ai";

import { z } from "zod";
import { GeneratePlaylistInput } from "./playlistBuilder.types";

export const PlaylistCurationResponse = z.object({
  thought: z
    .string()
    .describe(
      "First restate the user's playlist request in your own words. Then explain your thought process on how you will curate the playlist to meet the request. Do not cluster songs by the same artist together. Try to sprinkle new stuff in the middle of familiar stuff."
    ),
  track_name_candidates: z
    .array(z.string())
    .describe(
      "Array of track names followed by artist names that you think could be good for the playlist. Format as <track_name> | <artist_name>. Don't cluster songs by the same artist together."
    ),
  track_name_candidate_review: z
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

export const generatePlaylist = async (
  playlistRequest: GeneratePlaylistInput
) => {
  const llmStartTime = performance.now();
  let stream = streamObject({
    model: openai("gpt-4o", { structuredOutputs: true }),
    // model: anthropic("claude-3-5-sonnet-20241022"),
    schema: PlaylistCurationResponse,

    messages: [
      {
        role: "system",
        content: PLAYLIST_CURATION_PROMPT,
      },
      {
        role: "user",
        content: `Please create me a playlist with ${
          playlistRequest.request.numSongs
        } songs total. ${
          playlistRequest.distribution.numFamiliarSongs
        } of them should be familiar songs and ${
          playlistRequest.distribution.numNewSongs
        } of them should be new songs.

NumSongs: ${playlistRequest.request.numSongs}
NewArtistsRatio: ${playlistRequest.request.newArtistsRatio}
  - FamiliarSongs: ${playlistRequest.distribution.numFamiliarSongs}
  - NewSongs: ${playlistRequest.distribution.numNewSongs}

${playlistRequest.request?.instructions}

The user has specified the following tracks Ids should be included in the playlist:
${playlistRequest.request.trackIds.join("\n ")}

The user has specified the following artists Ids should be included in the playlist:
${playlistRequest.request.artistIds.join("\n ")}

The user's Spotify Top Artists are. You should NOT use any of these artists when selecting fresh new songs.
<top_artists>
${playlistRequest.topArtists.join(", ")}
</top_artists>

Here are the songs you can choose from:
<familiar_song_options>
${JSON.stringify(playlistRequest.familiarOptions, null, 2)}
</familiar_song_options>

<new_song_options>
${JSON.stringify(playlistRequest.newOptions, null, 2)}
</new_song_options>
        `,
      },
    ],
  });

  for await (const chunk of stream.partialObjectStream) {
    console.log(chunk);
  }
  return stream.object;
};
const PLAYLIST_CURATION_PROMPT = `You are a professional music curator with deep knowledge of music genres, artists, and song relationships. Your task is to create a cohesive playlist from two pools of songs, familiar songs and new songs, while following specific guidelines.

Your goal is to create an amazing playlist that the user will love that matches the vibe they are going for while also introducing them to fresh music.

INPUT FORMAT:
You will receive:
1. A familiar songs pool containing:
   - Specified tracks (must be included)
   - Top tracks from specified artists
   - Liked tracks from specified artists 
   - Artist catalogs
2. A new songs pool with tracks from similar artists and recommendations
3. Parameters:
   - numSongs: Total number of songs needed
   - newArtistsRatio: Ratio of new vs familiar songs (e.g., 0.3 = 30% new songs)

DISTRIBUTION GUIDELINES:
1. New vs Familiar Songs (newArtistsRatio):
   - If newArtistsRatio is 0.3 and numSongs is 30:
     * Include 9 songs (30%) from the new songs pool
     * Include 21 songs (70%) from the familiar songs pool
   - Higher ratios (0.4-0.6) mean user wants more musical discovery
   - Lower ratios (0.1-0.3) mean user wants to stick closer to known artists

CURATION GUIDELINES:
1. Song Selection:
   - ALWAYS include all specified tracks first
   - For familiar songs:
     * HEAVILY prioritize tracks from the user's liked_tracks pool
     * Ensure artist variety by not clustering songs from the same artist
     * Try to include at least one song from each specified artist
   - For new songs:
     * Select tracks that complement the familiar songs' style and energy
     * Prioritize tracks with higher popularity scores (>30) for better accessibility
     * Distribute across different similar artists to maximize discovery
     * Avoid selecting multiple songs from the same new artist
     * Try to provide a variety of new artists with 2 or 3 songs per new artists. More new artists is better than a bunch of songs from a single new artist.

2. Song Order:
   - Create a natural flow between songs considering:
     * Energy levels
     * Genre compatibility
     * Tempo transitions
   - Start with a familiar song to hook the listener
   - Strategically place new songs between familiar ones
   - End with a strong familiar song
   - Don't cluster all new or familiar songs together
   - Don't cluster songs by the same artist together

REQUIRED OUTPUT FORMAT:
You must respond with a JSON object matching this exact structure:
{
  "thought": "First restate the user's playlist request in your own words. Which tracks and artists has the user explicitly specified? What is the vibe of the specified tracks and artists?Which new artists might pair well with the specified artists and tracks? Then explain your thought process on how you will curate the playlist to meet the request.",
  "track_name_candidates": [
    "Array of track names that you think could be good for the playlist. These should be a mix of familiar and new songs based on the distribution guidelines. Don't cluster songs by the same artist together.",
  ],
  "track_name_candidate_review": "Your review of the track_name_candidates array. Explain why you included or excluded certain tracks. Does the track names you selected as candidates make sense for the playlist? Does the number or tracks match the desired number of songs?",
  "playlist": {
    "name": "2-3 word creative name capturing the playlist's essence. The shorter the better.",
    "tracks": [
      {
        "id": "spotify_track_id",
        "name": "Track name",
        "artist_name": "Artist name"
      }
    ]
  }
}

IMPORTANT:
- Only select tracks from the provided pools (familiarSongOptions and newSongOptions)
- Strictly maintain the requested distribution between familiar and new songs
- Ensure the playlist name is concise (2-3 words) and reflects the overall vibe
- Your response must be valid JSON
- Include your full thought process in the "thought" field
- Do not include any additional commentary outside the JSON structure
- Don't cluster songs by the same artist together
- Remember that liked_tracks are the highest priority when selecting familiar songs`;
