import type {
  DiscoveryEvidence,
  DiscoveryScoutLane,
} from "../../app/spotify/playlistBuilder/playlistDiscoveryScouts.server";
import { VibeBriefSchema } from "../../app/spotify/playlistBuilder/vibeBrief";
import type { VibeBrief } from "../../app/spotify/playlistBuilder/vibeBrief";
import { sanitizeArtifactError } from "../playlist-quality/artifactStore";
import type { DiscoveryEvalCase } from "./benchmark.v1";

export const DISCOVERY_BENCHMARK_VERSION = "1.0.0";
export const DISCOVERY_RUBRIC_VERSION = "1.0.0";

export type DiscoveryEvalResult = {
  vibeBrief: VibeBrief;
  resolvedArtists: Array<{ artistId: string; artistName: string }>;
  discoveryEvidence: DiscoveryEvidence[];
  failedScoutLanes: DiscoveryScoutLane[];
};

export type DiscoveryEvalSample =
  | (DiscoveryEvalResult & {
      status: "success";
      caseId: string;
      sample: number;
      startedAt: string;
      durationMs: number;
      scoutRequestStatus: "complete" | "partial" | "unavailable";
    })
  | {
      status: "failure";
      caseId: string;
      sample: number;
      startedAt: string;
      durationMs: number;
      error: { name: string; message: string };
    };

export type DiscoveryEvalRun = {
  benchmarkVersion: string;
  label: string;
  modelId: string;
  sourceRevision: string;
  sourceDirty: boolean;
  samplesPerCase: number;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  complete: boolean;
  cases: Array<{
    case: DiscoveryEvalCase;
    samples: DiscoveryEvalSample[];
  }>;
};

export async function runDiscoveryBenchmark({
  label,
  modelId,
  sourceRevision,
  sourceDirty,
  samplesPerCase,
  cases,
  generate,
  onSample,
  now = Date.now,
}: {
  label: string;
  modelId: string;
  sourceRevision: string;
  sourceDirty: boolean;
  samplesPerCase: number;
  cases: readonly DiscoveryEvalCase[];
  generate: (
    evalCase: DiscoveryEvalCase
  ) => Promise<DiscoveryEvalResult>;
  onSample?: (
    sample: DiscoveryEvalSample,
    evalCase: DiscoveryEvalCase
  ) => void | Promise<void>;
  now?: () => number;
}): Promise<DiscoveryEvalRun> {
  validateDiscoveryBenchmark(cases, samplesPerCase);
  const runStarted = now();
  const caseRuns: DiscoveryEvalRun["cases"] = [];

  for (const evalCase of cases) {
    const samples: DiscoveryEvalRun["cases"][number]["samples"] = [];
    for (let sampleNumber = 1; sampleNumber <= samplesPerCase; sampleNumber += 1) {
      const sampleStarted = now();
      let sample: DiscoveryEvalSample;
      try {
        const result = await generate(evalCase);
        sample = {
          status: "success",
          caseId: evalCase.id,
          sample: sampleNumber,
          startedAt: new Date(sampleStarted).toISOString(),
          durationMs: Math.max(0, now() - sampleStarted),
          scoutRequestStatus:
            result.failedScoutLanes.length === 0
              ? "complete"
              : result.failedScoutLanes.length === 3
                ? "unavailable"
                : "partial",
          ...result,
        };
      } catch (error) {
        sample = {
          status: "failure",
          caseId: evalCase.id,
          sample: sampleNumber,
          startedAt: new Date(sampleStarted).toISOString(),
          durationMs: Math.max(0, now() - sampleStarted),
          error: sanitizeArtifactError(error),
        };
      }
      samples.push(sample);
      await onSample?.(sample, evalCase);
    }
    caseRuns.push({ case: evalCase, samples });
  }

  const completedAt = now();

  return {
    benchmarkVersion: DISCOVERY_BENCHMARK_VERSION,
    label,
    modelId,
    sourceRevision,
    sourceDirty,
    samplesPerCase,
    startedAt: new Date(runStarted).toISOString(),
    completedAt: new Date(completedAt).toISOString(),
    durationMs: Math.max(0, completedAt - runStarted),
    complete: caseRuns.every(({ samples }) =>
      samples.every(({ status }) => status === "success")
    ),
    cases: caseRuns,
  };
}

