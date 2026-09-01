import { describe, expect, test } from "bun:test";
import type { PlaylistCurationResponse } from "../../app/spotify/playlistBuilder/generatePlaylist.server";
import type { GeneratePlaylistInput } from "../../app/spotify/playlistBuilder/playlistBuilder.types";
import { playlistQualityCases } from "./benchmark.v1";
import {
  analyzePlaylistSample,
  summarizeDeterministicRun,
  summarizePlaylistRun,
  validatePlaylistBenchmark,
} from "./metrics";
import {
  createBlindComparison,
  createJudgePacket,
  runPlaylistBenchmark,
} from "./harness";
import type {
  PlaylistEvalCase,
  PlaylistEvalJudgments,
  PlaylistEvalInput,
} from "./schemas";

describe("playlist quality benchmark", () => {
  test("covers the intended input shapes, novelty settings, and holdout split", () => {
    expect(playlistQualityCases).toHaveLength(8);
    expect(
      new Set(playlistQualityCases.map(({ input }) => input.formData.newStuffAmount))
    ).toEqual(new Set(["none", "sprinkle", "half", "all"]));
    expect(
      playlistQualityCases.filter(({ split }) => split === "holdout")
    ).toHaveLength(2);
    expect(() => validatePlaylistBenchmark(playlistQualityCases)).not.toThrow();
  });

  test("rejects duplicate cases and ambiguous familiar/new fixture IDs", () => {
    const first = createEvalCase("duplicate");
    expect(() => validatePlaylistBenchmark([first, first])).toThrow(
      "Duplicate benchmark case ID"
    );

    const ambiguous = createEvalCase("ambiguous");
    ambiguous.input.newSongs[0] = {
      id: "selected-1",
      name: "Ambiguous",
      artist_name: "New Artist",
    };
    expect(() => validatePlaylistBenchmark([ambiguous])).toThrow(
      "both familiar and new"
    );
  });
});

describe("deterministic playlist metrics", () => {
  test("classifies canonical fixture tracks and reports the requested mix", () => {
    const evalCase = createEvalCase("balanced");
    const metrics = analyzePlaylistSample(evalCase, {
      playlist: {
        name: "Balanced",
        description:
          "Warm momentum builds through open-road choruses before a soft landing.",
        tracks: [
          {
            id: "selected-1",
            name: "Model rewrote this name",
            artist_name: "Wrong model artist",
          },
          { id: "new-1", name: "New One", artist_name: "New Artist" },
          { id: "new-2", name: "New Two", artist_name: "Other New Artist" },
          {
            id: "familiar-1",
            name: "Familiar One",
            artist_name: "Anchor Artist",
          },
        ],
      },
    });

    expect(metrics.exactTrackCount).toBe(true);
    expect(metrics.fixtureResolvableCount).toBe(4);
    expect(metrics.inventedIds).toEqual([]);
    expect(metrics.duplicateCount).toBe(0);
    expect(metrics.selectedTrackCoverage).toEqual({
      required: 1,
      included: 1,
      missingIds: [],
    });
    expect(metrics.novelty).toMatchObject({
      requestedCount: 2,
      newCount: 2,
      familiarCount: 2,
      unresolvedCount: 0,
      absoluteCountDelta: 0,
    });
    expect(
      metrics.trackFixtureClassifications.map(({ classification }) =>
        classification
      )
    ).toEqual(["familiar", "new", "new", "familiar"]);
  });

  test("detects duplicate names, invented IDs, unresolved tracks, and adjacency", () => {
    const evalCase = createEvalCase("violations");
    const metrics = analyzePlaylistSample(evalCase, {
      playlist: {
        name: "Violations",
        description:
          "A deliberately broken result used to verify deterministic diagnostics.",
        tracks: [
          { id: "invented", name: "Unknown", artist_name: "Mystery" },
          { id: "", name: "Same Song", artist_name: "Same Artist" },
          { id: "", name: " same  song ", artist_name: "SAME ARTIST" },
          { id: "new-1", name: "New One", artist_name: "New Artist" },
        ],
      },
    });

    expect(metrics.inventedIds).toEqual(["invented"]);
    expect(metrics.duplicateCount).toBe(1);
    expect(metrics.unresolvedCount).toBe(3);
    expect(metrics.adjacentSameArtistCount).toBe(1);
    expect(metrics.constraintViolations).toContain("invented-id");
    expect(metrics.constraintViolations).toContain("duplicate-track");
  });
});

