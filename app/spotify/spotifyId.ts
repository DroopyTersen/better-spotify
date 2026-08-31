export const SPOTIFY_ID_PATTERN = /^[A-Za-z0-9]{1,128}$/;

/** Prevents untrusted route segments from steering an SDK-generated API path. */
export function requireSpotifyId(value: string | undefined) {
  if (!value || !SPOTIFY_ID_PATTERN.test(value)) {
    throw new Response("Spotify resource not found", {
      status: 404,
      statusText: "Not Found",
    });
  }
  return value;
}
