import type { PlaylistCurationResponse } from "../../app/spotify/playlistBuilder/generatePlaylist.server";
import type {
  BuildPlaylistTrack,
  NewStuffAmount,
} from "../../app/spotify/playlistBuilder/playlistBuilder.types";
import {
  PlaylistEvalCaseSchema,
  PlaylistEvalJudgmentsSchema,
  PlaylistEvalReportSchema,
  PlaylistEvalRunSchema,
  type PlaylistEvalCase,
  type PlaylistEvalJudgments,
  type PlaylistEvalReport,
  type PlaylistEvalRun,
  type PlaylistSampleMetrics,
} from "./schemas";

type CandidateSource = "familiar" | "new";

type Candidate = {
  source: CandidateSource;
  track: BuildPlaylistTrack;
};

type ResolvedOutput = {
  source: CandidateSource | "unresolved";
  id: string | null;
  name: string;
  artistName: string;
  artistId: string | null;
};

export function validatePlaylistBenchmark(
  cases: readonly PlaylistEvalCase[]
): void {
  if (cases.length < 1) throw new Error("Benchmark must contain at least one case");

  const caseIds = new Set<string>();
  for (const rawCase of cases) {
    const evalCase = PlaylistEvalCaseSchema.parse(rawCase);
    if (caseIds.has(evalCase.id)) {
      throw new Error(`Duplicate benchmark case ID: ${evalCase.id}`);
    }
    caseIds.add(evalCase.id);

    if (!sameFormData(evalCase)) {
      throw new Error(`Case ${evalCase.id} contains inconsistent form data`);
    }

    const familiar = familiarTracks(evalCase);
    const familiarIds = uniqueNonemptyIds(familiar);
    const newIds = uniqueNonemptyIds(evalCase.input.newSongs);
    const overlap = [...familiarIds].filter((id) => newIds.has(id));
    if (overlap.length > 0) {
      throw new Error(
        `Case ${evalCase.id} uses IDs as both familiar and new: ${overlap.join(", ")}`
      );
    }

    rejectDuplicateIds(evalCase.id, "familiar", familiar);
    rejectDuplicateIds(evalCase.id, "new", evalCase.input.newSongs);
    rejectAmbiguousNormalizedTracks(evalCase.id, familiar, evalCase.input.newSongs);

    if (!evalCase.allowUnresolved) {
      const requestedNew = requestedNewCount(
        evalCase.input.formData.newStuffAmount,
        evalCase.input.formData.songCount
      );
      const requestedFamiliar = evalCase.input.formData.songCount - requestedNew;
      if (newIds.size < requestedNew || familiarIds.size < requestedFamiliar) {
        throw new Error(
          `Case ${evalCase.id} cannot satisfy its fixture-classified novelty target`
        );
      }
    }
  }
}

