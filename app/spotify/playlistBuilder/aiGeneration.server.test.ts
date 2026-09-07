import { describe, expect, test } from "bun:test";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import {
  createWebResearchGenerationOptions,
  PLAYLIST_GENERATION_MODEL_ID,
  PLAYLIST_GENERATION_PROVIDER_OPTIONS,
  playlistGenerationModel,
  WEB_RESEARCH_MAX_TOOL_CALLS,
  WEB_RESEARCH_PROVIDER_OPTIONS,
  WEB_RESEARCH_TIMEOUT_MS,
  generateWebResearchObject,
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

  test("keeps web research calls and request time explicitly bounded", () => {
    const options = createWebResearchGenerationOptions({
      instructions: "Research one bounded question.",
      prompt: "Find one supported answer.",
      schema: z.object({ answer: z.string() }),
    });

    expect(options.timeout).toBe(WEB_RESEARCH_TIMEOUT_MS);
    expect(options.timeout).toBe(30_000);
    expect(options.maxRetries).toBe(0);
    expect(options.toolChoice).toEqual({
      type: "tool",
      toolName: "web_search",
    });
    expect(Object.keys(options.tools)).toEqual(["web_search"]);
    expect(options.providerOptions).toBe(WEB_RESEARCH_PROVIDER_OPTIONS);
    expect(options.providerOptions).toEqual({
      openai: {
        reasoningEffort: "medium",
        maxToolCalls: WEB_RESEARCH_MAX_TOOL_CALLS,
        store: false,
      },
    });
  });

  test("sends one bounded web-search request and returns cited and consulted sources", async () => {
    const requestBodies: Array<Record<string, unknown>> = [];
    const requestSignals: Array<AbortSignal | null | undefined> = [];
    const testOpenAI = createOpenAI({
      apiKey: "test-only-key",
      fetch: (async (_input, init) => {
        requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        requestSignals.push(init?.signal);
        return new Response(
          JSON.stringify({
            id: "resp_test",
            created_at: 1,
            model: "gpt-5.6-luna",
            output: [
              {
                type: "web_search_call",
                id: "ws_test",
                status: "completed",
                action: {
                  type: "search",
                  queries: ["fresh music"],
                  sources: [
                    { type: "url", url: "https://example.com/consulted" },
                  ],
                },
              },
              {
                type: "message",
                id: "msg_test",
                role: "assistant",
                content: [
                  {
                    type: "output_text",
                    text: JSON.stringify({ answer: "supported" }),
                    annotations: [
                      {
                        type: "url_citation",
                        start_index: 0,
                        end_index: 1,
                        url: "https://example.com/cited",
                        title: "Citation",
                      },
                    ],
                  },
                ],
              },
            ],
            incomplete_details: null,
            usage: {
              input_tokens: 1,
              input_tokens_details: { cached_tokens: 0 },
              output_tokens: 1,
              output_tokens_details: { reasoning_tokens: 0 },
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }) as typeof fetch,
    });

    const result = await generateWebResearchObject(
      {
        instructions: "Research one bounded question.",
        prompt: "Find one supported answer.",
        schema: z.object({ answer: z.string() }),
      },
      testOpenAI.responses("gpt-5.6-luna")
    );

    expect(requestBodies).toHaveLength(1);
    expect(requestBodies[0]).toMatchObject({
      model: "gpt-5.6-luna",
      tools: [
        {
          type: "web_search",
          external_web_access: true,
          search_context_size: "low",
        },
      ],
      tool_choice: { type: "web_search" },
      max_tool_calls: 2,
      store: false,
      text: { format: { type: "json_schema", strict: true } },
    });
    expect(requestBodies[0]?.include).toEqual(
      expect.arrayContaining([
        "web_search_call.action.sources",
        "reasoning.encrypted_content",
      ])
    );
    expect(requestSignals[0]).toBeInstanceOf(AbortSignal);
    expect(result).toEqual({
      output: { answer: "supported" },
      sourceUrls: [
        "https://example.com/cited",
        "https://example.com/consulted",
      ],
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
      artist_id: "fresh-artist-id",
      release_date: "2025-02-14",
      album_popularity: 70,
    };
    const discoveryEvidence = [
      {
        lane: "wildcard" as const,
        artistId: "fresh-artist-id",
        artistName: "Fresh Band",
        fitReason: "A small-label release shares the brief's weathered texture.",
        sourceUrl: "https://example.com/fresh-band",
        sourceDate: "2026-08-20",
      },
    ];
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
      discoveryEvidence,
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

    expect(capturedPrompt).toBe(
      buildPlaylistPrompt(input, vibeBrief, discoveryEvidence)
    );
    expect(capturedPrompt).toContain("<vibe_brief>");
    expect(capturedPrompt).toContain(
      '"explicitInstructions":"Warm acoustic road-trip music"'
    );
    expect(capturedPrompt).toContain('"energy":"high"');
    expect(capturedPrompt).not.toContain("<custom_instructions>");
    expect(capturedPrompt).toContain("released:2025-02-14");
    expect(capturedPrompt).toContain("artist-id:fresh-artist-id");
    expect(capturedPrompt).toContain("popularity:55");
    expect(capturedPrompt).toContain("album-popularity:70");
    expect(capturedPrompt).toContain("<discovery_evidence>");
    expect(capturedPrompt).toContain('"artistId":"fresh-artist-id"');
    expect(capturedPrompt).toContain('"lane":"wildcard"');
    expect(capturedInstructions).toContain(
      "source.explicitInstructions are authoritative"
    );
    expect(capturedInstructions).toContain("broad appetite, not an arithmetic quota");
    expect(capturedInstructions).toContain("You may ignore any lane or finding");
    expect(capturedInstructions).toContain("untrusted supporting context");
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
