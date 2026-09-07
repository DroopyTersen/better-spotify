# Discovery quality evaluation

This opt-in suite samples the integrated production discovery path against three
public, synthetic requests. Each sample generates and validates one vibe brief,
runs the baseline and web scouts, and resolves artist names through Spotify. It
evaluates vibe fit, discovery quality, serendipity, and range across repeated
runs. It does not reward exact lane or novelty counts.

The suite stops after Spotify artist resolution; it does not load catalogs or
run the final playlist curator. The curator's shared-brief, evidence, and
quota-free contracts are covered by deterministic tests, while the separate
playlist-quality suite evaluates final curation against fixed candidate pools.

Run all cases with three samples each:

```bash
bun run eval:discovery -- --label candidate --samples 3
```

Run one case while iterating:

```bash
bun run eval:discovery -- --label indie-folk --samples 3 \
  --case weathered-indie-folk
```

The command requires `OPENAI_API_KEY`, `SPOTIFY_CLIENT_ID`, and
`SPOTIFY_CLIENT_SECRET`, is billable, and is excluded from `bun run check`.
Every sample makes one baseline Responses API request and three parallel scout
requests, each with at most two hosted web-search calls and a 30-second request
timeout. It uses Spotify client credentials for bounded, read-only artist
searches: at most 17 per sample. The client is authenticated once before
sampling and refreshes only if the app token expires. It never authenticates a
listener, inspects a personal library, or creates a playlist.

Each ignored `.artifacts/discovery-quality/` run contains an immutable file for
every attempted sample, plus the generated vibe briefs, Spotify-resolved artist
pools, evidence-backed scout findings, a deterministic cross-sample summary,
and a judge packet. Isolated baseline or Spotify failures are sanitized and do
not discard later samples; the completed command exits nonzero when any sample
failed.

Scout request status reports request or schema failures, not candidate yield.
The separate zero-evidence count exposes samples where completed scouts produced
no usable, source-backed Spotify match. Review the packet using
[rubric.v1.md](./rubric.v1.md). Judge the source's relevance and the reason's
musical credibility; source validation proves only that the model actually
consulted that URL. Pages remain external evidence and can change after a run,
so the run timestamp and source date should be considered during review.
