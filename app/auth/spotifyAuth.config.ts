const CLIENT_ID = process.env?.SPOTIFY_CLIENT_ID!;
const CLIENT_SECRET = process.env?.SPOTIFY_CLIENT_SECRET!;
const APP_URL = process.env?.APP_URL!;

export const SPOTIFY_AUTH_CONFIG = {
  scopes: [
    "user-read-recently-played",
    "playlist-modify-private",
    "playlist-modify-public",
    "playlist-read-collaborative",
    "playlist-read-private",
    "user-follow-read",
    "user-library-modify",
    "user-library-read",
    "user-modify-playback-state",
    "user-read-currently-playing",
    "user-read-playback-state",

    "user-read-private",
    "user-top-read",
  ],
  clientId: CLIENT_ID,
  clientSecret: CLIENT_SECRET,
  redirectURI: `${APP_URL}/auth/callback`,
};
