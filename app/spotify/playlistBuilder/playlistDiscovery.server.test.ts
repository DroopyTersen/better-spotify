import { describe, expect, test } from "bun:test";
import type { SpotifySdk } from "../createSpotifySdk";
import type { BuildPlaylistInput } from "./playlistBuilder.types";
import {
  buildPlaylistDiscoveryPrompt,
  createPlaylistDiscoveryResponseSchema,
  discoverPlaylistArtists,
  generatePlaylistDiscovery,
  normalizeArtistCandidates,
  resolveArtistCandidates,
} from "./playlistDiscovery.server";
import { buildVibeBriefSource, type VibeProfile } from "./vibeBrief";

const profile: VibeProfile = {
  summary: "Warm, weathered indie folk for a steady rural drive.",
  mood: ["warm", "intimate"],
  energy: "medium",
  tempoFeel: "Unhurried but always moving forward.",
  genres: { include: ["indie folk"], avoid: ["arena rock"] },
  era: ["2010s", "2020s"],
  positiveAnchors: ["weathered acoustic guitars", "conversational vocals"],
  vocals: "Conversational lead vocals.",
  instrumentation: ["acoustic guitar", "restrained drums"],
  productionTexture: ["organic", "lightly weathered"],
  negativeConstraints: ["no glossy pop production"],
  arc: "Open gently, build momentum, and land softly.",
};

describe("playlist vibe brief", () => {
  test("uses selected artists and tracks as first-class source evidence", () => {
    const input = buildInput();
    input.data.selectedArtists = [{ artist_id: "artist-id" }];
    input.data.selectedTracks = [{ track_id: "track-id" }];
    input.data.familiarSongsPool = {
      specifiedTracks: [
        {
          id: "track-id",
          name: "Anchor Song",
          artist_name: "Anchor Artist",
        },
      ],
      topTracks: [],
      likedTracks: [],
      recentlyPlayedTracks: [],
      artistCatalogs: [
        {
          artist_id: "artist-id",
          artist_name: "Selected Artist",
          tracks: [],
        },
      ],
    };

    expect(buildVibeBriefSource(input)).toEqual({
      selectedArtists: ["Selected Artist"],
      selectedTracks: [{ name: "Anchor Song", artist: "Anchor Artist" }],
      explicitInstructions: "Keep it warm and avoid glossy production.",
    });
  });

  test("supports instructions without selected music", () => {
    const input = buildInput();
    input.data.selectedArtists = [];
    input.data.selectedTracks = [];

    expect(buildVibeBriefSource(input)).toEqual({
      selectedArtists: [],
      selectedTracks: [],
      explicitInstructions: "Keep it warm and avoid glossy production.",
    });
  });

  test("supports selected music without instructions", () => {
    const input = buildInput();
    input.formData.customInstructions = "";

    expect(buildVibeBriefSource(input)).toEqual({
      selectedArtists: ["Selected Artist"],
      selectedTracks: [
        { name: "Selected Track", artist: "Track Artist" },
      ],
      explicitInstructions: "",
    });
  });
});

