import { z } from "zod";
import { PlaylistCurationResponse } from "../../app/spotify/playlistBuilder/generatePlaylist.server";
import { BuildPlaylistTrack } from "../../app/spotify/playlistBuilder/playlistBuilder.types";

export const PLAYLIST_EVAL_SCHEMA_VERSION = 1 as const;
export const PLAYLIST_BENCHMARK_VERSION = "1.0.0" as const;
export const PLAYLIST_RUBRIC_VERSION = "1.0.1" as const;

const ArtifactVersionSchema = z.string().trim().min(1).max(100);

const NewStuffAmountSchema = z.enum(["none", "sprinkle", "half", "all"]);

const FormDataSchema = z.object({
  customInstructions: z.string().optional(),
  newStuffAmount: NewStuffAmountSchema,
  songCount: z.number().int().min(1).max(100),
});

const SelectedTrackSchema = z.object({
  track_id: z.string().min(1),
  track_name: z.string().optional(),
  artist_id: z.string().nullable().optional(),
  artist_name: z.string().nullable().optional(),
});

const SelectedArtistSchema = z.object({
  artist_id: z.string().min(1),
  artist_name: z.string().optional(),
});

const FamiliarSongsPoolSchema = z.object({
  specifiedTracks: z.array(BuildPlaylistTrack),
  topTracks: z.array(BuildPlaylistTrack),
  artistCatalogs: z.array(
    z.object({
      artist_id: z.string().min(1),
      artist_name: z.string(),
      tracks: z.array(BuildPlaylistTrack),
    })
  ),
  likedTracks: z.array(BuildPlaylistTrack),
  recentlyPlayedTracks: z.array(BuildPlaylistTrack),
});

export const GeneratePlaylistEvalInputSchema = z.object({
  formData: FormDataSchema,
  data: z.object({
    selectedTracks: z.array(SelectedTrackSchema),
    selectedArtists: z.array(SelectedArtistSchema),
    familiarSongsPool: FamiliarSongsPoolSchema,
    formData: FormDataSchema,
  }),
  newSongs: z.array(BuildPlaylistTrack),
});

export type PlaylistEvalInput = z.infer<
  typeof GeneratePlaylistEvalInputSchema
>;

export const PlaylistEvalCaseSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().trim().min(1).max(200),
  split: z.enum(["development", "holdout"]),
  rationale: z.string().trim().min(1).max(1_000),
  intent: z.object({
    vibe: z.string().trim().min(1).max(1_000),
    mustHave: z.array(z.string().trim().min(1)).max(20),
    mustAvoid: z.array(z.string().trim().min(1)).max(20),
    arc: z.string().trim().min(1).max(1_000).optional(),
    novelty: z.string().trim().min(1).max(1_000),
  }),
  allowUnresolved: z.boolean(),
  input: GeneratePlaylistEvalInputSchema,
});

export type PlaylistEvalCase = z.infer<typeof PlaylistEvalCaseSchema>;

export const PlaylistSampleMetricsSchema = z.object({
  exactTrackCount: z.boolean(),
  trackCount: z.number().int().nonnegative(),
  uniqueTrackCount: z.number().int().nonnegative(),
  duplicateCount: z.number().int().nonnegative(),
  duplicateKeys: z.array(z.string()),
  inventedIds: z.array(z.string()),
  unresolvedCount: z.number().int().nonnegative(),
  fixtureResolvableCount: z.number().int().nonnegative(),
  fixtureResolvableRate: z.number().min(0).max(1),
  selectedTrackCoverage: z.object({
    required: z.number().int().nonnegative(),
    included: z.number().int().nonnegative(),
    missingIds: z.array(z.string()),
  }),
  selectedArtistCoverage: z.object({
    required: z.number().int().nonnegative(),
    represented: z.number().int().nonnegative(),
    missingIds: z.array(z.string()),
  }),
  novelty: z.object({
    requestedCount: z.number().int().nonnegative(),
    newCount: z.number().int().nonnegative(),
    familiarCount: z.number().int().nonnegative(),
    unresolvedCount: z.number().int().nonnegative(),
    newRatio: z.number().min(0).max(1).nullable(),
    absoluteCountDelta: z.number().int().nonnegative().nullable(),
  }),
  trackFixtureClassifications: z.array(
    z.object({
      position: z.number().int().min(1),
      classification: z.enum(["familiar", "new", "unresolved"]),
    })
  ),
  adjacentSameArtistCount: z.number().int().nonnegative(),
  maxNewTracksByArtist: z.number().int().nonnegative(),
  constraintViolations: z.array(z.string()),
});

