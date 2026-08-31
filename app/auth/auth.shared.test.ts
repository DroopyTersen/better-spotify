import { describe, expect, test } from "bun:test";
import {
  AUTH_REFRESH_WINDOW_MS,
  consumeSpotifyOAuthState,
  createStoredSessionUser,
  getRelativeRequestTarget,
  hasUsableAccessToken,
  mergeRefreshedAuthTokens,
  normalizeStoredSessionUser,
  SPOTIFY_OAUTH_STATE_KEY,
  storeSpotifyOAuthState,
  shouldRefreshAuthTokens,
  toPublicUser,
  type StoredAuthTokens,
} from "./auth.shared";

test("refresh redirects discard an untrusted request origin", () => {
  expect(
    getRelativeRequestTarget("https://attacker.example/library?sort=recent")
  ).toBe("/library?sort=recent");
  expect(
    getRelativeRequestTarget(
      "https://app.example//attacker.example/mutation?keep=true"
    )
  ).toBe("/attacker.example/mutation?keep=true");
});

class TestStateSession {
  private values = new Map<string, unknown>();

  get(name: typeof SPOTIFY_OAUTH_STATE_KEY) {
    return this.values.get(name);
  }

  set(name: typeof SPOTIFY_OAUTH_STATE_KEY, value: string) {
    this.values.set(name, value);
  }

  unset(name: typeof SPOTIFY_OAUTH_STATE_KEY) {
    this.values.delete(name);
  }
}

const storedTokens: StoredAuthTokens = {
  accessToken: "access-secret",
  refreshToken: "refresh-secret",
  tokenType: "Bearer",
  expiresAt: "2030-01-01T00:00:00.000Z",
  clientId: "public-client-id",
};

describe("Spotify OAuth state", () => {
  test("rejects missing and mismatched state without consuming the valid state", () => {
    const session = new TestStateSession();
    storeSpotifyOAuthState(session, "expected-state");

    expect(consumeSpotifyOAuthState(session, null)).toBeFalse();
    expect(consumeSpotifyOAuthState(session, "wrong-state")).toBeFalse();
    expect(consumeSpotifyOAuthState(session, "expected-state")).toBeTrue();
  });

  test("consumes a valid state so it cannot be replayed", () => {
    const session = new TestStateSession();
    storeSpotifyOAuthState(session, "one-time-state");

    expect(consumeSpotifyOAuthState(session, "one-time-state")).toBeTrue();
    expect(consumeSpotifyOAuthState(session, "one-time-state")).toBeFalse();
  });
});

describe("public auth data", () => {
  test("never serializes the stored refresh token", () => {
    const user = createStoredSessionUser(
      { account_id: "stable-id", id: "legacy-id", display_name: "Listener" },
      storedTokens,
      storedTokens.clientId
    );

    const publicUser = toPublicUser(user);

    expect("refreshToken" in publicUser.tokens).toBeFalse();
    expect(JSON.stringify(publicUser)).not.toContain(storedTokens.refreshToken);
    expect(publicUser.tokens.clientId).toBe(storedTokens.clientId);
  });

  test("accepts Spotify's 2026 profile with optional fields removed", () => {
    const user = createStoredSessionUser(
      {
        account_id: "stable-id",
        id: "legacy-id",
        display_name: null,
        email: null,
        images: null,
        product: null,
      },
      storedTokens,
      storedTokens.clientId
    );

    expect(user.id).toBe("stable-id");
    expect(user.spotifyId).toBe("legacy-id");
    expect(user.name).toBe("stable-id");
    expect(user.email).toBeUndefined();
    expect(user.photo).toBeUndefined();
    expect(user.product).toBeUndefined();
  });

  test("migrates an existing session by adding the public client id", () => {
    const normalized = normalizeStoredSessionUser(
      {
        id: "legacy-id",
        name: "Listener",
        tokens: {
          accessToken: "access-secret",
          refreshToken: "refresh-secret",
          tokenType: "Bearer",
          expiresAt: "2030-01-01T00:00:00.000Z",
        },
      },
      "configured-client-id"
    );

    expect(normalized?.spotifyId).toBe("legacy-id");
    expect(normalized?.tokens.clientId).toBe("configured-client-id");
  });
});

describe("token refresh", () => {
  test("refreshes inside the window and treats invalid expiry as stale", () => {
    const now = Date.parse("2026-08-30T12:00:00.000Z");

    expect(
      shouldRefreshAuthTokens(
        { expiresAt: new Date(now + AUTH_REFRESH_WINDOW_MS + 1).toISOString() },
        now
      )
    ).toBeFalse();
    expect(
      shouldRefreshAuthTokens(
        { expiresAt: new Date(now + AUTH_REFRESH_WINDOW_MS).toISOString() },
        now
      )
    ).toBeTrue();
    expect(
      shouldRefreshAuthTokens({ expiresAt: "not-a-date" }, now)
    ).toBeTrue();
    expect(
      hasUsableAccessToken({ expiresAt: new Date(now + 1).toISOString() }, now)
    ).toBeTrue();
    expect(
      hasUsableAccessToken({ expiresAt: new Date(now).toISOString() }, now)
    ).toBeFalse();
    expect(hasUsableAccessToken({ expiresAt: "not-a-date" }, now)).toBeFalse();
  });

  test("preserves the old refresh token when Spotify omits a replacement", () => {
    const merged = mergeRefreshedAuthTokens(storedTokens, {
      accessToken: "new-access",
      tokenType: "Bearer",
      expiresAt: "2031-01-01T00:00:00.000Z",
    });

    expect(merged.refreshToken).toBe(storedTokens.refreshToken);
    expect(merged.clientId).toBe(storedTokens.clientId);
  });

  test("uses a rotated refresh token when Spotify returns one", () => {
    const merged = mergeRefreshedAuthTokens(storedTokens, {
      accessToken: "new-access",
      refreshToken: "rotated-refresh",
      tokenType: "Bearer",
      expiresAt: "2031-01-01T00:00:00.000Z",
    });

    expect(merged.refreshToken).toBe("rotated-refresh");
  });
});
