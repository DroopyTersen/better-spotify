import { describe, expect, test } from "bun:test";
import {
  PLAYLIST_GENERATION_MODEL_ID,
  PLAYLIST_GENERATION_PROVIDER_OPTIONS,
  playlistGenerationModel,
} from "./aiGeneration.server";
import {
  buildArtistRecommendationPrompt,
  createArtistRecommendationsResponseSchema,
  findExactArtistNameMatch,
  generateArtistRecommendations,
  normalizeArtistRecommendations,
} from "./generateArtistRecommendations.server";
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
        tracks: [
          { id: "selected-1", name: "Anchor", artist_name: "Anchor Band" },
          { id: "new-1", name: "Fresh", artist_name: "Fresh Band" },
        ],
      },
    };
    let capturedPrompt = "";
    let capturedInstructions = "";

    const result = await generatePlaylist(input, async (request) => {
      capturedPrompt = request.prompt;
      capturedInstructions = request.instructions;
      return request.schema.parse(expected);
    });

    expect(result).toEqual(expected);
    expect(capturedPrompt).toBe(buildPlaylistPrompt(input));
    expect(capturedPrompt).toContain("exactly 2 songs");
    expect(capturedPrompt).toContain("<custom_instructions>");
    expect(capturedPrompt).toContain("selected-1 | Anchor | Anchor Band");
    expect(capturedPrompt).toContain("new-1 | Fresh | Fresh Band");
    expect(capturedInstructions).toContain("Never invent an ID");
    expect(capturedInstructions).not.toContain("chain-of-thought");
  });

  test("reports partial structured playlist output as it streams", async () => {
    const input = createPlaylistInput();
    const draftedCounts: number[] = [];
    const expected: PlaylistCurationResponse = {
      playlist: {
        name: "Road Folk",
        tracks: [
          { id: "selected-1", name: "Anchor", artist_name: "Anchor Band" },
          { id: "new-1", name: "Fresh", artist_name: "Fresh Band" },
        ],
      },
    };

    await generatePlaylist(
      input,
      async (request) => {
        request.onPartialOutput?.({
          playlist: { tracks: [expected.playlist.tracks[0]] },
        });
        request.onPartialOutput?.(expected);
        return expected;
      },
      (partialOutput) => {
        draftedCounts.push(
          partialOutput.playlist?.tracks?.filter(Boolean).length ?? 0
        );
      }
    );

    expect(draftedCounts).toEqual([1, 2]);
  });
});

describe("artist recommendations", () => {
  test("selects only an exact normalized Spotify artist name", () => {
    const artists = [
      { id: "tribute", name: "Spoon Tribute" },
      { id: "exact", name: "  SPOON  " },
    ];

    expect(findExactArtistNameMatch(artists, "Spoon")).toEqual(artists[1]);
    expect(findExactArtistNameMatch(artists, "Spooner")).toBeUndefined();
  });

  test("enforces candidate count and normalizes exclusions and duplicates", () => {
    const schema = createArtistRecommendationsResponseSchema(4);
    expect(
      schema.safeParse({
        recommended_artists: ["One", "Two", "Three", "Four"],
      }).success
    ).toBe(true);
    expect(
      schema.safeParse({ recommended_artists: ["One", "Two", "Three"] })
        .success
    ).toBe(false);

    expect(
      normalizeArtistRecommendations(
        [
          "Radiohead",
          " Fresh One ",
          "fresh one",
          "Excluded Band",
          "Fresh Two",
          "Fresh Three",
        ],
        {
          artistsToMatch: ["Radiohead"],
          artistsToExclude: ["Excluded Band"],
        },
        3
      )
    ).toEqual(["Fresh One", "Fresh Two", "Fresh Three"]);
  });

  test("returns the requested number without asking for fake search access", async () => {
    const input = {
      artistsToMatch: ["Reference Band"],
      artistsToExclude: ["Blocked Band"],
      customInstructions: "Keep it energetic",
      desiredArtistCount: 2,
    };
    let capturedPrompt = "";
    let capturedInstructions = "";

    const result = await generateArtistRecommendations(input, async (request) => {
      capturedPrompt = request.prompt;
      capturedInstructions = request.instructions;
      return request.schema.parse({
        recommended_artists: [
          "Reference Band",
          "Blocked Band",
          "Fresh One",
          "Fresh Two",
          "Fresh Three",
        ],
      });
    });

    expect(result).toEqual(["Fresh One", "Fresh Two"]);
    expect(capturedPrompt).toBe(buildArtistRecommendationPrompt(input));
    expect(capturedPrompt).toContain("exactly 5 candidate artists");
    expect(capturedPrompt).toContain("<artists_to_exclude>");
    expect(capturedInstructions).not.toContain("Google Search");
    expect(capturedInstructions).not.toContain("thought process");
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
      recommendedArtists: [],
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