export type PlaylistSampleMetrics = z.infer<
  typeof PlaylistSampleMetricsSchema
>;

const SanitizedErrorSchema = z.object({
  name: z.string(),
  message: z.string(),
});

const PlaylistEvalSampleBaseSchema = z.object({
  caseId: z.string(),
  sample: z.number().int().min(1),
  startedAt: z.string().datetime(),
  durationMs: z.number().int().nonnegative(),
});

export const PlaylistEvalSampleSchema = z.discriminatedUnion("status", [
  PlaylistEvalSampleBaseSchema.extend({
    status: z.literal("success"),
    output: PlaylistCurationResponse,
    metrics: PlaylistSampleMetricsSchema,
  }).strict(),
  PlaylistEvalSampleBaseSchema.extend({
    status: z.literal("failure"),
    error: SanitizedErrorSchema,
  }).strict(),
]);

export type PlaylistEvalSample = z.infer<typeof PlaylistEvalSampleSchema>;

const PlaylistEvalRunBaseSchema = z.object({
  schemaVersion: z.literal(PLAYLIST_EVAL_SCHEMA_VERSION),
  benchmarkVersion: ArtifactVersionSchema,
  runId: z.string().min(1),
  label: z.string().min(1),
  sourceRevision: z.string().min(1),
  sourceDirty: z.boolean(),
  modelId: z.string().min(1),
  samplesPerCase: z.number().int().min(1).max(10),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime(),
  durationMs: z.number().int().nonnegative(),
  complete: z.boolean(),
  cases: z.array(
    z.object({
      case: PlaylistEvalCaseSchema,
      samples: z.array(PlaylistEvalSampleSchema),
    })
  ).min(1),
});

export const PlaylistEvalRunSchema = PlaylistEvalRunBaseSchema.refine(
  ({ cases }) => new Set(cases.map(({ case: evalCase }) => evalCase.id)).size === cases.length,
  { message: "Run case IDs must be unique", path: ["cases"] }
)
  .refine(
    ({ cases, samplesPerCase }) =>
      cases.every(
        ({ case: evalCase, samples }) =>
          samples.length === samplesPerCase &&
          samples.every(
            (sample, index) =>
              sample.caseId === evalCase.id && sample.sample === index + 1
          )
      ),
    { message: "Run samples must match their case and sequence", path: ["cases"] }
  )
  .refine(
    ({ cases, complete }) =>
      complete ===
      cases.every(({ samples }) =>
        samples.every(({ status }) => status === "success")
      ),
    { message: "Run completeness must match its samples", path: ["complete"] }
  );

export type PlaylistEvalRun = z.infer<typeof PlaylistEvalRunSchema>;

export const PlaylistEvalJudgmentSchema = z.object({
  caseId: z.string(),
  sample: z.number().int().min(1),
  vibeFit: z.number().int().min(1).max(5),
  anchorFidelity: z.number().int().min(1).max(5),
  coherence: z.number().int().min(1).max(5),
  orderedFlow: z.number().int().min(1).max(5),
  noveltyQuality: z.number().int().min(1).max(5),
  verdict: z.enum(["green", "yellow", "orange", "red"]),
  failureMode: z.enum([
    "none",
    "vibe-mismatch",
    "genre-boundary",
    "energy-arc",
    "anchor-misuse",
    "playlist-incoherence",
    "weak-novelty",
    "repetition",
    "insufficient-artifact",
    "rubric-defect",
  ]),
  reason: z.string().trim().min(1).max(2_000),
  evidence: z.array(z.string().trim().min(1)).min(1).max(20),
});

export const PlaylistEvalJudgmentsSchema = z.object({
  schemaVersion: z.literal(PLAYLIST_EVAL_SCHEMA_VERSION),
  rubricVersion: ArtifactVersionSchema,
  runId: z.string().min(1),
  judgments: z.array(PlaylistEvalJudgmentSchema),
});

export type PlaylistEvalJudgments = z.infer<
  typeof PlaylistEvalJudgmentsSchema
>;

const AggregateScoreSchema = z.object({
  mean: z.number(),
  minimum: z.number(),
  maximum: z.number(),
});