export function validateDiscoveryBenchmark(
  cases: readonly DiscoveryEvalCase[],
  samplesPerCase: number
): void {
  if (cases.length === 0) throw new Error("At least one eval case is required");
  if (
    !Number.isInteger(samplesPerCase) ||
    samplesPerCase < 2 ||
    samplesPerCase > 10
  ) {
    throw new Error("samples must be an integer between 2 and 10");
  }
  if (new Set(cases.map(({ id }) => id)).size !== cases.length) {
    throw new Error("Discovery eval case IDs must be unique");
  }
  for (const evalCase of cases) {
    VibeBriefSchema.parse(evalCase.referenceVibeBrief);
  }
}

export function summarizeDiscoveryRun(run: DiscoveryEvalRun) {
  const allSamples = run.cases.flatMap(({ samples }) => samples);
  const successfulSamples = allSamples.filter(isSuccessfulSample);
  return {
    benchmarkVersion: run.benchmarkVersion,
    label: run.label,
    complete: run.complete,
    samplesPerCase: run.samplesPerCase,
    attemptedSamples: allSamples.length,
    successfulSamples: successfulSamples.length,
    generationSuccessRate:
      successfulSamples.length / Math.max(1, allSamples.length),
    cases: run.cases.map(({ case: evalCase, samples }) => {
      const successful = samples.filter(isSuccessfulSample);
      return {
        caseId: evalCase.id,
        failedSamples: samples.length - successful.length,
        allScoutRequestsCompletedSamples: successful.filter(
          ({ scoutRequestStatus }) => scoutRequestStatus === "complete"
        ).length,
        partialScoutRequestFailureSamples: successful.filter(
          ({ scoutRequestStatus }) => scoutRequestStatus === "partial"
        ).length,
        allScoutRequestsFailedSamples: successful.filter(
          ({ scoutRequestStatus }) => scoutRequestStatus === "unavailable"
        ).length,
        zeroEvidenceSamples: successful.filter(
          ({ discoveryEvidence }) => discoveryEvidence.length === 0
        ).length,
        meanResolvedArtistCount: meanOrNull(
          successful.map(({ resolvedArtists }) => resolvedArtists.length)
        ),
        meanEvidenceBackedArtistCount: meanOrNull(
          successful.map(({ discoveryEvidence }) => discoveryEvidence.length)
        ),
        uniqueResolvedArtistsAcrossSamples: new Set(
          successful.flatMap(({ resolvedArtists }) =>
            resolvedArtists.map(({ artistId }) => artistId)
          )
        ).size,
        meanPairwiseResolvedArtistOverlap: pairwiseOverlap(
          successful.map(
            ({ resolvedArtists }) =>
              new Set(resolvedArtists.map(({ artistId }) => artistId))
          )
        ),
        uniqueEvidenceBackedArtistsAcrossSamples: new Set(
          successful.flatMap(({ discoveryEvidence }) =>
            discoveryEvidence.map(({ artistId }) => artistId)
          )
        ).size,
        meanPairwiseEvidenceBackedArtistOverlap: pairwiseOverlap(
          successful.map(
            ({ discoveryEvidence }) =>
              new Set(discoveryEvidence.map(({ artistId }) => artistId))
          )
        ),
      };
    }),
  };
}

export function createDiscoveryJudgePacket(run: DiscoveryEvalRun) {
  return {
    rubricVersion: DISCOVERY_RUBRIC_VERSION,
    benchmarkVersion: run.benchmarkVersion,
    cases: run.cases.map(({ case: evalCase, samples }) => ({
      id: evalCase.id,
      title: evalCase.title,
      intent: evalCase.intent,
      knownArtists: evalCase.knownArtists,
      referenceVibeBrief: evalCase.referenceVibeBrief,
      samples,
    })),
  };
}

function pairwiseOverlap(samples: readonly Set<string>[]): number | null {
  const overlaps: number[] = [];
  for (let left = 0; left < samples.length; left += 1) {
    for (let right = left + 1; right < samples.length; right += 1) {
      const union = new Set([...samples[left], ...samples[right]]);
      const intersection = [...samples[left]].filter((artist) =>
        samples[right].has(artist)
      );
      if (union.size > 0) {
        overlaps.push(intersection.length / union.size);
      }
    }
  }
  return overlaps.length > 0 ? mean(overlaps) : null;
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function meanOrNull(values: readonly number[]): number | null {
  return values.length > 0 ? mean(values) : null;
}

function isSuccessfulSample(
  sample: DiscoveryEvalSample
): sample is Extract<DiscoveryEvalSample, { status: "success" }> {
  return sample.status === "success";
}

export function validateDiscoveryLabel(label: string): void {
  if (!/^[a-z0-9][a-z0-9._-]{0,99}$/i.test(label)) {
    throw new Error(
      "label must use 1-100 letters, numbers, dots, underscores, or hyphens"
    );
  }
}