describe("playlist artist discovery", () => {
  test("derives a bounded profile and retains overflow artist candidates", async () => {
    const source = buildVibeBriefSource(buildInput());
    let capturedPrompt = "";
    let capturedInstructions = "";

    const discovery = await generatePlaylistDiscovery(
      source,
      ["Blocked Artist"],
      2,
      async (request) => {
        capturedPrompt = request.prompt;
        capturedInstructions = request.instructions;
        return request.schema.parse({
          vibeProfile: profile,
          recommendedArtists: ["One", "Two", "Three", "Four", "Five"],
        });
      }
    );

    expect(discovery.vibeBrief).toEqual({ source, profile });
    expect(discovery.artistCandidates).toEqual([
      "One",
      "Two",
      "Three",
      "Four",
      "Five",
    ]);
    expect(capturedPrompt).toBe(
      buildPlaylistDiscoveryPrompt(source, ["Blocked Artist"], 5)
    );
    expect(capturedPrompt).toContain("descending vibe-fit order");
    expect(capturedInstructions).toContain(
      "Explicit instructions are authoritative"
    );
    expect(capturedInstructions).toContain("do not have Spotify or web-search");
  });

  test("rejects blocked, duplicate, and underfilled candidate output", () => {
    const source = buildVibeBriefSource(buildInput());
    expect(
      createPlaylistDiscoveryResponseSchema(2).safeParse({
        vibeProfile: profile,
        recommendedArtists: ["One"],
      }).success
    ).toBeFalse();
    expect(() =>
      normalizeArtistCandidates(
        ["Selected Artist", "Fresh", " fresh "],
        source,
        [],
        2
      )
    ).toThrow("received 1");
  });

  test("uses overflow names after failed Spotify resolutions and bounds concurrency", async () => {
    let active = 0;
    let maximumActive = 0;
    const sdk = {
      async search(query: string) {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await new Promise((resolve) => setTimeout(resolve, 1));
        active -= 1;
        const name = JSON.parse(query.slice("artist:".length)) as string;
        return {
          artists: {
            items: name.startsWith("Missing")
              ? []
              : [{ id: `id-${name}`, name, images: [] }],
          },
        };
      },
    } as unknown as SpotifySdk;

    const artists = await resolveArtistCandidates(
      sdk,
      [
        "Missing One",
        "Missing Two",
        "Fresh One",
        "Fresh Two",
        "Fresh Three",
        "Fresh Four",
      ],
      3,
      []
    );

    expect(maximumActive).toBe(5);
    expect(artists.map(({ artist_name }) => artist_name)).toEqual([
      "Fresh One",
      "Fresh Two",
      "Fresh Three",
    ]);
  });

  test("drops an ambiguous exact-name match instead of attaching the wrong catalog", async () => {
    const sdk = {
      async search() {
        return {
          artists: {
            items: [
              { id: "homonym-one", name: "Shared Name", images: [] },
              { id: "homonym-two", name: "Shared Name", images: [] },
            ],
          },
        };
      },
    } as unknown as SpotifySdk;

    await expect(
      resolveArtistCandidates(sdk, ["Shared Name"], 1, [])
    ).resolves.toEqual([]);
  });

  test("passes one instructions-only brief through verified artist discovery", async () => {
    const input = buildInput();
    input.data.selectedArtists = [];
    input.data.selectedTracks = [];
    const sdk = {
      async search(query: string) {
        const name = JSON.parse(query.slice("artist:".length)) as string;
        return {
          artists: { items: [{ id: `id-${name}`, name, images: [] }] },
        };
      },
    } as unknown as SpotifySdk;

    const discovery = await discoverPlaylistArtists(
      input,
      sdk,
      {
        generateBaseline: async (request) =>
          request.schema.parse({
            vibeProfile: profile,
            recommendedArtists: Array.from(
              { length: 8 },
              (_, index) => `Fresh ${index}`
            ),
          }),
        generateScout: async () => ({
          output: { candidates: [] },
          sourceUrls: [],
        }),
      }
    );

    expect(discovery.vibeBrief.source).toEqual({
      selectedArtists: [],
      selectedTracks: [],
      explicitInstructions: "Keep it warm and avoid glossy production.",
    });
    expect(discovery.rankedArtists).toHaveLength(5);
    expect(discovery.discoveryEvidence).toEqual([]);
  });

  test("keeps every resolved scout lane and the baseline available while dropping Spotify misses", async () => {
    const searchedArtists: string[] = [];
    const sdk = {
      async search(query: string) {
        const name = JSON.parse(query.slice("artist:".length)) as string;
        searchedArtists.push(name);
        return {
          artists: {
            items:
              name === "Missing Scout"
                ? []
                : [{ id: `id-${name}`, name, images: [] }],
          },
        };
      },
    } as unknown as SpotifySdk;

    const discovery = await discoverPlaylistArtists(
      buildInput(),
      sdk,
      {
        generateBaseline: async (request) =>
          request.schema.parse({
            vibeProfile: profile,
            recommendedArtists: Array.from(
              { length: 8 },
              (_, index) => `Baseline ${index}`
            ),
          }),
        generateScout: async (request) => {
          const candidates = request.prompt.includes(
            "<discovery_lane>recent</discovery_lane>"
          )
            ? [
                scoutCandidate("Missing Scout", "https://example.com/missing"),
                scoutCandidate("Recent Scout", "https://example.com/recent"),
              ]
            : request.prompt.includes(
                  "<discovery_lane>adjacent</discovery_lane>"
                )
              ? [
                  scoutCandidate(
                    "Adjacent Scout",
                    "https://example.com/adjacent"
                  ),
                ]
              : [
                  scoutCandidate(
                    "Wildcard Scout",
                    "https://example.com/wildcard"
                  ),
                ];
          return {
            output: { candidates },
            sourceUrls: candidates.map(({ sourceUrl }) => sourceUrl),
          };
        },
      }
    );

    expect(discovery.rankedArtists.map(({ artist_name }) => artist_name)).toEqual([
      "Adjacent Scout",
      "Wildcard Scout",
      "Recent Scout",
      "Baseline 0",
      "Baseline 1",
      "Baseline 2",
      "Baseline 3",
      "Baseline 4",
    ]);
    expect(searchedArtists).toContain("Missing Scout");
    expect(discovery.discoveryEvidence).toEqual([
      {
        lane: "adjacent",
        artistId: "id-Adjacent Scout",
        ...scoutCandidate("Adjacent Scout", "https://example.com/adjacent"),
      },
      {
        lane: "wildcard",
        artistId: "id-Wildcard Scout",
        ...scoutCandidate("Wildcard Scout", "https://example.com/wildcard"),
      },
      {
        lane: "recent",
        artistId: "id-Recent Scout",
        ...scoutCandidate("Recent Scout", "https://example.com/recent"),
      },
    ]);
  });

  test("keeps the baseline path operational when every scout fails", async () => {
    let reportedFailures: readonly string[] = [];
    const sdk = {
      async search(query: string) {
        const name = JSON.parse(query.slice("artist:".length)) as string;
        return {
          artists: { items: [{ id: `id-${name}`, name, images: [] }] },
        };
      },
    } as unknown as SpotifySdk;

    const discovery = await discoverPlaylistArtists(
      buildInput(),
      sdk,
      {
        generateBaseline: async (request) =>
          request.schema.parse({
            vibeProfile: profile,
            recommendedArtists: Array.from(
              { length: 8 },
              (_, index) => `Baseline ${index}`
            ),
          }),
        generateScout: async () => {
          throw new Error("web unavailable");
        },
        reportScoutFailures: (lanes) => {
          reportedFailures = lanes;
        },
      }
    );

    expect(discovery.rankedArtists.map(({ artist_name }) => artist_name)).toEqual([
      "Baseline 0",
      "Baseline 1",
      "Baseline 2",
      "Baseline 3",
      "Baseline 4",
    ]);
    expect(discovery.discoveryEvidence).toEqual([]);
    expect(reportedFailures).toEqual(["recent", "adjacent", "wildcard"]);
  });

  test("does not call web discovery when the user asks for no new music", async () => {
    const input = buildInput();
    input.formData.newStuffAmount = "none";
    input.data.formData.newStuffAmount = "none";
    let scoutCalls = 0;

    const discovery = await discoverPlaylistArtists(
      input,
      {} as SpotifySdk,
      {
        generateBaseline: async (request) =>
          request.schema.parse({
            vibeProfile: profile,
            recommendedArtists: [],
          }),
        generateScout: async () => {
          scoutCalls += 1;
          return { output: { candidates: [] }, sourceUrls: [] };
        },
      }
    );

    expect(scoutCalls).toBe(0);
    expect(discovery.rankedArtists).toEqual([]);
    expect(discovery.discoveryEvidence).toEqual([]);
  });
});

function scoutCandidate(artistName: string, sourceUrl: string) {
  return {
    artistName,
    fitReason: `${artistName} has a well-supported fit.`,
    sourceUrl,
    sourceDate: "2026-09-01",
  };
}

function buildInput(): BuildPlaylistInput {
  const formData = {
    customInstructions: "Keep it warm and avoid glossy production.",
    newStuffAmount: "half" as const,
    songCount: 20,
  };
  return {
    formData,
    data: {
      selectedArtists: [
        { artist_id: "selected-id", artist_name: "Selected Artist" },
      ],
      selectedTracks: [
        {
          track_id: "selected-track",
          track_name: "Selected Track",
          artist_name: "Track Artist",
        },
      ],
      familiarSongsPool: {
        specifiedTracks: [],
        topTracks: [],
        likedTracks: [],
        recentlyPlayedTracks: [],
        artistCatalogs: [],
      },
      formData,
    },
  };
}
