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
  _02_track_name_candidates: z.string().describe(
    `Numbered list of track names followed by artist names that you think could be good for the playlist. Format as: 
1. <track_name> | <artist_name> 
2. <track_name> | <artist_name> 
3. <track_name> | <artist_name>
...

Don't cluster songs by the same artist together. Stop once you have reached the desired number of songs.`
  ),
  _03_track_name_candidate_review: z.string().describe(
    `A review of the track_name_candidates array. How could you improve the playlist based on the following guidelines:
- Do not cluster songs by the same artist together. 
- Try to sprinkle new stuff in the middle of familiar stuff. 
- Make sure the song count matches the desired number of songs. 
- Everything should be mixed up

Write suggestions on how to improve the playlist.`
  ),
  playlist: z.object({
    name: z.string().describe("2-3 word creative name for the playlist"),
    tracks: z
      .array(
        z.object({
          id: z
            .string()
            .describe(
              "Spotify track ID. Provide an empty string if you don't know the ID."
            ),
          name: z.string().describe("Track name"),
          artist_name: z.string().describe("Artist name"),
        })
      )
      .describe(
        "Finalized sorted array of tracks to include in the playlist. The final list of tracks should be chosen based on suggestions from the _03_track_name_candidate_review. The length should match the desired number of songs."
      ),
  }),
});

export type PlaylistCurationResponse = z.infer<typeof PlaylistCurationResponse>;

export const generatePlaylist = async (input: GeneratePlaylistInput) => {
  // Build user message
  const userMessage = buildUserMessage(input);

  // Log the message before sending to AI
  console.log("🎵 | Playlist Generation Input:", userMessage);

  let stream = streamObject({
    model: google("gemini-2.0-flash"),
    schema: PlaylistCurationResponse,
    messages: [
      {
        role: "system",
        content: PLAYLIST_CURATION_PROMPT,
      },
      {
        role: "user",
        content: userMessage,
      },
    ],
  });

  for await (const chunk of stream.partialObjectStream) {
    // todo: emit this to stream to client
    // console.log(chunk);
  }
  let result = await stream.object;
  console.log(
    "🚀 | generatePlaylist | stream.object:",
    result,
    JSON.stringify(result?.playlist?.tracks, null, 2)
  );

  return result;
};
function buildUserMessage(input: GeneratePlaylistInput): string {
  let message = `Please create me a playlist with ${input.formData.songCount} songs total.

Distribution of new vs familiar music: ${input.formData.newStuffAmount}`;

  if (input.formData.customInstructions) {
    message += `\nCustom Instructions: ${input.formData.customInstructions}`;
  }

  if (input.data.selectedTracks.length > 0) {
    message += `\n\nThe user has specified these tracks should be included:
<selected_tracks>
${input.data.selectedTracks
  .map((t) => `${t.track_id} - ${t.track_name} by ${t.artist_name}`)
  .join("\n")}
</selected_tracks>`;
  }

  if (input.data.selectedArtists.length > 0) {
    message += `\n\nThe user has specified these artists should be included:
<selected_artists>
${input.data.selectedArtists.map((a) => a.artist_name).join("\n")}
</selected_artists>`;
  }

  message += `\n\nHere are the songs you can choose from:

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
</familiar_songs_pool>`;

  if (input.newSongs.length > 0) {
    message += `\n<new_songs_pool>
${input.newSongs
  .map(
    (song) =>
      `${song.id} - ${song.name} by ${song.artist_name} Popularity: ${song.popularity}`
  )
  .join("\n")}
</new_songs_pool>`;
  }

  return message;
}

const PLAYLIST_CURATION_PROMPT = `You are a professional music curator with deep knowledge of music genres, artists, and song relationships. Your task is to create a cohesive playlist that strictly adheres to the requested vibe, style, and artist references provided by the user. If the user references certain artists, ensure the playlist consistently matches that genre, tone, and aesthetic, without deviating into unrelated artists or styles.

PRIMARY OBJECTIVE:
- Focus on the user's custom instructions and the specified vibe. For example, if the user references "Trampled by Turtles" and "The Devil Makes Three," the playlist should strongly reflect that style of music (e.g., modern bluegrass, folk, Americana) without veering into unrelated sounds or mainstream pop or indie that doesn't fit the specified vibe.
- If the user gives no explicit artists or tracks, still adhere closely to the described style or vibe in the custom instructions.

CORE PRINCIPLES:
- Stay true to the requested musical style - do not deviate for the sake of diversity
- If specific artists or tracks are mentioned, use them as style anchors to inform ALL other song choices
- Use the familiarSongsPool to inform your choices, but do not deviate from the requested style
- Match the energy, tempo, and instrumental characteristics of the reference points
- Do not add songs that significantly deviate from the core style, even if they're "related" genres


DISTRIBUTION GUIDELINES:
Based on the newStuffAmount parameter:
- "none": Use only familiar songs
- "sprinkle": ~20% new songs, 80% familiar
- "half": ~50% new songs, 50% familiar
- "all": Use ENTIRELY new songs. Even disregard the specified tracks.

HANDLING EMPTY SELECTIONS:
If both selectedTracks and selectedArtists arrays are empty:
- Focus on the custom instructions and user preferences.
- You are not limited by familiarSongsPool or newSongsPool (which will be empty or irrelevant in this scenario).
- Feel free to choose any tracks you think fit the user's custom instructions, even if they weren't provided.
- For these chosen tracks, since you don't have IDs, set "id" as an empty string. External processes will handle fetching correct track IDs later.

CURATION GUIDELINES:
1. Song Selection:
   - If selected tracks or artists are given, must include all specified tracks/artists (distribute them).
   - If none are given (both arrays empty), freely pick tracks you think fit, using empty string for track IDs.
   - Start with a randomly chosen specified track (if any) to hook the listener.
   - Maintain a natural sonic and thematic flow that consistently feels like the requested artists, tracks, or genre(s).
   - For familiar songs (if applicable):
     * Prioritize liked_tracks.
     * Include at least one song from each specified artist.
   - For new songs:
     * Select tracks that complement familiar songs' style.
     * Prioritize tracks with popularity >30.
     * Aim for variety (2-3 songs max per new artist).
     * Avoid selecting any songs from recentlyPlayedTracks, topTracks, or likedTracks.

2. Song Order:
   - Create a natural flow (energy, genre, tempo).
   - Distribute specified tracks throughout the playlist (if any).
   - Alternate between familiar and new songs based on newStuffAmount.
   - Do not cluster same artist together.


REQUIRED OUTPUT FORMAT:
{
  "thought": "Explain your understanding of the request and curation approach",
  "track_name_candidates": "1. <track_name> | <artist_name>\\n2. ...",
  "track_name_candidate_review": "Review the list and how to improve",
  "playlist": {
    "name": "2-3 word creative name",
    "tracks": [{"id": "spotify_id or empty if unknown", "name": "track_name", "artist_name": "artist_name"}]
  }
}

IMPORTANT:
- Follow the newStuffAmount distribution.
- If no selected tracks/artists, freely pick tracks and leave IDs empty.
- Maintain a natural sonic and thematic flow that consistently feels like the requested artists, tracks, or genre(s).
- Keep the playlist name concise (2-3 words).
- Valid JSON response only.
- Don't cluster same artists together.
- Distribute specified tracks if any.
- Prioritize liked_tracks for familiar songs if using them.`;