export function analyzePlaylistSample(
  evalCase: PlaylistEvalCase,
  output: PlaylistCurationResponse
): PlaylistSampleMetrics {
  const familiar = familiarTracks(evalCase);
  const candidates = [
    ...familiar.map((track): Candidate => ({ source: "familiar", track })),
    ...evalCase.input.newSongs.map(
      (track): Candidate => ({ source: "new", track })
    ),
  ];
  const candidateById = new Map(
    candidates.filter(({ track }) => track.id).map((item) => [item.track.id, item])
  );
  const candidateByName = new Map(
    candidates.map((item) => [trackKey(item.track.name, item.track.artist_name), item])
  );
  const inventedIds = new Set<string>();

  const resolved = output.playlist.tracks.map((track): ResolvedOutput => {
    let candidate = track.id ? candidateById.get(track.id) : undefined;
    if (track.id && !candidate) inventedIds.add(track.id);
    candidate ??= candidateByName.get(trackKey(track.name, track.artist_name));

    if (!candidate) {
      return {
        source: "unresolved",
        id: null,
        name: track.name,
        artistName: track.artist_name,
        artistId: null,
      };
    }

    return {
      source: candidate.source,
      id: candidate.track.id,
      name: candidate.track.name,
      artistName: candidate.track.artist_name ?? track.artist_name,
      artistId: candidate.track.artist_id ?? null,
    };
  });

  const duplicateKeys: string[] = [];
  const seenTrackKeys = new Set<string>();
  for (const track of resolved) {
    const key = track.id ? `id:${track.id}` : `name:${trackKey(track.name, track.artistName)}`;
    if (seenTrackKeys.has(key)) duplicateKeys.push(key);
    seenTrackKeys.add(key);
  }

  const selectedTrackIds =
    evalCase.input.formData.newStuffAmount === "all"
      ? []
      : evalCase.input.data.selectedTracks.map(({ track_id }) => track_id);
  const includedIds = new Set(
    resolved.map(({ id }) => id).filter((id): id is string => Boolean(id))
  );
  const missingSelectedTrackIds = selectedTrackIds.filter(
    (id) => !includedIds.has(id)
  );

  const selectedArtistCandidates =
    evalCase.input.formData.newStuffAmount === "all"
      ? []
      : evalCase.input.data.selectedArtists.filter(({ artist_id, artist_name }) =>
          familiar.some(
            (track) =>
              track.artist_id === artist_id ||
              normalize(track.artist_name) === normalize(artist_name)
          )
        );
  const missingSelectedArtistIds = selectedArtistCandidates
    .filter(
      ({ artist_id, artist_name }) =>
        !resolved.some(
          (track) =>
            track.artistId === artist_id ||
            normalize(track.artistName) === normalize(artist_name)
        )
    )
    .map(({ artist_id }) => artist_id);

  const newTracks = resolved.filter(({ source }) => source === "new");
  const familiarCount = resolved.filter(({ source }) => source === "familiar").length;
  const unresolvedCount = resolved.filter(
    ({ source }) => source === "unresolved"
  ).length;
  const requestedCount = requestedNewCount(
    evalCase.input.formData.newStuffAmount,
    evalCase.input.formData.songCount
  );

  const adjacentSameArtistCount = resolved.slice(1).filter((track, index) => {
    const previous = resolved[index];
    return (
      normalize(track.artistName).length > 0 &&
      normalize(track.artistName) === normalize(previous?.artistName)
    );
  }).length;
  const newArtistCounts = new Map<string, number>();
  for (const track of newTracks) {
    const key = track.artistId ?? normalize(track.artistName);
    newArtistCounts.set(key, (newArtistCounts.get(key) ?? 0) + 1);
  }
  const maxNewTracksByArtist = Math.max(0, ...newArtistCounts.values());

  const constraintViolations: string[] = [];
  if (output.playlist.tracks.length !== evalCase.input.formData.songCount) {
    constraintViolations.push("track-count");
  }
  if (duplicateKeys.length > 0) constraintViolations.push("duplicate-track");
  if (inventedIds.size > 0) constraintViolations.push("invented-id");
  if (missingSelectedTrackIds.length > 0) {
    constraintViolations.push("selected-track");
  }
  if (missingSelectedArtistIds.length > 0) {
    constraintViolations.push("selected-artist");
  }
  if (unresolvedCount > 0 && !evalCase.allowUnresolved) {
    constraintViolations.push("unresolved-track");
  }
  if (adjacentSameArtistCount > 0) {
    constraintViolations.push("adjacent-artist");
  }
  if (maxNewTracksByArtist > 3) {
    constraintViolations.push("new-artist-concentration");
  }

  const trackCount = output.playlist.tracks.length;
  const fixtureResolvableCount = trackCount - unresolvedCount;
  return {
    exactTrackCount: trackCount === evalCase.input.formData.songCount,
    trackCount,
    uniqueTrackCount: seenTrackKeys.size,
    duplicateCount: duplicateKeys.length,
    duplicateKeys,
    inventedIds: [...inventedIds],
    unresolvedCount,
    fixtureResolvableCount,
    fixtureResolvableRate: trackCount === 0 ? 0 : fixtureResolvableCount / trackCount,
    selectedTrackCoverage: {
      required: selectedTrackIds.length,
      included: selectedTrackIds.length - missingSelectedTrackIds.length,
      missingIds: missingSelectedTrackIds,
    },
    selectedArtistCoverage: {
      required: selectedArtistCandidates.length,
      represented: selectedArtistCandidates.length - missingSelectedArtistIds.length,
      missingIds: missingSelectedArtistIds,
    },
    novelty: {
      requestedCount,
      newCount: newTracks.length,
      familiarCount,
      unresolvedCount,
      newRatio: trackCount === 0 ? 0 : newTracks.length / trackCount,
      absoluteCountDelta: Math.abs(newTracks.length - requestedCount),
    },
    trackFixtureClassifications: resolved.map(({ source }, index) => ({
      position: index + 1,
      classification: source,
    })),
    adjacentSameArtistCount,
    maxNewTracksByArtist,
    constraintViolations,
  };
}

