import { expect, test } from "bun:test";
import {
  AUTH_SESSION_USER_KEY,
  createStoredSessionUser,
  SPOTIFY_OAUTH_STATE_KEY,
  type StoredAuthTokens,
} from "./auth.shared";
import {
  createRefreshedSessionRedirect,
  refreshAuthTokensOnce,
  requireAuth,
} from "./auth.server";
import { authSessionStorage } from "./authSession.server";
import { SPOTIFY_AUTH_CONFIG } from "./spotifyAuth.config";
import { beginSpotifyLogin, finishSpotifyLogin } from "./spotifyAuth.server";

test("login starts Spotify's confidential flow with the configured callback", async () => {
  const response = await beginSpotifyLogin(
    new Request("http://127.0.0.1:5173/login", { method: "POST" })
  );
  const location = response.headers.get("location");
  expect(response.status).toBe(302);
  expect(location).toBeTruthy();

  const authorizationUrl = new URL(location!);
  expect(authorizationUrl.origin).toBe("https://accounts.spotify.com");
  expect(authorizationUrl.pathname).toBe("/authorize");
  expect(authorizationUrl.searchParams.get("client_id")).toBe(
    SPOTIFY_AUTH_CONFIG.clientId
  );
  expect(authorizationUrl.searchParams.get("redirect_uri")).toBe(
    SPOTIFY_AUTH_CONFIG.redirectURI
  );
  expect(authorizationUrl.searchParams.get("state")?.length).toBeGreaterThan(20);
  expect(authorizationUrl.searchParams.get("scope")?.split(" ")).toContain(
    "user-read-email"
  );
  expect(authorizationUrl.searchParams.has("code_challenge")).toBeFalse();

  const setCookie = response.headers.get("set-cookie");
  expect(setCookie).toContain("HttpOnly");
  expect(setCookie).toContain("SameSite=Lax");
});

test("concurrent Spotify denials cannot overwrite a successful callback cookie", async () => {
  const startResponse = await beginSpotifyLogin(
    new Request("http://127.0.0.1:5173/login", { method: "POST" })
  );
  const authorizationUrl = new URL(startResponse.headers.get("location")!);
  const state = authorizationUrl.searchParams.get("state");
  const startCookie = startResponse.headers
    .get("set-cookie")!
    .split(";", 1)[0];

  const callbackRequest = () =>
    new Request(
      `${SPOTIFY_AUTH_CONFIG.redirectURI}?error=access_denied&state=${encodeURIComponent(
        state!
      )}`,
      { headers: { cookie: startCookie } }
    );
  const [callbackResponse, concurrentResponse] = await Promise.all([
    finishSpotifyLogin(callbackRequest()),
    finishSpotifyLogin(callbackRequest()),
  ]);

  expect(callbackResponse.status).toBe(302);
  expect(callbackResponse.headers.get("location")).toBe(
    "/login?error=access_denied"
  );
  expect(callbackResponse.headers.get("set-cookie")).toBeNull();
  expect(concurrentResponse.headers.get("set-cookie")).toBeNull();

  const unchangedSession = await authSessionStorage.getSession(startCookie);
  expect(unchangedSession.get(SPOTIFY_OAUTH_STATE_KEY)).toBe(state!);
});

test("a refreshed POST persists a rotated token before replaying the mutation", async () => {
  const session = await authSessionStorage.getSession();
  const refreshedUser = createStoredSessionUser(
    { account_id: "account-id", display_name: "Listener" },
    {
      accessToken: "rotated-access-token",
      refreshToken: "rotated-refresh-token",
      tokenType: "Bearer",
      expiresAt: "2030-01-01T00:00:00.000Z",
    },
    "public-client-id"
  );
  session.set(AUTH_SESSION_USER_KEY, refreshedUser);

  const response = await createRefreshedSessionRedirect(
    new Request("https://untrusted.example/api/modify-playlist?source=builder", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"instructions":"keep this body"}',
    }),
    session
  );

  expect(response.status).toBe(307);
  expect(response.headers.get("location")).toBe(
    "/api/modify-playlist?source=builder"
  );

  const setCookie = response.headers.get("set-cookie");
  expect(setCookie).toBeTruthy();
  const persistedSession = await authSessionStorage.getSession(
    setCookie?.split(";", 1)[0]
  );
  expect(
    persistedSession.get(AUTH_SESSION_USER_KEY)?.tokens.refreshToken
  ).toBe("rotated-refresh-token");
});

