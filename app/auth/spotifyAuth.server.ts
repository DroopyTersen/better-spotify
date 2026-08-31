import { generateState, type OAuth2Tokens, Spotify } from "arctic";
import { redirect } from "react-router";
import {
  AUTH_SESSION_USER_KEY,
  consumeSpotifyOAuthState,
  createStoredSessionUser,
  mergeRefreshedAuthTokens,
  SPOTIFY_OAUTH_STATE_KEY,
  storeSpotifyOAuthState,
  type OAuthTokenValues,
  type SpotifyProfile,
  type StoredAuthTokens,
} from "./auth.shared";
import { authSessionStorage } from "./authSession.server";
import { SPOTIFY_AUTH_CONFIG } from "./spotifyAuth.config";

const SPOTIFY_PROFILE_URL = "https://api.spotify.com/v1/me";

const spotify = new Spotify(
  SPOTIFY_AUTH_CONFIG.clientId,
  SPOTIFY_AUTH_CONFIG.clientSecret,
  SPOTIFY_AUTH_CONFIG.redirectURI
);

function tokenValues(
  tokens: OAuth2Tokens,
  fallbackRefreshToken?: string
): OAuthTokenValues {
  return {
    accessToken: tokens.accessToken(),
    refreshToken: tokens.hasRefreshToken()
      ? tokens.refreshToken()
      : fallbackRefreshToken,
    tokenType: tokens.tokenType(),
    expiresAt: tokens.accessTokenExpiresAt().toISOString(),
  };
}

async function fetchSpotifyProfile(accessToken: string) {
  const response = await fetch(SPOTIFY_PROFILE_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(`Spotify profile request failed with ${response.status}`);
  }
  return (await response.json()) as SpotifyProfile;
}

function loginErrorResponse(
  code: "access_denied" | "invalid_state" | "spotify_auth_failed"
) {
  // A signed cookie session cannot atomically consume state across two
  // independently deserialized callback requests. Never commit a failing
  // callback's stale session: it could overwrite a concurrent success.
  return redirect(`/login?error=${code}`);
}

export async function beginSpotifyLogin(request: Request) {
  const session = await authSessionStorage.getSession(
    request.headers.get("cookie")
  );
  const state = generateState();
  storeSpotifyOAuthState(session, state);

  // This is the confidential authorization-code flow, so PKCE is intentionally
  // null and Arctic authenticates token requests with the client secret.
  const authorizationURL = spotify.createAuthorizationURL(
    state,
    null,
    SPOTIFY_AUTH_CONFIG.scopes
  );

  return redirect(authorizationURL.toString(), {
    headers: {
      "Set-Cookie": await authSessionStorage.commitSession(session),
    },
  });
}

export async function finishSpotifyLogin(request: Request) {
  const url = new URL(request.url);
  const session = await authSessionStorage.getSession(
    request.headers.get("cookie")
  );

  if (!consumeSpotifyOAuthState(session, url.searchParams.get("state"))) {
    return loginErrorResponse("invalid_state");
  }

  if (url.searchParams.has("error")) {
    return loginErrorResponse("access_denied");
  }

  const code = url.searchParams.get("code");
  if (!code) {
    return loginErrorResponse("spotify_auth_failed");
  }

  try {
    // Confidential clients pass null for the PKCE verifier in Arctic 3.
    const tokens = await spotify.validateAuthorizationCode(code, null);
    const values = tokenValues(tokens);
    const profile = await fetchSpotifyProfile(values.accessToken);
    const user = createStoredSessionUser(
      profile,
      values,
      SPOTIFY_AUTH_CONFIG.clientId
    );
    session.set(AUTH_SESSION_USER_KEY, user);
    session.unset(SPOTIFY_OAUTH_STATE_KEY);

    return redirect("/", {
      headers: {
        "Set-Cookie": await authSessionStorage.commitSession(session),
      },
    });
  } catch {
    return loginErrorResponse("spotify_auth_failed");
  }
}

export async function refreshSpotifyAuthTokens(current: StoredAuthTokens) {
  const refreshed = await spotify.refreshAccessToken(current.refreshToken);
  return mergeRefreshedAuthTokens(
    current,
    tokenValues(refreshed, current.refreshToken)
  );
}