export function summarizePlaylistRun(
  rawRun: PlaylistEvalRun,
  rawJudgments: PlaylistEvalJudgments
): PlaylistEvalReport {
  const run = PlaylistEvalRunSchema.parse(rawRun);
  const judgments = PlaylistEvalJudgmentsSchema.parse(rawJudgments);
  if (judgments.runId !== run.runId) {
    throw new Error("Judgments belong to a different run");
  }

  const successfulSamples = run.cases.flatMap(({ samples }) =>
    samples.filter((sample) => sample.output && sample.metrics)
  );
  const allSamples = run.cases.flatMap(({ samples }) => samples);
  const judgmentBySample = new Map<string, (typeof judgments.judgments)[number]>();
  for (const judgment of judgments.judgments) {
    const key = sampleKey(judgment.caseId, judgment.sample);
    if (judgmentBySample.has(key)) throw new Error(`Duplicate judgment: ${key}`);
    judgmentBySample.set(key, judgment);
  }

  const orderedJudgments = successfulSamples.map((sample) => {
    const judgment = judgmentBySample.get(sampleKey(sample.caseId, sample.sample));
    if (!judgment) {
      throw new Error(`Missing judgment: ${sampleKey(sample.caseId, sample.sample)}`);
    }
    return judgment;
  });
  if (judgmentBySample.size !== orderedJudgments.length) {
    throw new Error("Judgments contain samples that are not successful run outputs");
  }

  const metrics = successfulSamples.flatMap((sample) =>
    sample.metrics ? [sample.metrics] : []
  );
  const successDenominator = Math.max(1, allSamples.length);
  const metricDenominator = Math.max(1, metrics.length);

  return PlaylistEvalReportSchema.parse({
    subjective: {
      vibeFit: aggregate(orderedJudgments.map(({ vibeFit }) => vibeFit)),
      anchorFidelity: aggregate(
        orderedJudgments.map(({ anchorFidelity }) => anchorFidelity)
      ),
      coherence: aggregate(orderedJudgments.map(({ coherence }) => coherence)),
      orderedFlow: aggregate(
        orderedJudgments.map(({ orderedFlow }) => orderedFlow)
      ),
      noveltyQuality: aggregate(
        orderedJudgments.map(({ noveltyQuality }) => noveltyQuality)
      ),
      verdictCounts: countBy(orderedJudgments.map(({ verdict }) => verdict)),
      failureModeCounts: countBy(
        orderedJudgments.map(({ failureMode }) => failureMode)
      ),
    },
    deterministic: {
      sampleCount: allSamples.length,
      generationSuccessRate: successfulSamples.length / successDenominator,
      exactTrackCountRate:
        metrics.filter(({ exactTrackCount }) => exactTrackCount).length /
        metricDenominator,
      duplicateFreeRate:
        metrics.filter(({ duplicateCount }) => duplicateCount === 0).length /
        metricDenominator,
      fixtureResolutionRate:
        metrics.reduce((sum, metric) => sum + metric.fixtureResolvableRate, 0) /
        metricDenominator,
      requestedMixMeanAbsoluteError:
        metrics.reduce(
          (sum, metric) => sum + metric.novelty.absoluteCountDelta,
          0
        ) / metricDenominator,
    },
    run: {
      runId: run.runId,
      label: run.label,
      sourceRevision: run.sourceRevision,
      benchmarkVersion: run.benchmarkVersion,
      rubricVersion: run.rubricVersion,
      complete: run.complete,
    },
  });
}

