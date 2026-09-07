# Discovery quality rubric v1.0.0

Judge each case as a multi-sample set. First compare each generated vibe brief
with the case intent and reference brief, then judge the Spotify-resolved artist
pool and its supported findings against that generated brief. The lane names
explain how research began; they are not categories that must be filled.

Score these dimensions from 1 through 5:

1. **Vibe fit (primary):** the artists and fit reasons convincingly match the
   complete brief, especially its explicit instructions and negative bounds.
2. **Discovery quality:** the findings are useful, specific additions rather
   than obvious names, weak novelty, or unrelated obscurity.
3. **Evidence quality:** at review time, source pages and dates support the
   stated artist and fit reason. A URL's mere presence is not proof of relevance,
   and external pages may have changed since the recorded run timestamp.
4. **Serendipity:** the set contains one or more defensible surprises that make
   the eventual playlist less predictable without weakening its vibe.
5. **Sample-set variety:** repeated samples explore meaningfully different good
   options. Reward useful range, not randomness for its own sake.

Do not reward or penalize an exact number of recent, adjacent, wildcard, new,
familiar, geographic, demographic, or genre categories. Empty or sparse lanes
are acceptable when their alternatives would be weak. Flag unsupported claims,
irrelevant sources, repetitive obvious artists, failed samples, zero-evidence
samples, and violations of the brief. A complete scout-request status means the
requests and schemas succeeded; it does not guarantee that any finding survived
source and Spotify verification.
