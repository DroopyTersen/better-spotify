# Current curation baseline

This baseline captures the playlist-curation behavior on `main` at `64d6acc`.
The production curation files are unchanged on the evaluation branch; the run
records harness revision `edf74ff` and a clean working tree.

## Run

- Benchmark: 1.0.0, eight public fixture cases
- Rubric: 1.0.0
- Model: `gpt-5.6-luna`
- Sampling: three independent generations per case, 24 total
- Result: 24 successful generations, with no Spotify authentication, catalog
  request, or playlist write

## Reviewed result

Vibe is the primary result. Independent clean-context review produced:

- vibe fit: 4.29 / 5 mean, 3–5 range;
- novelty quality: 4.63 / 5 mean, 3–5 range;
- ordered flow: 3.63 / 5 mean, 2–5 range;
- verdicts: 19 green, 3 yellow, and 2 orange; and
- primary failure mode: energy arc in all five non-green samples.

The ordering failures are the clearest baseline weakness: two neon-drive
samples decelerated too early, one indie-dance sample opened with its communal
climax, one predawn-jazz sample ended at its most propulsive, and one
instrumental sample rebuilt after its intended landing.

## Deterministic result

- generation success: 100%;
- exact requested length: 100%;
- duplicate-free: 100%;
- fixture resolution: 87.5%; and
- mean cross-sample track overlap: 78.8%.

All 21 pool-backed samples hit the requested familiar/new mix exactly. The
reported mean mix error of one track comes entirely from the three intentional
instruction-only samples: their 24 music-knowledge selections have empty IDs
and cannot be classified as fixture-new. Those samples also fully explain the
87.5% fixture-resolution rate. One instrumental sample placed two tracks by the
same artist next to each other; no other deterministic constraint failed.

Pool-constrained cases were highly stable. Three cases returned the same track
set in all samples, while the instruction-only case had only 9.2% mean pairwise
overlap. Future comparisons should treat overlap as a stability/exposure signal,
not automatically as either good or bad.

## Artifacts

- `run.json`: complete benchmark inputs, outputs, and per-sample metrics
- `samples/`: interruption-safe individual sample records
- `judge-packet.json`: implementation-neutral review input
- `judgments.json`: validated per-sample review evidence
- `report.json`: vibe-first reviewed aggregate
- `deterministic-summary.json`: mechanical checks and sampling overlap

These artifacts contain public fixtures only. They were scanned for provider
credentials and authorization headers before commit.