export function summarizeDeterministicRun(rawRun: PlaylistEvalRun) {
  const run = PlaylistEvalRunSchema.parse(rawRun);
  const allSamples = run.cases.flatMap(({ samples }) => samples);
  const successfulSamples = allSamples.filter(
    (sample) => sample.output && sample.metrics
  );
  const metrics = successfulSamples.flatMap((sample) =>
    sample.metrics ? [sample.metrics] : []
  );
  const metricDenominator = Math.max(1, metrics.length);
  const caseOverlap = run.cases.map(({ case: evalCase, samples }) => {
    const trackSets = samples.flatMap(({ output }) =>
      output
        ? [
            new Set(
              output.playlist.tracks.map(({ name, artist_name }) =>
                trackKey(name, artist_name)
              )
            ),
          ]
        : []
    );
    const overlaps: number[] = [];
    for (let left = 0; left < trackSets.length; left += 1) {
      for (let right = left + 1; right < trackSets.length; right += 1) {
        overlaps.push(jaccard(trackSets[left] ?? new Set(), trackSets[right] ?? new Set()));
      }
    }
    return {
      caseId: evalCase.id,
      successfulSamples: trackSets.length,
      meanPairwiseTrackOverlap:
        overlaps.length === 0
          ? null
          : overlaps.reduce((sum, value) => sum + value, 0) / overlaps.length,
    };
  });
  const measuredOverlaps = caseOverlap.flatMap(({ meanPairwiseTrackOverlap }) =>
    meanPairwiseTrackOverlap === null ? [] : [meanPairwiseTrackOverlap]
  );

  return {
    runId: run.runId,
    label: run.label,
    complete: run.complete,
    attemptedSamples: allSamples.length,
    successfulSamples: successfulSamples.length,
    generationSuccessRate:
      successfulSamples.length / Math.max(1, allSamples.length),
    exactTrackCountRate:
      metrics.filter(({ exactTrackCount }) => exactTrackCount).length /
      metricDenominator,
    duplicateFreeRate:
      metrics.filter(({ duplicateCount }) => duplicateCount === 0).length /
      metricDenominator,
    fixtureResolutionRate:
      metrics.reduce((sum, metric) => sum + metric.fixtureResolvableRate, 0) /
      metricDenominator,
    requestedMixMeanAbsoluteError:
      metrics.reduce(
        (sum, metric) => sum + metric.novelty.absoluteCountDelta,
        0
      ) / metricDenominator,
    meanCrossSampleTrackOverlap:
      measuredOverlaps.length === 0
        ? null
        : measuredOverlaps.reduce((sum, value) => sum + value, 0) /
          measuredOverlaps.length,
    caseOverlap,
  };
}

export function requestedNewCount(
  amount: NewStuffAmount,
  songCount: number
): number {
  if (amount === "none") return 0;
  if (amount === "all") return songCount;
  return Math.round(songCount * (amount === "sprinkle" ? 0.2 : 0.5));
}

function familiarTracks(evalCase: PlaylistEvalCase): BuildPlaylistTrack[] {
  const pool = evalCase.input.data.familiarSongsPool;
  return [
    ...pool.specifiedTracks,
    ...pool.topTracks,
    ...pool.likedTracks,
    ...pool.recentlyPlayedTracks,
    ...pool.artistCatalogs.flatMap(({ tracks }) => tracks),
  ];
}

function uniqueNonemptyIds(tracks: readonly BuildPlaylistTrack[]): Set<string> {
  return new Set(tracks.map(({ id }) => id).filter(Boolean));
}

function rejectDuplicateIds(
  caseId: string,
  source: CandidateSource,
  tracks: readonly BuildPlaylistTrack[]
): void {
  const seen = new Set<string>();
  for (const { id } of tracks) {
    if (!id) continue;
    if (seen.has(id)) {
      throw new Error(`Case ${caseId} has duplicate ${source} ID: ${id}`);
    }
    seen.add(id);
  }
}

function rejectAmbiguousNormalizedTracks(
  caseId: string,
  familiar: readonly BuildPlaylistTrack[],
  newTracks: readonly BuildPlaylistTrack[]
): void {
  const familiarKeys = new Set(
    familiar.map(({ name, artist_name }) => trackKey(name, artist_name))
  );
  const overlap = newTracks
    .map(({ name, artist_name }) => trackKey(name, artist_name))
    .find((key) => familiarKeys.has(key));
  if (overlap) {
    throw new Error(
      `Case ${caseId} classifies the same normalized track as familiar and new: ${overlap}`
    );
  }
}

function sameFormData(evalCase: PlaylistEvalCase): boolean {
  return (
    evalCase.input.formData.songCount === evalCase.input.data.formData.songCount &&
    evalCase.input.formData.newStuffAmount ===
      evalCase.input.data.formData.newStuffAmount &&
    evalCase.input.formData.customInstructions ===
      evalCase.input.data.formData.customInstructions
  );
}

function trackKey(name: string, artistName: string | null | undefined): string {
  return `${normalize(name)}|${normalize(artistName)}`;
}

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function sampleKey(caseId: string, sample: number): string {
  return `${caseId}:${sample}`;
}

function aggregate(values: number[]) {
  if (values.length === 0) throw new Error("Cannot aggregate an empty score set");
  return {
    mean: values.reduce((sum, value) => sum + value, 0) / values.length,
    minimum: Math.min(...values),
    maximum: Math.max(...values),
  };
}

function countBy(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}

function jaccard(left: Set<string>, right: Set<string>): number {
  const union = new Set([...left, ...right]);
  if (union.size === 0) return 1;
  let intersection = 0;
  for (const value of left) if (right.has(value)) intersection += 1;
  return intersection / union.size;
}
