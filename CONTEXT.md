# Better Spotify domain context

Better Spotify is a personal music workspace. Spotify is the system of record
for identity and playlists; a browser-local PGlite database is a disposable
read model for fast exploration; OpenAI helps curate proposals but never owns
Spotify state.

## Domain language

- **Account session** — the signed, HTTP-only cookie containing the Spotify
  identity and refresh credential. The cookie is client-held but unavailable to
  browser JavaScript; its payload is signed, not encrypted.
- **Public user** — the safe loader representation. It may contain a short-lived
  access token for the browser SDK, but never a refresh token.
- **Library snapshot** — normalized Spotify data cached in a durable,
  account-scoped browser-local PGlite database. A completion marker distinguishes
  a fully refreshed snapshot from a partial or interrupted refresh.
- **Selection** — artists and tracks the user deliberately supplies to the
  Playlist Builder.
- **Curation** — a structured playlist or artist proposal generated from a
  bounded selection and preferences.
- **Materialization** — the explicit, authenticated write that creates or
  replaces a Spotify playlist.
- **Compatibility adapter** — the sole module that translates Spotify's current
  Web API into the older shapes still consumed by the application.

## Module map

- `app/auth/` owns OAuth state, session storage, refresh, and the public-user
  boundary.
- `app/spotify/api/spotifyWebApi.ts` owns Spotify endpoint and response-shape
  drift. Feature code should not recreate raw current-API routes.
- `app/spotify/sync/` owns conversion of Spotify responses into the local read
  model. `spotifySync.client.ts` is the single-flight entry point for UI code.
- `app/spotify/playlistBuilder/aiGeneration.server.ts` owns the OpenAI model and
  structured-generation interface. Individual use cases own their schemas and
  pure prompt/normalization logic.
- `app/spotify/playlistBuilder/` owns selection, curation, review, and explicit
  materialization into Spotify.
- `app/db/` is a client-only cache implementation, not an authentication or
  authorization source.

## Non-negotiable invariants

1. OAuth state is persisted and compared exactly. A successful callback clears
   it; a failing callback never commits stale cookie state that could overwrite
   a concurrent success. Atomic cross-request consumption requires server-side
   session storage.
2. Refresh tokens never reach loader data, browser code, logs, or model prompts.
3. A successful login renders even when optional Spotify data or local sync is
   unavailable.
4. Local database access and sync single-flight state are keyed by the current
   Spotify account; work from an old or aborted account context cannot commit.
5. Full and manual sync jobs do not race each other. A requested full sync
   upgrades queued incremental work, builds a complete generation in an
   isolated transient database, and publishes its normalized rows plus the
   completion marker in one short transaction. Failed staging work leaves the
   prior complete generation untouched. Saved tracks are validated and written
   to that transient database one provider page at a time, so library size is
   not coupled to the former 10,000-track assumption; a high request-count
   circuit breaker still rejects stalled or implausibly large snapshots.
6. A playlist replacement is atomic, and the application must load every source
   item page before it can replace that playlist.
7. Every server mutation authenticates independently and validates bounded
   input; browser state is not authority.
8. AI output is untrusted structured input. Schemas and normalizers enforce
   counts, non-empty values, exclusions, and truthful unresolved Spotify IDs.
9. Vendor-specific configuration stays behind its adapter seam so feature code
   remains testable without network calls.

The per-account PGlite cache and Playlist Builder draft intentionally survive
logout. Clearing them during logout would race browser work that is being
cancelled. Account namespacing is the privacy boundary, and the old unscoped
database is never opened or migrated into an account cache.

Play-history gaps larger than one bounded provider window persist a validated
continuation cursor with the inserted rows in the same transaction. Later
incremental runs resume that cursor before advancing to newer history, so API
work stays bounded without silently skipping the middle of a gap.

Artist-image enrichment is not part of snapshot completeness. Incremental
passes attempt a small bounded set of missing artists and preserve successful
results when an individual Spotify lookup fails; optional artwork can therefore
never delay or invalidate publication of the core library.

## Verification

Run `bun run check` for unit tests, React Router type generation, strict
TypeScript, and production client/SSR builds. Run `bun install
--frozen-lockfile` and `bun outdated` when dependencies change. Authentication
and user-visible flows still require a real browser pass.
