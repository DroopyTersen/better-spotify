import type { LooseAutocomplete } from "~/toolkit/utils/typescript.utils";

export const AUTH_SESSION_USER_KEY = "user";
export const SPOTIFY_OAUTH_STATE_KEY = "spotifyOAuthState";
export const AUTH_REFRESH_WINDOW_MS = 30 * 60 * 1000;

/** Keeps refresh redirects on this application even if the request host is untrusted. */
export function getRelativeRequestTarget(requestUrl: string) {
  const url = new URL(requestUrl);
  const pathname = `/${url.pathname.replace(/^\/+/, "")}`;
  return `${pathname}${url.search}`;
}

/** Tokens that may be serialized to route data and used by the browser SDK. */
export type AuthTokens = {
  accessToken: string;
  tokenType: string;
  expiresAt: string;
  clientId: string;
};

/**
 * Tokens omitted from route data but stored in the signed, HTTP-only session
 * cookie. Cookie signing provides integrity, not payload confidentiality.
 */
export type StoredAuthTokens = AuthTokens & {
  refreshToken: string;
};

export type User = {
  /** Spotify's stable account identifier when available. */
  id: string;
  /** The legacy Spotify user id, retained for profile URLs and old API shapes. */
  spotifyId: string;
  email?: string;
  name: string;
  photo?: string;
  tokens: AuthTokens;
  product?: LooseAutocomplete<"free" | "premium" | "open">;
};

export type StoredSessionUser = Omit<User, "tokens"> & {
  tokens: StoredAuthTokens;
};

export type SpotifyProfile = {
  account_id?: string | null;
  id?: string | null;
  display_name?: string | null;
  email?: string | null;
  images?:
    | Array<{
        url: string;
        height?: number | null;
        width?: number | null;
      }>
    | null;
  product?: string | null;
};

export type OAuthTokenValues = {
  accessToken: string;
  refreshToken?: string;
  tokenType: string;
  expiresAt: string;
};

type OAuthStateSession = {
  get(name: typeof SPOTIFY_OAUTH_STATE_KEY): unknown;
  set(name: typeof SPOTIFY_OAUTH_STATE_KEY, value: string): void;
  unset(name: typeof SPOTIFY_OAUTH_STATE_KEY): void;
};

export function storeSpotifyOAuthState(
  session: OAuthStateSession,
  state: string
) {
  session.set(SPOTIFY_OAUTH_STATE_KEY, state);
}

/**
 * Validates and consumes state in this session view. Invalid attempts do not
 * consume the valid state, so a forged callback cannot cancel the real login.
 * Cookie-backed session copies are not an atomic cross-request state store;
 * failed callbacks therefore must not commit their stale copy.
 */
export function consumeSpotifyOAuthState(
  session: OAuthStateSession,
  returnedState: string | null
) {
  const expectedState = session.get(SPOTIFY_OAUTH_STATE_KEY);
  if (
    typeof expectedState !== "string" ||
    expectedState.length === 0 ||
    returnedState === null ||
    returnedState !== expectedState
  ) {
    return false;
  }

  session.unset(SPOTIFY_OAUTH_STATE_KEY);
  return true;
}

export function createStoredSessionUser(
  profile: SpotifyProfile,
  tokens: OAuthTokenValues,
  clientId: string
): StoredSessionUser {
  const stableId = profile.account_id || profile.id;
  if (!stableId) {
    throw new Error("Spotify profile did not include an account identifier");
  }
  if (!tokens.refreshToken) {
    throw new Error("Spotify did not return a refresh token");
  }

  return {
    id: stableId,
    spotifyId: profile.id || stableId,
    email: profile.email || undefined,
    name: profile.display_name || profile.email || stableId,
    photo: profile.images?.[0]?.url,
    product: profile.product || undefined,
    tokens: {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenType: tokens.tokenType,
      expiresAt: tokens.expiresAt,
      clientId,
    },
  };
}

export function toPublicUser(user: StoredSessionUser): User {
  const { refreshToken: _refreshToken, ...publicTokens } = user.tokens;
  return {
    ...user,
    tokens: publicTokens,
  };
}

export function shouldRefreshAuthTokens(
  tokens: Pick<StoredAuthTokens, "expiresAt">,
  now = Date.now(),
  refreshWindowMs = AUTH_REFRESH_WINDOW_MS
) {
  const expiresAt = Date.parse(tokens.expiresAt);
  return !Number.isFinite(expiresAt) || expiresAt - now <= refreshWindowMs;
}

/** A failed proactive refresh may safely fall back only while this token works. */
export function hasUsableAccessToken(
  tokens: Pick<StoredAuthTokens, "expiresAt">,
  now = Date.now()
) {
  const expiresAt = Date.parse(tokens.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt > now;
}

export function mergeRefreshedAuthTokens(
  current: StoredAuthTokens,
  refreshed: OAuthTokenValues
): StoredAuthTokens {
  return {
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken || current.refreshToken,
    tokenType: refreshed.tokenType,
    expiresAt: refreshed.expiresAt,
    clientId: current.clientId,
  };
}

export function normalizeStoredSessionUser(
  value: unknown,
  clientId: string
): StoredSessionUser | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Partial<StoredSessionUser> & {
    tokens?: Partial<StoredAuthTokens>;
  };
  const tokens = candidate.tokens;
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.name !== "string" ||
    !tokens ||
    typeof tokens.accessToken !== "string" ||
    typeof tokens.refreshToken !== "string" ||
    typeof tokens.tokenType !== "string" ||
    typeof tokens.expiresAt !== "string"
  ) {
    return null;
  }

  return {
    id: candidate.id,
    spotifyId:
      typeof candidate.spotifyId === "string"
        ? candidate.spotifyId
        : candidate.id,
    email:
      typeof candidate.email === "string" ? candidate.email : undefined,
    name: candidate.name,
    photo:
      typeof candidate.photo === "string" ? candidate.photo : undefined,
    product: candidate.product,
    tokens: {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenType: tokens.tokenType,
      expiresAt: tokens.expiresAt,
      clientId:
        typeof tokens.clientId === "string" && tokens.clientId.length > 0
          ? tokens.clientId
          : clientId,
    },
  };
}