describe("playlist quality harness", () => {
  test("records repeated samples and continues after an isolated model failure", async () => {
    const cases = [createEvalCase("one"), createEvalCase("two")];
    let generationCalls = 0;
    const recordedSamples: string[] = [];

    const run = await runPlaylistBenchmark({
      label: "baseline",
      cases,
      samplesPerCase: 2,
      sourceRevision: "abc123",
      sourceDirty: false,
      generate: async (input) => {
        generationCalls += 1;
        if (generationCalls === 2) throw new Error("provider unavailable");
        return successfulOutput(input);
      },
      onSample: async ({ caseId, sample }) => {
        recordedSamples.push(`${caseId}:${sample}`);
      },
    });

    expect(generationCalls).toBe(4);
    expect(recordedSamples).toEqual(["one:1", "one:2", "two:1", "two:2"]);
    expect(run.complete).toBe(false);
    expect(run.cases.flatMap(({ samples }) => samples)).toHaveLength(4);
    expect(
      run.cases.flatMap(({ samples }) => samples).filter(({ error }) => error)
    ).toHaveLength(1);
    expect(JSON.stringify(run)).not.toContain("OPENAI_API_KEY");
    expect(summarizeDeterministicRun(run)).toMatchObject({
      attemptedSamples: 4,
      successfulSamples: 3,
      complete: false,
    });
  });

  test("creates a stable blind comparison without leaking implementation labels", async () => {
    const evalCase = createEvalCase("compare");
    const baseline = await completedRun("baseline-secret", evalCase, "Baseline");
    const candidate = await completedRun("candidate-secret", evalCase, "Candidate");

    const first = createBlindComparison(baseline, candidate, "fixed-seed");
    const second = createBlindComparison(baseline, candidate, "fixed-seed");

    expect(first).toEqual(second);
    expect(first.packet.pairs).toHaveLength(1);
    expect(JSON.stringify(first.packet)).not.toContain("baseline-secret");
    expect(JSON.stringify(first.packet)).not.toContain("candidate-secret");
    expect(JSON.stringify(first.key)).toContain("baseline-secret");
    expect(JSON.stringify(first.key)).toContain("candidate-secret");
    expect(first.packet.pairs[0]?.request.selectedTracks).toHaveLength(1);
    expect(
      first.packet.pairs[0]?.A.fixtureClassifications?.tracks
    ).toHaveLength(4);

    const judgePacket = createJudgePacket(baseline);
    expect(judgePacket.samples[0]?.fixtureClassifications?.tracks).toEqual([
      { position: 1, classification: "familiar" },
      { position: 2, classification: "new" },
      { position: 3, classification: "familiar" },
      { position: 4, classification: "new" },
    ]);
  });

  test("reports vibe first while keeping novelty and constraints separate", async () => {
    const evalCase = createEvalCase("report");
    const run = await completedRun("baseline", evalCase, "Result");
    const judgments: PlaylistEvalJudgments = {
      schemaVersion: 1,
      rubricVersion: "1.0.0",
      runId: run.runId,
      judgments: [
        {
          caseId: evalCase.id,
          sample: 1,
          vibeFit: 4,
          anchorFidelity: 5,
          coherence: 4,
          orderedFlow: 3,
          noveltyQuality: 4,
          verdict: "yellow",
          failureMode: "energy-arc",
          reason: "The destination is right, but the peak arrives too early.",
          evidence: ["Tracks three and four both reduce the requested climb."],
        },
      ],
    };

    const report = summarizePlaylistRun(run, judgments);
    expect(Object.keys(report)[0]).toBe("subjective");
    expect(report.subjective.vibeFit.mean).toBe(4);
    expect(report.subjective.noveltyQuality.mean).toBe(4);
    expect(report.deterministic.sampleCount).toBe(1);
    expect(report.deterministic.generationSuccessRate).toBe(1);

    expect(() =>
      summarizePlaylistRun(run, { ...judgments, judgments: [] })
    ).toThrow("Missing judgment");
  });
});

function createEvalCase(id: string): PlaylistEvalCase {
  const formData = {
    customInstructions: "Warm road music with a clear rise and gentle landing",
    newStuffAmount: "half" as const,
    songCount: 4,
  };
  const input: PlaylistEvalInput = {
    formData,
    data: {
      selectedTracks: [
        {
          track_id: "selected-1",
          track_name: "Selected One",
          artist_id: "anchor-artist",
          artist_name: "Anchor Artist",
        },
      ],
      selectedArtists: [
        { artist_id: "anchor-artist", artist_name: "Anchor Artist" },
      ],
      familiarSongsPool: {
        specifiedTracks: [
          {
            id: "selected-1",
            name: "Selected One",
            artist_id: "anchor-artist",
            artist_name: "Anchor Artist",
          },
        ],
        topTracks: [],
        likedTracks: [
          {
            id: "familiar-1",
            name: "Familiar One",
            artist_id: "anchor-artist",
            artist_name: "Anchor Artist",
          },
        ],
        artistCatalogs: [],
        recentlyPlayedTracks: [],
      },
      recommendedArtists: [],
      formData,
    },
    newSongs: [
      {
        id: "new-1",
        name: "New One",
        artist_id: "new-artist",
        artist_name: "New Artist",
      },
      {
        id: "new-2",
        name: "New Two",
        artist_id: "other-new-artist",
        artist_name: "Other New Artist",
      },
    ],
  };

  return {
    id,
    title: `Case ${id}`,
    split: "development",
    rationale: "Test fixture",
    intent: {
      vibe: "Warm open-road momentum",
      mustHave: ["A clear rise"],
      mustAvoid: ["Abrupt stylistic detours"],
      arc: "Start gently, build, then land softly",
      novelty: "Half fixture-new tracks that still fit the vibe",
    },
    allowUnresolved: false,
    input,
  };
}

function successfulOutput(input: GeneratePlaylistInput): PlaylistCurationResponse {
  const tracks = [
    {
      id: "selected-1",
      name: "Selected One",
      artist_name: "Anchor Artist",
    },
    { id: "new-1", name: "New One", artist_name: "New Artist" },
    {
      id: "familiar-1",
      name: "Familiar One",
      artist_name: "Anchor Artist",
    },
    { id: "new-2", name: "New Two", artist_name: "Other New Artist" },
  ].slice(0, input.formData.songCount);

  return {
    playlist: {
      name: "Result",
      description:
        "Warm momentum builds through open-road choruses before a soft landing.",
      tracks,
    },
  };
}

async function completedRun(
  label: string,
  evalCase: PlaylistEvalCase,
  playlistName: string
) {
  return runPlaylistBenchmark({
    label,
    cases: [evalCase],
    samplesPerCase: 1,
    sourceRevision: "abc123",
    sourceDirty: false,
    generate: async (input) => ({
      ...successfulOutput(input),
      playlist: { ...successfulOutput(input).playlist, name: playlistName },
    }),
  });
}
