import { describe, expect, test } from "bun:test";
import {
  PLAYLIST_GENERATION_MODEL_ID,
  PLAYLIST_GENERATION_PROVIDER_OPTIONS,
  playlistGenerationModel,
} from "./aiGeneration.server";
import {
  buildPlaylistPrompt,
  createPlaylistCurationResponseSchema,
  generatePlaylist,
  type PlaylistCurationResponse,
} from "./generatePlaylist.server";
import {
  buildModificationPrompt,
  generatePlaylistModification,
  PlaylistModificationSchema,
} from "./generatePlaylistModification.server";
import type {
  GeneratePlaylistInput,
  PlaylistModificationInput,
} from "./playlistBuilder.types";
import type { VibeBrief } from "./vibeBrief";

describe("OpenAI playlist generation configuration", () => {
  test("uses GPT-5.6 Luna through the Responses API configuration", () => {
    expect(PLAYLIST_GENERATION_MODEL_ID).toBe("gpt-5.6-luna");
    expect(playlistGenerationModel.modelId).toBe("gpt-5.6-luna");
    expect(PLAYLIST_GENERATION_PROVIDER_OPTIONS).toEqual({
      openai: {
        reasoningEffort: "medium",
        store: false,
      },
    });
  });
});

describe("playlist curation", () => {
  test("enforces the requested song count in the response schema", () => {
    const schema = createPlaylistCurationResponseSchema(2);
    const validPlaylist = {
      playlist: {
        name: "Night Drive",
        description:
          "Midnight asphalt, low beams, and just enough trouble to miss the exit on purpose.",
        tracks: [
          { id: "track-1", name: "First", artist_name: "Artist One" },
          { id: "", name: "Second", artist_name: "Artist Two" },
        ],
      },
    };

    expect(schema.safeParse(validPlaylist).success).toBe(true);
    expect(
      schema.safeParse({
        ...validPlaylist,
        playlist: { ...validPlaylist.playlist, description: "Too short" },
      }).success
    ).toBe(false);
    expect(
      schema.safeParse({
        ...validPlaylist,
        playlist: { ...validPlaylist.playlist, description: "x".repeat(301) },
      }).success
    ).toBe(false);
    expect(
      schema.safeParse({
        ...validPlaylist,
        playlist: {
          ...validPlaylist.playlist,
          tracks: validPlaylist.playlist.tracks.slice(0, 1),
        },
      }).success
    ).toBe(false);
  });

  test("builds a bounded prompt and passes instructions separately", async () => {
    const input = createPlaylistInput();
    const expected: PlaylistCurationResponse = {
      playlist: {
        name: "Road Folk",
        description:
          "Sun-cracked roads, warm strings, and choruses built to outrun the last gas station.",
        tracks: [
          { id: "selected-1", name: "Anchor", artist_name: "Anchor Band" },
          { id: "new-1", name: "Fresh", artist_name: "Fresh Band" },
        ],
      },
    };
    let capturedPrompt = "";
    let capturedInstructions = "";

    const result = await generatePlaylist(input, {
      vibeBrief: null,
      generate: async (request) => {
        capturedPrompt = request.prompt;
        capturedInstructions = request.instructions;
        return request.schema.parse(expected);
      },
    });

    expect(result).toEqual(expected);
    expect(capturedPrompt).toBe(buildPlaylistPrompt(input, null));
    expect(capturedPrompt).toContain("exactly 2 songs");
    expect(capturedPrompt).toContain("<custom_instructions>");
    expect(capturedPrompt).toContain("selected-1 | Anchor | Anchor Band");
    expect(capturedPrompt).toContain("new-1 | Fresh | Fresh Band");
    expect(capturedInstructions).toContain("Never invent an ID");
    expect(capturedInstructions).toContain(
      "Do not list or parrot artist or track names"
    );
    expect(capturedInstructions).toContain("playful, and a little edgy");
    expect(capturedInstructions).not.toContain("chain-of-thought");
  });

  test("reports partial structured playlist output as it streams", async () => {
    const input = createPlaylistInput();
    const draftedCounts: number[] = [];
    const expected: PlaylistCurationResponse = {
      playlist: {
        name: "Road Folk",
        description:
          "Sun-cracked roads, warm strings, and choruses built to outrun the last gas station.",
        tracks: [
          { id: "selected-1", name: "Anchor", artist_name: "Anchor Band" },
          { id: "new-1", name: "Fresh", artist_name: "Fresh Band" },
        ],
      },
    };

    await generatePlaylist(input, {
      vibeBrief: null,
      generate: async (request) => {
        request.onPartialOutput?.({
          playlist: { tracks: [expected.playlist.tracks[0]] },
        });
        request.onPartialOutput?.(expected);
        return expected;
      },
      onPartialOutput: (partialOutput) => {
        draftedCounts.push(
          partialOutput.playlist?.tracks?.filter(Boolean).length ?? 0
        );
      },
    });

    expect(draftedCounts).toEqual([1, 2]);
  });

  test("keeps explicit instructions authoritative over conflicting inference and preserves truthful metadata", async () => {
    const input = createPlaylistInput();
    input.newSongs[0] = {
      ...input.newSongs[0],
      release_date: "2025-02-14",
      album_popularity: 70,
    };
    const vibeBrief: VibeBrief = {
      source: {
        selectedArtists: ["Anchor Band"],
        selectedTracks: [{ name: "Anchor", artist: "Anchor Band" }],
        explicitInstructions: "Warm acoustic road-trip music",
      },
      profile: {
        summary: "Warm, forward-moving acoustic folk for an open road",
        mood: ["abrasive", "restless"],
        energy: "high",
        tempoFeel: "urgent and fast",
        genres: { include: ["indie folk"], avoid: ["metal"] },
        era: ["contemporary"],
        positiveAnchors: ["distorted electric guitars", "hard-driving drums"],
        vocals: "human, close-miked vocals",
        instrumentation: ["acoustic guitar", "light percussion"],
        productionTexture: ["organic", "open"],
        negativeConstraints: ["no glossy dance production"],
        arc: "start intimate, build gently, finish expansive",
      },
    };
    let capturedPrompt = "";
    let capturedInstructions = "";

    await generatePlaylist(input, {
      vibeBrief,
      generate: async (request) => {
        capturedPrompt = request.prompt;
        capturedInstructions = request.instructions;
        return request.schema.parse({
          playlist: {
            name: "Road Folk",
            description:
              "Sun-cracked roads, warm strings, and a gentle climb toward the horizon.",
            tracks: [
              { id: "selected-1", name: "Anchor", artist_name: "Anchor Band" },
              { id: "new-1", name: "Fresh", artist_name: "Fresh Band" },
            ],
          },
        });
      },
    });

    expect(capturedPrompt).toBe(buildPlaylistPrompt(input, vibeBrief));
    expect(capturedPrompt).toContain("<vibe_brief>");
    expect(capturedPrompt).toContain(
      '"explicitInstructions":"Warm acoustic road-trip music"'
    );
    expect(capturedPrompt).toContain('"energy":"high"');
    expect(capturedPrompt).not.toContain("<custom_instructions>");
    expect(capturedPrompt).toContain("released:2025-02-14");
    expect(capturedPrompt).toContain("popularity:55");
    expect(capturedPrompt).toContain("album-popularity:70");
    expect(capturedInstructions).toContain(
      "source.explicitInstructions are authoritative"
    );
  });
});

