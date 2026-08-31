import { redirect } from "react-router";
import {
  AUTH_SESSION_USER_KEY,
  getRelativeRequestTarget,
  hasUsableAccessToken,
  normalizeStoredSessionUser,
  shouldRefreshAuthTokens,
  SPOTIFY_OAUTH_STATE_KEY,
  toPublicUser,
  type StoredAuthTokens,
  type StoredSessionUser,
  type User,
} from "./auth.shared";
import { authSessionStorage } from "./authSession.server";
import { refreshSpotifyAuthTokens } from "./spotifyAuth.server";
import { SPOTIFY_AUTH_CONFIG } from "./spotifyAuth.config";

export type { AuthTokens, User } from "./auth.shared";

const STALE_COOKIE_REFRESH_GRACE_MS = 60_000;
const MAX_REFRESH_COORDINATION_ENTRIES = 100;

type RefreshCoordinationEntry = {
  promise: Promise<StoredAuthTokens>;
  retainUntil: number | null;
};

type RefreshCoordinationOptions = {
  now?: () => number;
  staleCookieGraceMs?: number;
};

type RequireAuthOptions = {
  now?: () => number;
  refresh?: (tokens: StoredAuthTokens) => Promise<StoredAuthTokens>;
};

const coordinatedTokenRefreshes = new Map<
  string,
  RefreshCoordinationEntry
>();

function pruneRefreshCoordinationEntries(now: number) {
  for (const [refreshToken, entry] of coordinatedTokenRefreshes) {
    if (entry.retainUntil !== null && entry.retainUntil <= now) {
      coordinatedTokenRefreshes.delete(refreshToken);
    }
  }

  while (
    coordinatedTokenRefreshes.size >= MAX_REFRESH_COORDINATION_ENTRIES
  ) {
    const settledEntry = [...coordinatedTokenRefreshes].find(
      ([, entry]) => entry.retainUntil !== null
    );
    const oldestEntry =
      settledEntry ?? coordinatedTokenRefreshes.entries().next().value;
    if (!oldestEntry) break;
    coordinatedTokenRefreshes.delete(oldestEntry[0]);
  }
}

function getStoredUser(value: unknown): StoredSessionUser | null {
  return normalizeStoredSessionUser(value, SPOTIFY_AUTH_CONFIG.clientId);
}

async function loginRedirect(request: Request, error?: "session_expired") {
  const session = await authSessionStorage.getSession(
    request.headers.get("cookie")
  );
  const location = error ? `/login?error=${error}` : "/login";
  return redirect(location, {
    headers: {
      "Set-Cookie": await authSessionStorage.destroySession(session),
    },
  });
}

export async function createRefreshedSessionRedirect(
  request: Request,
  session: Parameters<typeof authSessionStorage.commitSession>[0]
) {
  const status = request.method === "GET" || request.method === "HEAD" ? 302 : 307;
  return redirect(getRelativeRequestTarget(request.url), {
    status,
    headers: {
      "Set-Cookie": await authSessionStorage.commitSession(session),
    },
  });
}

export function refreshAuthTokensOnce(
  current: StoredAuthTokens,
  refresh: (
    tokens: StoredAuthTokens
  ) => Promise<StoredAuthTokens> = refreshSpotifyAuthTokens,
  options: RefreshCoordinationOptions = {}
) {
  const now = options.now ?? Date.now;
  const staleCookieGraceMs =
    options.staleCookieGraceMs ?? STALE_COOKIE_REFRESH_GRACE_MS;
  pruneRefreshCoordinationEntries(now());

  const existingRefresh = coordinatedTokenRefreshes.get(
    current.refreshToken
  );
  if (existingRefresh) return existingRefresh.promise;

  const pendingRefresh = Promise.resolve().then(() => refresh(current));
  const entry: RefreshCoordinationEntry = {
    promise: pendingRefresh,
    retainUntil: null,
  };
  coordinatedTokenRefreshes.set(current.refreshToken, entry);

  void pendingRefresh.then(
    () => {
      if (coordinatedTokenRefreshes.get(current.refreshToken) !== entry) return;
      entry.retainUntil = now() + staleCookieGraceMs;
      const expirationTimer = setTimeout(() => {
        if (coordinatedTokenRefreshes.get(current.refreshToken) === entry) {
          coordinatedTokenRefreshes.delete(current.refreshToken);
        }
      }, staleCookieGraceMs);
      if (
        typeof expirationTimer === "object" &&
        "unref" in expirationTimer
      ) {
        expirationTimer.unref();
      }
    },
    () => {
      if (coordinatedTokenRefreshes.get(current.refreshToken) === entry) {
        coordinatedTokenRefreshes.delete(current.refreshToken);
      }
    }
  );

  return pendingRefresh;
}

export async function requireAuth(
  request: Request,
  options: RequireAuthOptions = {}
): Promise<User> {
  const session = await authSessionStorage.getSession(
    request.headers.get("cookie")
  );
  let storedUser = getStoredUser(session.get(AUTH_SESSION_USER_KEY));

  if (!storedUser) {
    throw await loginRedirect(request);
  }

  const now = options.now ?? Date.now;
  if (shouldRefreshAuthTokens(storedUser.tokens, now())) {
    let refreshedTokens;
    try {
      refreshedTokens = await refreshAuthTokensOnce(
        storedUser.tokens,
        options.refresh,
        { now }
      );
    } catch {
      // Refresh starts well before expiry. A transient Spotify failure must not
      // destroy an access token that can still serve this request; later
      // revalidation/wake paths will retry. Expired or malformed tokens remain
      // fail-closed and clear the unusable session.
      if (hasUsableAccessToken(storedUser.tokens, now())) {
        return toPublicUser(storedUser);
      }
      throw await loginRedirect(request, "session_expired");
    }

    storedUser = {
      ...storedUser,
      tokens: refreshedTokens,
    };
    session.set(AUTH_SESSION_USER_KEY, storedUser);
    session.unset(SPOTIFY_OAUTH_STATE_KEY);

    // Cookie sessions only persist through a response header. A 307 preserves
    // an action's method and body, so the browser safely retries the mutation
    // only after the refreshed (and possibly rotated) token is committed.
    throw await createRefreshedSessionRedirect(request, session);
  }

  return toPublicUser(storedUser);
}

export async function tryAuth(request: Request): Promise<User | null> {
  const session = await authSessionStorage.getSession(
    request.headers.get("cookie")
  );
  const storedUser = getStoredUser(session.get(AUTH_SESSION_USER_KEY));
  return storedUser ? toPublicUser(storedUser) : null;
}
