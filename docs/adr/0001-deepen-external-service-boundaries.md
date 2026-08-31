# ADR 0001: Deepen external-service boundaries

- Status: accepted
- Date: 2026-08-30

## Context

Authentication, Spotify API calls, local synchronization, route components, and
model prompting had grown together. Changes in Spotify's 2026 API, OAuth
profile fields, React Router, or the AI SDK therefore produced failures far from
the vendor boundary. Several feature files also contained credentials or raw
request details in logs, and playlist modification could destroy items before a
replacement succeeded.

## Decision

Use four deep modules with narrow interfaces:

1. `app/auth/` translates Spotify OAuth into a signed account session and a
   refresh-token-free public user.
2. `spotifyWebApi` translates the current Spotify API and paginates/normalizes
   playlist data before exposing it to features.
3. `spotifySync.client` serializes manual and scheduled updates into the local
   PGlite read model.
4. `aiGeneration.server` centralizes the OpenAI Responses model contract while
   each curation use case supplies a strict schema and pure prompt/normalizer.

Route modules remain orchestration seams: authenticate, parse and validate a
bounded request, call one domain interface, then shape the response. They do not
own provider credentials or compatibility behavior.

## Consequences

- Provider migrations are localized and can be verified with offline contract
  tests.
- Refresh tokens never enter loader data or browser JavaScript. The current
  signed cookie is still client-held and decodable; durable server-side session
  storage remains the deeper confidentiality and revocation option.
- Playlist replacement fails before mutation if input is invalid and uses one
  atomic provider request.
- Initial and optional Spotify failures can degrade to warnings instead of
  making a valid account session look broken.
- The local database remains an implementation detail. A future storage change
  should preserve the library-snapshot interface rather than leak database
  calls into more UI components.
