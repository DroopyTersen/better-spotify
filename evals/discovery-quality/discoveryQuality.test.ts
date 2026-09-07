import { describe, expect, test } from "bun:test";
import type { DiscoveryEvidence } from "../../app/spotify/playlistBuilder/playlistDiscoveryScouts.server";
import { discoveryQualityCases } from "./benchmark.v1";
import {
  createDiscoveryJudgePacket,
  runDiscoveryBenchmark,
  summarizeDiscoveryRun,
  validateDiscoveryBenchmark,
  validateDiscoveryLabel,
} from "./harness";

describe("discovery quality evaluation", () => {
  test("uses valid public benchmark briefs and requires multiple samples", () => {
    expect(discoveryQualityCases).toHaveLength(3);
    expect(() =>
      validateDiscoveryBenchmark(discoveryQualityCases, 3)
    ).not.toThrow();
    expect(() => validateDiscoveryBenchmark(discoveryQualityCases, 1)).toThrow(
      "between 2 and 10"
    );
    expect(() =>
      validateDiscoveryBenchmark(
        [discoveryQualityCases[0], discoveryQualityCases[0]],
        2
      )
    ).toThrow("IDs must be unique");
    expect(() => validateDiscoveryLabel("candidate-1")).not.toThrow();
    expect(() => validateDiscoveryLabel("../../outside")).toThrow(
      "label must use"
    );
  });

  test("reports cross-sample discovery variety without enforcing lane counts", async () => {
    let generation = 0;
    const evalCase = discoveryQualityCases[0];
    const run = await runDiscoveryBenchmark({
      label: "candidate",
      modelId: "test-model",
      sourceRevision: "abc123",
      sourceDirty: false,
      samplesPerCase: 2,
      cases: [evalCase],
      generate: async () => {
        generation += 1;
        const artistNames =
          generation === 1
            ? ["Artist One", "Artist Two"]
            : ["Artist Two", "Artist Three"];
        return {
          vibeBrief: evalCase.referenceVibeBrief,
          resolvedArtists: artistNames.map((artistName) => ({
            artistId: `id-${artistName}`,
            artistName,
          })),
          discoveryEvidence: artistNames.map((artistName, index) =>
            evidence(artistName, index === 0 ? "recent" : "wildcard")
          ),
          failedScoutLanes: generation === 1 ? [] : ["wildcard"],
        };
      },
    });

    expect(summarizeDiscoveryRun(run).cases).toEqual([
      {
        caseId: evalCase.id,
        failedSamples: 0,
        allScoutRequestsCompletedSamples: 1,
        partialScoutRequestFailureSamples: 1,
        allScoutRequestsFailedSamples: 0,
        zeroEvidenceSamples: 0,
        meanResolvedArtistCount: 2,
        meanEvidenceBackedArtistCount: 2,
        uniqueResolvedArtistsAcrossSamples: 3,
        meanPairwiseResolvedArtistOverlap: 1 / 3,
        uniqueEvidenceBackedArtistsAcrossSamples: 3,
        meanPairwiseEvidenceBackedArtistOverlap: 1 / 3,
      },
    ]);
    const packet = createDiscoveryJudgePacket(run);
    expect(packet.cases[0]?.referenceVibeBrief).toEqual(
      evalCase.referenceVibeBrief
    );
    expect(packet.cases[0]?.knownArtists).toEqual(evalCase.knownArtists);
    expect(packet.cases[0]?.samples).toHaveLength(2);
    const secondSample = packet.cases[0]?.samples[1];
    expect(secondSample?.status).toBe("success");
    if (secondSample?.status === "success") {
      expect(secondSample.scoutRequestStatus).toBe("partial");
    }
  });

  test("records total scout failure as a baseline-only sample", async () => {
    const evalCase = discoveryQualityCases[0];
    const run = await runDiscoveryBenchmark({
      label: "baseline-only",
      modelId: "test-model",
      sourceRevision: "abc123",
      sourceDirty: false,
      samplesPerCase: 2,
      cases: [evalCase],
      generate: async () => ({
        vibeBrief: evalCase.referenceVibeBrief,
        resolvedArtists: [
          { artistId: "baseline-id", artistName: "Baseline Artist" },
        ],
        discoveryEvidence: [],
        failedScoutLanes: ["recent", "adjacent", "wildcard"],
      }),
    });

    expect(
      run.cases[0]?.samples.map((sample) =>
        sample.status === "success" ? sample.scoutRequestStatus : "failure"
      )
    ).toEqual(["unavailable", "unavailable"]);
    expect(summarizeDiscoveryRun(run).cases[0]).toMatchObject({
      failedSamples: 0,
      allScoutRequestsCompletedSamples: 0,
      partialScoutRequestFailureSamples: 0,
      allScoutRequestsFailedSamples: 2,
      zeroEvidenceSamples: 2,
      meanResolvedArtistCount: 1,
      meanEvidenceBackedArtistCount: 0,
      uniqueEvidenceBackedArtistsAcrossSamples: 0,
      meanPairwiseEvidenceBackedArtistOverlap: null,
    });
  });

  test("persists progress and continues after a sanitized sample failure", async () => {
    const evalCase = discoveryQualityCases[0];
    const recordedStatuses: string[] = [];
    let generation = 0;
    const run = await runDiscoveryBenchmark({
      label: "partial-run",
      modelId: "test-model",
      sourceRevision: "abc123",
      sourceDirty: false,
      samplesPerCase: 2,
      cases: [evalCase],
      generate: async () => {
        generation += 1;
        if (generation === 1) {
          throw new Error("Provider rejected sk-secret Bearer private-token");
        }
        return {
          vibeBrief: evalCase.referenceVibeBrief,
          resolvedArtists: [
            { artistId: "resolved-id", artistName: "Resolved Artist" },
          ],
          discoveryEvidence: [],
          failedScoutLanes: [],
        };
      },
      onSample: (sample) => {
        recordedStatuses.push(`${sample.caseId}:${sample.sample}:${sample.status}`);
      },
    });

    expect(recordedStatuses).toEqual([
      `${evalCase.id}:1:failure`,
      `${evalCase.id}:2:success`,
    ]);
    expect(run.complete).toBeFalse();
    const failedSample = run.cases[0]?.samples[0];
    expect(failedSample?.status).toBe("failure");
    if (failedSample?.status === "failure") {
      expect(failedSample.error.message).toBe(
        "Provider rejected [redacted] Bearer [redacted]"
      );
    }
    expect(summarizeDiscoveryRun(run)).toMatchObject({
      complete: false,
      attemptedSamples: 2,
      successfulSamples: 1,
      generationSuccessRate: 0.5,
      cases: [{ failedSamples: 1, zeroEvidenceSamples: 1 }],
    });
  });

  test("uses Spotify artist IDs for cross-sample variety", async () => {
    const evalCase = discoveryQualityCases[0];
    let generation = 0;
    const run = await runDiscoveryBenchmark({
      label: "artist-identities",
      modelId: "test-model",
      sourceRevision: "abc123",
      sourceDirty: false,
      samplesPerCase: 2,
      cases: [evalCase],
      generate: async () => {
        generation += 1;
        const artistId = `distinct-id-${generation}`;
        return {
          vibeBrief: evalCase.referenceVibeBrief,
          resolvedArtists: [{ artistId, artistName: "Shared Display Name" }],
          discoveryEvidence: [
            { ...evidence("Shared Display Name", "recent"), artistId },
          ],
          failedScoutLanes: [],
        };
      },
    });

    expect(summarizeDiscoveryRun(run).cases[0]).toMatchObject({
      uniqueResolvedArtistsAcrossSamples: 2,
      meanPairwiseResolvedArtistOverlap: 0,
      uniqueEvidenceBackedArtistsAcrossSamples: 2,
      meanPairwiseEvidenceBackedArtistOverlap: 0,
    });
  });
});

function evidence(
  artistName: string,
  lane: DiscoveryEvidence["lane"]
): DiscoveryEvidence {
  return {
    lane,
    artistId: `id-${artistName}`,
    artistName,
    fitReason: `${artistName} fits the brief for a concrete musical reason.`,
    sourceUrl: `https://example.com/${artistName.replaceAll(" ", "-")}`,
    sourceDate: "2026-09-01",
  };
}
