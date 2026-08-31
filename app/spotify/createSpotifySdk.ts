import {
  SpotifyApi,
  type RequestImplementation,
} from "@spotify/web-api-ts-sdk";
import { type AuthTokens } from "~/auth/auth.server";
export type SpotifySdk = SpotifyApi;

const MAX_AUTOMATIC_RETRY_AFTER_MS = 60_000;

type SpotifyFetchRetryOptions = {
  wait?: (milliseconds: number, signal?: AbortSignal | null) => Promise<void>;
  now?: () => number;
  maximumRetryAfterMs?: number;
  signal?: AbortSignal;
};

export function createSpotifyRateLimitFetch(
  fetchImplementation: RequestImplementation = (input, init) =>
    fetch(input, init),
  options: SpotifyFetchRetryOptions = {}
): RequestImplementation {
  const wait = options.wait ?? waitForRetry;
  const now = options.now ?? Date.now;
  const maximumRetryAfterMs =
    options.maximumRetryAfterMs ?? MAX_AUTOMATIC_RETRY_AFTER_MS;

  return async (input, init) => {
    const requestSignal =
      options.signal ??
      init?.signal ??
      (input instanceof Request ? input.signal : undefined);
    const requestInit = requestSignal ? { ...init, signal: requestSignal } : init;
    const response = await fetchImplementation(input, requestInit);
    if (response.status !== 429) return response;

    const retryAfterMs = parseRetryAfterMilliseconds(
      response.headers.get("retry-after"),
      now()
    );
    if (
      retryAfterMs === null ||
      retryAfterMs < 0 ||
      retryAfterMs > maximumRetryAfterMs
    ) {
      return response;
    }

    await wait(retryAfterMs, requestSignal);
    return fetchImplementation(input, requestInit);
  };
}

export function parseRetryAfterMilliseconds(
  value: string | null,
  now = Date.now()
): number | null {
  if (!value) return null;

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.ceil(seconds * 1_000);
  }

  const retryAt = Date.parse(value);
  return Number.isFinite(retryAt) ? Math.max(0, retryAt - now) : null;
}

function waitForRetry(
  milliseconds: number,
  signal?: AbortSignal | null
): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(signal.reason);
  }

  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timeout);
      reject(signal?.reason);
    };
    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export const createSpotifySdk = (
  tokens: AuthTokens,
  options: Pick<SpotifyFetchRetryOptions, "signal"> = {}
) => {
  return SpotifyApi.withAccessToken(
    tokens.clientId,
    {
      access_token: tokens.accessToken,
      token_type: tokens.tokenType,
      expires_in: Math.max(
        0,
        Math.floor(
          (new Date(tokens.expiresAt).getTime() - Date.now()) / 1000
        )
      ),
      // Refresh tokens remain server-only. Protected loaders refresh the signed
      // auth session before handing this short-lived access token to the client.
      refresh_token: "",
    },
    { fetch: createSpotifyRateLimitFetch(undefined, options) }
  );
};