test("concurrent loaders share one rotating token refresh", async () => {
  const current: StoredAuthTokens = {
    accessToken: "stale-access",
    refreshToken: "single-flight-refresh-token",
    tokenType: "Bearer",
    expiresAt: "2020-01-01T00:00:00.000Z",
    clientId: "public-client-id",
  };
  let refreshCalls = 0;
  let releaseRefresh!: () => void;
  const refreshGate = new Promise<void>((resolve) => {
    releaseRefresh = resolve;
  });
  const refresh = async (tokens: StoredAuthTokens) => {
    refreshCalls += 1;
    await refreshGate;
    return {
      ...tokens,
      accessToken: "rotated-access",
      refreshToken: "rotated-refresh",
    };
  };

  const first = refreshAuthTokensOnce(current, refresh);
  const second = refreshAuthTokensOnce(current, refresh);
  await Promise.resolve();
  expect(refreshCalls).toBe(1);

  releaseRefresh();
  const [firstResult, secondResult] = await Promise.all([first, second]);
  expect(firstResult).toBe(secondResult);
  expect(firstResult.refreshToken).toBe("rotated-refresh");
});

test("a late old-cookie request reuses the rotated token during the response grace", async () => {
  const current: StoredAuthTokens = {
    accessToken: "stale-access",
    refreshToken: "late-old-cookie-refresh-token",
    tokenType: "Bearer",
    expiresAt: "2020-01-01T00:00:00.000Z",
    clientId: "public-client-id",
  };
  let refreshCalls = 0;
  let now = Date.parse("2026-08-30T12:00:00.000Z");
  const refresh = async (tokens: StoredAuthTokens) => {
    refreshCalls += 1;
    return {
      ...tokens,
      accessToken: "rotated-access",
      refreshToken: "rotated-refresh",
    };
  };

  const firstResult = await refreshAuthTokensOnce(current, refresh, {
    now: () => now,
    staleCookieGraceMs: 60_000,
  });
  now += 30_000;
  const lateResult = await refreshAuthTokensOnce(current, refresh, {
    now: () => now,
    staleCookieGraceMs: 60_000,
  });

  expect(refreshCalls).toBe(1);
  expect(lateResult).toBe(firstResult);
  expect(lateResult.refreshToken).toBe("rotated-refresh");
});

async function authenticatedRequest(expiresAt: string, refreshToken: string) {
  const session = await authSessionStorage.getSession();
  session.set(
    AUTH_SESSION_USER_KEY,
    createStoredSessionUser(
      { account_id: "account-id", display_name: "Listener" },
      {
        accessToken: "current-access-token",
        refreshToken,
        tokenType: "Bearer",
        expiresAt,
      },
      "public-client-id"
    )
  );
  const cookie = await authSessionStorage.commitSession(session);
  return new Request("http://127.0.0.1:5173/songs", {
    headers: { cookie: cookie.split(";", 1)[0] },
  });
}

test("a transient proactive refresh failure preserves a still-usable session", async () => {
  const now = Date.parse("2026-08-30T12:00:00.000Z");
  const request = await authenticatedRequest(
    new Date(now + 10 * 60 * 1000).toISOString(),
    "usable-refresh-failure-token"
  );

  const user = await requireAuth(request, {
    now: () => now,
    refresh: async () => {
      throw new Error("temporary Spotify failure");
    },
  });

  expect(user.tokens.accessToken).toBe("current-access-token");
  expect("refreshToken" in user.tokens).toBeFalse();
});

test("a failed refresh clears an expired session", async () => {
  const now = Date.parse("2026-08-30T12:00:00.000Z");
  const request = await authenticatedRequest(
    new Date(now - 1).toISOString(),
    "expired-refresh-failure-token"
  );

  try {
    await requireAuth(request, {
      now: () => now,
      refresh: async () => {
        throw new Error("Spotify rejected refresh");
      },
    });
    throw new Error("Expected requireAuth to redirect");
  } catch (error) {
    expect(error).toBeInstanceOf(Response);
    const response = error as Response;
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "/login?error=session_expired"
    );
    expect(response.headers.get("set-cookie")).toContain(
      "Expires=Thu, 01 Jan 1970 00:00:00 GMT"
    );
  }
});
