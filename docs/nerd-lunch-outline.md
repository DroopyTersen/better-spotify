# Nerd Lunch Outline

## Demo App

1. Show login with Spotify
2. Talk through syncing of Spotify data
3. Show selecting artists and tracks for a playlist
4. Show Building a playlist
5. Show Playing with Spotify
6. Show modifying a playlist with AI

## Cool Tech

- PGLite - Full Postgres in the browswer with WASM
  - Show the resync data
- React Router 7 - mixture of client side and server side data fetching
- Vercel AI SDK - normalizes working with different LLMs
- Google Gemini Flash 2.0 - Fast really generous free tier.
- ShadCN - Source is in your project, based on tailwind, easy to customize to match Spotify

## Challenges

- Interesting mind shift to have the database ONLY accessible on the client. Required rethinking instinctive patterns.
- Spotify API changed mid build.
  - The removed a lot of the recommendation and similar artist endpoints
- Spotify App Registration only allows 25 explicitly added test users unless you have them approve and publish your app.
