import type { PlaylistCurationResponse as PlaylistCurationOutput } from "../../app/spotify/playlistBuilder/generatePlaylist.server";
import { PlaylistCurationResponse } from "../../app/spotify/playlistBuilder/generatePlaylist.server";
import { PLAYLIST_GENERATION_MODEL_ID } from "../../app/spotify/playlistBuilder/aiGeneration.server";
import type { GeneratePlaylistInput } from "../../app/spotify/playlistBuilder/playlistBuilder.types";
import { analyzePlaylistSample, validatePlaylistBenchmark } from "./metrics";
import {
  BlindComparisonKeySchema,
  BlindComparisonPacketSchema,
  PLAYLIST_BENCHMARK_VERSION,
  PLAYLIST_EVAL_SCHEMA_VERSION,
  PLAYLIST_RUBRIC_VERSION,
  PlaylistJudgePacketSchema,
  PlaylistEvalRunSchema,
  type BlindComparisonKey,
  type BlindComparisonPacket,
  type PlaylistEvalCase,
  type PlaylistEvalRun,
  type PlaylistEvalSample,
} from "./schemas";

type PlaylistGenerator = (
  input: GeneratePlaylistInput
) => Promise<PlaylistCurationOutput>;

export type RunPlaylistBenchmarkOptions = {
  label: string;
  cases: readonly PlaylistEvalCase[];
  samplesPerCase: number;
  sourceRevision: string;
  sourceDirty: boolean;
  generate: PlaylistGenerator;
  onSample?: (
    sample: PlaylistEvalSample,
    evalCase: PlaylistEvalCase
  ) => Promise<void>;
  now?: () => number;
};

export async function runPlaylistBenchmark({
  label,
  cases,
  samplesPerCase,
  sourceRevision,
  sourceDirty,
  generate,
  onSample,
  now = Date.now,
}: RunPlaylistBenchmarkOptions): Promise<PlaylistEvalRun> {
  validatePlaylistBenchmark(cases);
  const cleanLabel = validateRunLabel(label);
  if (!Number.isInteger(samplesPerCase) || samplesPerCase < 1 || samplesPerCase > 10) {
    throw new RangeError("samplesPerCase must be an integer between 1 and 10");
  }

  const runStarted = now();
  const caseResults: PlaylistEvalRun["cases"] = [];
  for (const evalCase of cases) {
    const samples: PlaylistEvalSample[] = [];
    for (let sampleNumber = 1; sampleNumber <= samplesPerCase; sampleNumber += 1) {
      const sampleStarted = now();
      let sample: PlaylistEvalSample;
      try {
        const output = PlaylistCurationResponse.parse(
          await generate(evalCase.input)
        );
        sample = {
          caseId: evalCase.id,
          sample: sampleNumber,
          startedAt: new Date(sampleStarted).toISOString(),
          durationMs: Math.max(0, now() - sampleStarted),
          output,
          metrics: analyzePlaylistSample(evalCase, output),
        };
      } catch (error) {
        sample = {
          caseId: evalCase.id,
          sample: sampleNumber,
          startedAt: new Date(sampleStarted).toISOString(),
          durationMs: Math.max(0, now() - sampleStarted),
          error: sanitizeError(error),
        };
      }
      samples.push(sample);
      await onSample?.(sample, evalCase);
    }
    caseResults.push({ case: evalCase, samples });
  }

  const completedAt = now();
  return PlaylistEvalRunSchema.parse({
    schemaVersion: PLAYLIST_EVAL_SCHEMA_VERSION,
    benchmarkVersion: PLAYLIST_BENCHMARK_VERSION,
    rubricVersion: PLAYLIST_RUBRIC_VERSION,
    runId: `${cleanLabel}-${compactTimestamp(runStarted)}`,
    label: cleanLabel,
    sourceRevision,
    sourceDirty,
    modelId: PLAYLIST_GENERATION_MODEL_ID,
    samplesPerCase,
    startedAt: new Date(runStarted).toISOString(),
    completedAt: new Date(completedAt).toISOString(),
    durationMs: Math.max(0, completedAt - runStarted),
    complete: caseResults.every(({ samples }) =>
      samples.every(({ output, metrics, error }) => output && metrics && !error)
    ),
    cases: caseResults,
  });
}