describe("playlist modification", () => {
  test("requires a non-empty final playlist and preserves track IDs in prompts", async () => {
    const input: PlaylistModificationInput = {
      playlistId: "playlist-1",
      snapshotId: "snapshot-1",
      instructions: "Add one upbeat song",
      currentTracks: [
        { id: "existing-1", name: "Existing", artist_name: "Known Artist" },
      ],
    };
    const expected = {
      modifiedPlaylist: {
        name: "Upbeat Mix",
        tracks: [
          { id: "existing-1", name: "Existing", artist_name: "Known Artist" },
          { id: "", name: "New Song", artist_name: "New Artist" },
        ],
      },
    };
    let capturedInstructions = "";

    expect(
      PlaylistModificationSchema.safeParse({
        modifiedPlaylist: { name: "Empty", tracks: [] },
      }).success
    ).toBe(false);
    expect(
      PlaylistModificationSchema.safeParse({
        modifiedPlaylist: {
          name: "Too Large",
          tracks: Array.from({ length: 101 }, (_, index) => ({
            id: `track-${index}`,
            name: `Track ${index}`,
            artist_name: "Artist",
          })),
        },
      }).success
    ).toBe(false);
    expect(buildModificationPrompt(input)).toContain(
      "existing-1 | Existing | Known Artist"
    );

    const result = await generatePlaylistModification(input, async (request) => {
      capturedInstructions = request.instructions;
      return request.schema.parse(expected);
    });

    expect(result).toEqual(expected);
    expect(capturedInstructions).toContain("use an empty ID");
    expect(capturedInstructions).not.toContain("chain-of-thought");
  });
});

function createPlaylistInput(): GeneratePlaylistInput {
  const formData = {
    songCount: 2,
    newStuffAmount: "half" as const,
    customInstructions: "Warm acoustic road-trip music",
  };

  return {
    formData,
    data: {
      selectedTracks: [
        {
          track_id: "selected-1",
          track_name: "Anchor",
          artist_name: "Anchor Band",
        },
      ],
      selectedArtists: [
        { artist_id: "artist-1", artist_name: "Anchor Band" },
      ],
      familiarSongsPool: {
        specifiedTracks: [
          {
            id: "selected-1",
            name: "Anchor",
            artist_name: "Anchor Band",
          },
        ],
        topTracks: [],
        artistCatalogs: [],
        likedTracks: [],
        recentlyPlayedTracks: [],
      },
      formData,
    },
    newSongs: [
      {
        id: "new-1",
        name: "Fresh",
        artist_name: "Fresh Band",
        popularity: 55,
      },
    ],
  };
}