export const PlaylistEvalReportSchema = z.object({
  subjective: z.object({
    vibeFit: AggregateScoreSchema,
    anchorFidelity: AggregateScoreSchema,
    coherence: AggregateScoreSchema,
    orderedFlow: AggregateScoreSchema,
    noveltyQuality: AggregateScoreSchema,
    verdictCounts: z.record(z.string(), z.number().int().nonnegative()),
    failureModeCounts: z.record(z.string(), z.number().int().nonnegative()),
  }),
  deterministic: z.object({
    sampleCount: z.number().int().nonnegative(),
    generationSuccessRate: z.number().min(0).max(1),
    exactTrackCountRate: z.number().min(0).max(1),
    duplicateFreeRate: z.number().min(0).max(1),
    fixtureResolutionRate: z.number().min(0).max(1),
    requestedMixEvaluableSampleCount: z.number().int().nonnegative(),
    requestedMixMeanAbsoluteError: z.number().nonnegative().nullable(),
  }),
  run: z.object({
    runId: z.string(),
    label: z.string(),
    sourceRevision: z.string(),
    benchmarkVersion: ArtifactVersionSchema,
    rubricVersion: ArtifactVersionSchema,
    complete: z.boolean(),
  }),
});

export type PlaylistEvalReport = z.infer<typeof PlaylistEvalReportSchema>;

const BlindPlaylistSchema = z.object({
  name: z.string(),
  description: z.string(),
  tracks: z.array(
    z.object({
      name: z.string(),
      artist_name: z.string(),
    })
  ),
});

const FixtureClassificationsSchema = z.object({
  summary: PlaylistSampleMetricsSchema.shape.novelty,
  tracks: PlaylistSampleMetricsSchema.shape.trackFixtureClassifications,
});

const PlaylistJudgeRequestSchema = z.object({
  selectedTracks: z.array(
    z.object({ name: z.string(), artist_name: z.string() })
  ),
  selectedArtists: z.array(z.string()),
  customInstructions: z.string(),
  newStuffAmount: NewStuffAmountSchema,
  songCount: z.number().int().min(1).max(100),
});

const BlindEvaluatedPlaylistSchema = BlindPlaylistSchema.extend({
  fixtureClassifications: FixtureClassificationsSchema.optional(),
});

export const PlaylistJudgePacketSchema = z.object({
  schemaVersion: z.literal(PLAYLIST_EVAL_SCHEMA_VERSION),
  benchmarkVersion: ArtifactVersionSchema,
  rubricVersion: ArtifactVersionSchema,
  samples: z.array(
    z.object({
      caseId: z.string(),
      sample: z.number().int().min(1),
      split: z.enum(["development", "holdout"]),
      rationale: z.string(),
      intent: PlaylistEvalCaseSchema.shape.intent,
      request: PlaylistJudgeRequestSchema,
      playlist: BlindPlaylistSchema,
      fixtureClassifications: FixtureClassificationsSchema.optional(),
    })
  ),
});

export type PlaylistJudgePacket = z.infer<typeof PlaylistJudgePacketSchema>;

export const BlindComparisonPacketSchema = z.object({
  schemaVersion: z.literal(PLAYLIST_EVAL_SCHEMA_VERSION),
  benchmarkVersion: ArtifactVersionSchema,
  rubricVersion: ArtifactVersionSchema,
  comparisonId: z.string(),
  pairs: z.array(
    z.object({
      pairId: z.string(),
      caseId: z.string(),
      sample: z.number().int().min(1),
      intent: PlaylistEvalCaseSchema.shape.intent,
      request: PlaylistJudgeRequestSchema,
      A: BlindEvaluatedPlaylistSchema,
      B: BlindEvaluatedPlaylistSchema,
    })
  ),
});

export type BlindComparisonPacket = z.infer<
  typeof BlindComparisonPacketSchema
>;

export const BlindComparisonKeySchema = z.object({
  schemaVersion: z.literal(PLAYLIST_EVAL_SCHEMA_VERSION),
  comparisonId: z.string(),
  baselineRunId: z.string(),
  baselineLabel: z.string(),
  candidateRunId: z.string(),
  candidateLabel: z.string(),
  mappings: z.array(
    z.object({
      pairId: z.string(),
      A: z.enum(["baseline", "candidate"]),
      B: z.enum(["baseline", "candidate"]),
    })
  ),
});

export type BlindComparisonKey = z.infer<typeof BlindComparisonKeySchema>;
