import { describe, expect, test } from "bun:test";
import type { VibeBrief } from "./vibeBrief";
import {
  DISCOVERY_SCOUT_LANES,
  DiscoveryScoutResponseSchema,
  runDiscoveryScouts,
  SCOUT_CANDIDATE_LIMIT,
  type DiscoveryScoutGenerator,
} from "./playlistDiscoveryScouts.server";

const vibeBrief: VibeBrief = {
  source: {
    selectedArtists: ["Big Thief"],
    selectedTracks: [{ name: "Fire", artist: "Waxahatchee" }],
    explicitInstructions: "Weathered indie folk with a surprising edge.",
  },
  profile: {
    summary: "Warm, weathered indie folk with forward motion.",
    mood: ["warm", "restless"],
    energy: "medium",
    tempoFeel: "Unhurried but moving.",
    genres: { include: ["indie folk"], avoid: ["arena rock"] },
    era: ["2020s"],
    positiveAnchors: ["conversational vocals"],
    vocals: "Close and human.",
    instrumentation: ["acoustic guitar", "restrained drums"],
    productionTexture: ["organic", "weathered"],
    negativeConstraints: ["no glossy pop"],
    arc: "Start intimate and finish expansive.",
  },
};

describe("playlist discovery scouts", () => {
  test("runs the three fixed lanes concurrently against the same bounded vibe brief", async () => {
    let active = 0;
    let maximumActive = 0;
    const prompts: string[] = [];
    const requests: Array<Parameters<DiscoveryScoutGenerator>[0]> = [];

    const result = await runDiscoveryScouts(
      vibeBrief,
      ["Known Artist"],
      async (request) => {
        prompts.push(request.prompt);
        requests.push(request);
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await new Promise((resolve) => setTimeout(resolve, 1));
        active -= 1;
        const lane = DISCOVERY_SCOUT_LANES.find(({ id }) =>
          request.prompt.includes(`<discovery_lane>${id}</discovery_lane>`)
        );
        if (!lane) throw new Error("missing lane");
        const sourceUrl = `https://example.com/${lane.id}`;
        return {
          output: {
            candidates: [
              {
                artistName: `${lane.id} artist`,
                fitReason: `A strong ${lane.id} fit.`,
                sourceUrl,
                sourceDate: null,
              },
            ],
          },
          sourceUrls: [sourceUrl],
        };
      }
    );

    expect(maximumActive).toBe(3);
    expect(prompts).toHaveLength(3);
    expect(
      prompts.map(
        (prompt) => prompt.match(/<vibe_brief>\n(.+)\n<\/vibe_brief>/)?.[1]
      )
    ).toEqual(Array(3).fill(JSON.stringify(vibeBrief)));
    expect(prompts.every((prompt) => prompt.includes("Known Artist"))).toBeTrue();
    expect(result.findings.map(({ lane }) => lane)).toEqual([
      "recent",
      "adjacent",
      "wildcard",
    ]);
    expect(result.failedLanes).toEqual([]);
    expect(
      requests.every(
        ({ schema }) =>
          schema.safeParse({ candidates: [] }).success &&
          !schema.safeParse({
            candidates: Array.from(
              { length: SCOUT_CANDIDATE_LIMIT + 1 },
              (_, index) =>
                candidate(`Artist ${index}`, `https://example.com/${index}`)
            ),
          }).success
      )
    ).toBeTrue();
  });

  test("keeps only typed findings tied to an actual returned source URL", async () => {
    expect(
      DiscoveryScoutResponseSchema.safeParse({
        candidates: [
          {
            artistName: "Artist",
            fitReason: "Fit",
            sourceUrl: "not a URL",
            sourceDate: "last Tuesday",
          },
        ],
      }).success
    ).toBeFalse();
    expect(
      DiscoveryScoutResponseSchema.safeParse({
        candidates: [
          {
            ...candidate("Artist", "https://example.com/artist"),
            sourceDate: "2026-99-99",
          },
        ],
      }).success
    ).toBeFalse();

    const result = await runDiscoveryScouts(
      vibeBrief,
      [],
      async (request) => {
        const lane = laneFromPrompt(request.prompt);
        if (lane !== "recent") {
          return { output: { candidates: [] }, sourceUrls: [] };
        }
        return {
          output: {
            candidates: [
              candidate("Supported Artist", "https://example.com/supported"),
              candidate("Invented Citation", "https://example.com/invented"),
            ],
          },
          sourceUrls: ["https://example.com/supported"],
        };
      }
    );

    expect(result).toEqual({
      failedLanes: [],
      findings: [
        {
          lane: "recent",
          ...candidate("Supported Artist", "https://example.com/supported"),
        },
      ],
    });
  });

  test("deduplicates findings in stable round-robin order", async () => {
    const result = await runDiscoveryScouts(vibeBrief, [], async (request) => {
      const lane = laneFromPrompt(request.prompt);
      const candidates =
        lane === "recent"
          ? [
              candidate("Shared Artist", "https://recent.example/shared"),
              candidate("Recent Two", "https://recent.example/two"),
            ]
          : lane === "adjacent"
            ? [
                candidate(" shared   artist ", "https://adjacent.example/shared"),
                candidate("Adjacent Two", "https://adjacent.example/two"),
              ]
            : [candidate("Wildcard One", "https://wildcard.example/one")];
      return {
        output: { candidates },
        sourceUrls: candidates.map(({ sourceUrl }) => sourceUrl),
      };
    });

    expect(result.findings.map(({ artistName }) => artistName)).toEqual([
      "Shared Artist",
      "Wildcard One",
      "Recent Two",
      "Adjacent Two",
    ]);
    expect(result.failedLanes).toEqual([]);
  });

  test("continues after malformed output, a timeout, and total scout failure", async () => {
    const partial = await runDiscoveryScouts(vibeBrief, [], async (request) => {
      const lane = laneFromPrompt(request.prompt);
      if (lane === "recent") {
        throw new DOMException("The operation timed out", "TimeoutError");
      }
      if (lane === "adjacent") {
        return {
          output: { candidates: [{ artistName: "missing fields" }] },
          sourceUrls: [],
        } as never;
      }
      return {
        output: {
          candidates: [
            candidate("Surviving Artist", "https://example.com/surviving"),
          ],
        },
        sourceUrls: ["https://example.com/surviving"],
      };
    });
    expect(partial.findings.map(({ artistName }) => artistName)).toEqual([
      "Surviving Artist",
    ]);
    expect(partial.failedLanes).toEqual(["recent", "adjacent"]);

    const totalFailure = await runDiscoveryScouts(vibeBrief, [], async () => {
      throw new Error("provider unavailable");
    });
    expect(totalFailure).toEqual({
      findings: [],
      failedLanes: ["recent", "adjacent", "wildcard"],
    });
  });
});

function candidate(artistName: string, sourceUrl: string) {
  return {
    artistName,
    fitReason: `Why ${artistName} fits this vibe.`,
    sourceUrl,
    sourceDate: "2026-09-01",
  };
}

function laneFromPrompt(prompt: string) {
  const lane = DISCOVERY_SCOUT_LANES.find(({ id }) =>
    prompt.includes(`<discovery_lane>${id}</discovery_lane>`)
  );
  if (!lane) throw new Error("missing discovery lane");
  return lane.id;
}
