# Playlist quality evaluation

This suite measures the Playlist Builder's final curation proposal against the
product priorities in this order:

1. Does the playlist match the requested vibe?
2. Does it provide fitting, fixture-classified new-music exposure?
3. Does it obey the deterministic playlist constraints?

The system under test is `generatePlaylist()` with fixed, reviewed candidate
pools. The live runner uses the same prompt, schema, model, and provider options
as the application, but it never authenticates with Spotify, searches Spotify,
creates a playlist, or reads an account library.

## Scope

Version 1 covers artist-only, track-only, mixed-anchor, instruction-only,
conflicting-anchor, energy-arc, familiar-only, and all-new requests. Fixtures
are public, synthetic account inputs with stable fake IDs. They are divided into
development and holdout cases so later prompt work does not tune only against
the examples used during implementation.

This suite deliberately does not evaluate upstream artist discovery, random
album sampling, live Spotify resolution, or lifetime listening history. Until
the application has a complete novelty index, results use the term
`fixture-classified novelty`, not `never heard`.

## Current baseline

The reviewed [current-curation baseline](./baselines/main-curation-64d6acc-v1/README.md)
contains three samples for each of the eight cases, the independent judgments,
and both subjective and deterministic reports. It represents the production
curation behavior on `main` at `64d6acc` before recommendation changes.

## Design

```text
benchmark.v1.ts
      |
      v
validate fixtures ---> run generatePlaylist() N times per case
                              |
                              v
                    write immutable sample artifacts
                              |
              +---------------+----------------+
              |                                |
              v                                v
     deterministic metrics              judge packet
              |                                |
              +---------------+----------------+
                              v
                      versioned summary
```

The command surface is:

```bash
# Billable and nondeterministic; requires OPENAI_API_KEY.
bun run eval:playlist -- run --label main-64d6acc --samples 3

# Network-free; prepares an implementation-blind A/B packet.
bun run eval:playlist -- compare \
  --baseline path/to/baseline/run.json \
  --candidate path/to/candidate/run.json

# Network-free; validates clean-context judgments and produces a report.
bun run eval:playlist -- report \
  --run path/to/run.json \
  --judgments path/to/judgments.json
```

Live evaluation is intentionally not part of `bun run check`. Normal tests,
lint, type checking, and builds must stay deterministic, nonbillable, and free
of provider credentials.

## Artifact contract

Every run gets a new directory. Existing directories and files are never
overwritten. A run records:

- benchmark, rubric, artifact-schema, model, and source-revision versions;
- the explicit run label, sample count, case IDs, and development/holdout split;
- start/end timestamps, duration, and whether the source tree was dirty;
- each structured model output or a sanitized failure;
- deterministic per-sample metrics and cross-sample overlap;
- a judge packet containing the case intent and generated playlist;
- judgments as a separate input so rubric changes cannot masquerade as product
  improvements.

Ad hoc runs go under `.artifacts/playlist-quality/`, which is ignored. Only a
deliberately reviewed baseline may be copied into `baselines/` and committed.
Artifacts never include environment variables, request headers, Spotify account
data, local-library exports, access tokens, refresh tokens, or raw provider
request objects.

## Metrics

Vibe judgment is reported first and remains separate from mechanical checks.
The versioned rubric is in [rubric.v1.md](./rubric.v1.md).

Deterministic metrics include:

- exact requested track count;
- duplicate IDs and duplicate normalized track/artist pairs;
- selected-track and feasible selected-artist coverage;
- familiar/new/unresolved counts and requested-ratio deviation;
- nonempty IDs that were not supplied by a fixture pool;
- adjacent tracks by the same artist;
- concentration above three new tracks by one artist;
- offline fixture-resolution coverage; and
- cross-sample track overlap.

An infeasible fixture is rejected before model calls. An individual failed model
sample is recorded without discarding successful samples, while the overall run
is marked incomplete.

## Sampling and judging

The default comparison unit is three samples per case. Reports retain per-sample
scores, mean scores, spread, and regressions; a single lucky output cannot stand
in for a stable improvement.

Vibe judgments come from a clean-context reviewer using only the rubric, case,
and judge artifact. The production curation model is not its own judge. Pairwise
packets hide implementation labels and deterministically swap A/B order; the
mapping is written to a separate key that is not provided to the reviewer.

Rubric or benchmark changes require their own version and baseline. Product,
harness, rubric, fixture, and data changes are reported separately.
