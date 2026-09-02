# Playlist quality rubric v1.0.1

Judge only from the supplied case and playlist artifact. Do not infer hidden
product intent, implementation identity, or prior scores. Deterministic metrics
are reported separately and must not be folded into the subjective scores.

## Scored dimensions

### 1. Vibe fit — primary

Score how completely the playlist embodies the requested mood, genre boundaries,
energy, texture, era, instrumentation, and explicit negative constraints.

| Score | Meaning |
|---|---|
| 5 | Specific, convincing match throughout; no material vibe violations |
| 4 | Strong match with one minor detour |
| 3 | Recognizable direction, but generic or inconsistent in several places |
| 2 | Some relevant tracks, but the playlist substantially misses the request |
| 1 | Predominantly the wrong vibe |

### 2. Anchor fidelity

Score whether selected artists and tracks are interpreted as stylistic evidence
instead of merely copied. Explicit instructions take precedence when they narrow
or deliberately redirect an anchor. For an `all` request, familiar anchors are
references and are not required inclusions.

When the request has no selected artist or track, give anchor fidelity a 5; there
is no anchor to misuse. Judge adherence to instructions under vibe fit instead.

### 3. Coherence

Score whether the playlist feels like one intentional listening experience rather
than a collection of individually plausible songs. Penalize abrupt stylistic
detours that the requested arc does not justify.

### 4. Ordered flow

Score the actual sequence. Respect any requested opening, escalation, peak,
cooldown, or landing. Without an explicit arc, reward natural energy and texture
transitions rather than a random order.

### 5. Novelty quality — secondary

Consider only tracks classified as new by the fixture. Score whether they are
credible discoveries for this exact vibe rather than novelty for novelty's sake.
Do not claim that fixture-new means the listener has never heard the music.

For `none`, give novelty quality a 5 when no fixture-new track appears. If every
track is unresolved, give a neutral 3 and state that fixture evidence is
insufficient to assess discovery quality.

## Verdict

| Verdict | Rule |
|---|---|
| green | Vibe fit at least 4, no dimension below 3, and no material boundary violation |
| yellow | Useful result with a correctable weakness |
| orange | Major vibe, flow, anchor, or novelty-quality failure |
| red | Fundamentally wrong, incoherent, or impossible to judge from the artifact |

## Failure modes

Choose one primary failure mode for every non-green result:

- `none`
- `vibe-mismatch`
- `genre-boundary`
- `energy-arc`
- `anchor-misuse`
- `playlist-incoherence`
- `weak-novelty`
- `repetition`
- `insufficient-artifact`
- `rubric-defect`

## Required judgment shape

```json
{
  "caseId": "mixed-indie-dance",
  "sample": 1,
  "vibeFit": 1,
  "anchorFidelity": 1,
  "coherence": 1,
  "orderedFlow": 1,
  "noveltyQuality": 1,
  "verdict": "red",
  "failureMode": "vibe-mismatch",
  "reason": "Brief concrete explanation tied to the case and playlist.",
  "evidence": ["Specific tracks, transitions, or case constraints used"]
}
```

Every score is an integer from 1 through 5. Evidence must identify concrete
artifact facts; generic praise or criticism is not sufficient.

## Blind pairwise judgment

When comparing A and B, score both independently with the dimensions above, then
return `A`, `B`, or `tie` as the winner plus confidence `low`, `medium`, or `high`.
Choose a winner on vibe fit first. Use novelty quality only after vibe and flow
are at least acceptable. The comparison packet, never the reviewer, owns the
hidden mapping back to baseline and candidate.
