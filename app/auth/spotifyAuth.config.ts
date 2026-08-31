function requireEnvironmentVariable(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} must be set`);
  }
  return value;
}

export function normalizeAppOrigin(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("APP_URL must be a valid HTTP(S) origin");
  }

  const isSecureOrigin = url.protocol === "https:";
  const isLoopbackOrigin =
    url.protocol === "http:" &&
    (url.hostname === "127.0.0.1" || url.hostname === "[::1]");

  if (
    (!isSecureOrigin && !isLoopbackOrigin) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("APP_URL must be a valid HTTP(S) origin");
  }

  return url.origin;
}

const CLIENT_ID = requireEnvironmentVariable("SPOTIFY_CLIENT_ID");
const CLIENT_SECRET = requireEnvironmentVariable("SPOTIFY_CLIENT_SECRET");
const APP_ORIGIN = normalizeAppOrigin(requireEnvironmentVariable("APP_URL"));

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
    "user-read-email",
  ],
  clientId: CLIENT_ID,
  clientSecret: CLIENT_SECRET,
  redirectURI: new URL("/auth/callback", APP_ORIGIN).toString(),
};