export function createBlindComparison(
  rawBaseline: PlaylistEvalRun,
  rawCandidate: PlaylistEvalRun,
  seed: string
): { packet: BlindComparisonPacket; key: BlindComparisonKey } {
  const baseline = PlaylistEvalRunSchema.parse(rawBaseline);
  const candidate = PlaylistEvalRunSchema.parse(rawCandidate);
  if (
    baseline.benchmarkVersion !== candidate.benchmarkVersion ||
    baseline.rubricVersion !== candidate.rubricVersion
  ) {
    throw new Error("Runs must use the same benchmark and rubric versions");
  }

  const candidateByCase = new Map(
    candidate.cases.map((result) => [result.case.id, result])
  );
  const comparisonId = `comparison-${stableHash(
    `${seed}:${baseline.runId}:${candidate.runId}`
  ).toString(16)}`;
  const pairs: BlindComparisonPacket["pairs"] = [];
  const mappings: BlindComparisonKey["mappings"] = [];

  for (const baselineCase of baseline.cases) {
    const candidateCase = candidateByCase.get(baselineCase.case.id);
    if (!candidateCase) {
      throw new Error(`Candidate run is missing case ${baselineCase.case.id}`);
    }
    if (baselineCase.samples.length !== candidateCase.samples.length) {
      throw new Error(`Runs have different sample counts for ${baselineCase.case.id}`);
    }

    for (const baselineSample of baselineCase.samples) {
      const candidateSample = candidateCase.samples.find(
        ({ sample }) => sample === baselineSample.sample
      );
      if (!candidateSample) {
        throw new Error(
          `Candidate run is missing ${baselineCase.case.id}:${baselineSample.sample}`
        );
      }
      const baselineOutput = baselineSample.output;
      const candidateOutput = candidateSample.output;
      if (!baselineOutput || !candidateOutput) continue;

      const pairId = `${baselineCase.case.id}:${baselineSample.sample}`;
      const swap = stableHash(`${seed}:${pairId}`) % 2 === 1;
      const A = swap
        ? { output: candidateOutput, metrics: candidateSample.metrics }
        : { output: baselineOutput, metrics: baselineSample.metrics };
      const B = swap
        ? { output: baselineOutput, metrics: baselineSample.metrics }
        : { output: candidateOutput, metrics: candidateSample.metrics };
      pairs.push({
        pairId,
        caseId: baselineCase.case.id,
        sample: baselineSample.sample,
        intent: baselineCase.case.intent,
        request: judgeRequest(baselineCase.case),
        A: blindEvaluatedPlaylist(A.output, A.metrics),
        B: blindEvaluatedPlaylist(B.output, B.metrics),
      });
      mappings.push({
        pairId,
        A: swap ? "candidate" : "baseline",
        B: swap ? "baseline" : "candidate",
      });
    }
  }

  const extraCase = candidate.cases.find(
    ({ case: candidateCase }) =>
      !baseline.cases.some(
        ({ case: baselineEvalCase }) =>
          baselineEvalCase.id === candidateCase.id
      )
  );
  if (extraCase) throw new Error(`Baseline run is missing case ${extraCase.case.id}`);

  return {
    packet: BlindComparisonPacketSchema.parse({
      schemaVersion: PLAYLIST_EVAL_SCHEMA_VERSION,
      benchmarkVersion: baseline.benchmarkVersion,
      rubricVersion: baseline.rubricVersion,
      comparisonId,
      pairs,
    }),
    key: BlindComparisonKeySchema.parse({
      schemaVersion: PLAYLIST_EVAL_SCHEMA_VERSION,
      comparisonId,
      baselineRunId: baseline.runId,
      baselineLabel: baseline.label,
      candidateRunId: candidate.runId,
      candidateLabel: candidate.label,
      mappings,
    }),
  };
}

export function createJudgePacket(run: PlaylistEvalRun) {
  const parsed = PlaylistEvalRunSchema.parse(run);
  return PlaylistJudgePacketSchema.parse({
    schemaVersion: parsed.schemaVersion,
    benchmarkVersion: parsed.benchmarkVersion,
    rubricVersion: parsed.rubricVersion,
    samples: parsed.cases.flatMap(({ case: evalCase, samples }) =>
      samples.flatMap((sample) =>
        sample.output
          ? [
              {
                caseId: evalCase.id,
                sample: sample.sample,
                split: evalCase.split,
                rationale: evalCase.rationale,
                intent: evalCase.intent,
                request: judgeRequest(evalCase),
                playlist: blindPlaylist(sample.output),
                fixtureClassifications: sample.metrics
                  ? {
                      summary: sample.metrics.novelty,
                      tracks: sample.metrics.trackFixtureClassifications,
                    }
                  : undefined,
              },
            ]
          : []
      )
    ),
  });
}

function judgeRequest(evalCase: PlaylistEvalCase) {
  return {
    selectedTracks: evalCase.input.data.selectedTracks.map(
      ({ track_name, artist_name }) => ({
        name: track_name ?? "",
        artist_name: artist_name ?? "",
      })
    ),
    selectedArtists: evalCase.input.data.selectedArtists.map(
      ({ artist_name }) => artist_name ?? ""
    ),
    customInstructions: evalCase.input.formData.customInstructions ?? "",
    newStuffAmount: evalCase.input.formData.newStuffAmount,
    songCount: evalCase.input.formData.songCount,
  };
}

function blindEvaluatedPlaylist(
  output: PlaylistCurationOutput,
  metrics: PlaylistEvalSample["metrics"]
) {
  return {
    ...blindPlaylist(output),
    fixtureClassifications: metrics
      ? {
          summary: metrics.novelty,
          tracks: metrics.trackFixtureClassifications,
        }
      : undefined,
  };
}

function blindPlaylist(output: PlaylistCurationOutput) {
  return {
    name: output.playlist.name,
    description: output.playlist.description,
    tracks: output.playlist.tracks.map(({ name, artist_name }) => ({
      name,
      artist_name,
    })),
  };
}

function validateRunLabel(label: string): string {
  const clean = label.trim();
  if (!/^[a-z0-9][a-z0-9._-]{0,79}$/i.test(clean)) {
    throw new Error(
      "Run label must be 1-80 letters, numbers, dots, underscores, or hyphens"
    );
  }
  return clean;
}

function sanitizeError(error: unknown): { name: string; message: string } {
  const name = error instanceof Error ? error.name : "Error";
  const rawMessage = error instanceof Error ? error.message : "Unknown failure";
  const message = rawMessage
    .replace(/sk-[a-z0-9_-]+/gi, "[redacted]")
    .replace(/bearer\s+[a-z0-9._-]+/gi, "Bearer [redacted]")
    .slice(0, 500);
  return { name: name.slice(0, 100), message };
}

function compactTimestamp(milliseconds: number): string {
  return new Date(milliseconds).toISOString().replace(/[-:.]/g, "");
}

function stableHash(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
