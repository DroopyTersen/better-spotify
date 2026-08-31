export const SPOTIFY_DIAGNOSTIC_CHECK_IDS = [
  "profile",
  "playlists",
  "top_tracks",
  "top_artists",
  "recently_played",
  "saved_tracks",
] as const;

export type SpotifyDiagnosticCheckId =
  (typeof SPOTIFY_DIAGNOSTIC_CHECK_IDS)[number];

export const SPOTIFY_DIAGNOSTIC_OUTCOMES = [
  "available",
  "unauthorized",
  "forbidden",
  "rate_limited",
  "quota_exceeded",
  "invalid_response",
  "network_error",
  "provider_error",
] as const;

export type SpotifyDiagnosticOutcome =
  (typeof SPOTIFY_DIAGNOSTIC_OUTCOMES)[number];

export type SpotifyDiagnosticCheck = Readonly<{
  id: SpotifyDiagnosticCheckId;
  label: string;
  outcome: SpotifyDiagnosticOutcome;
  status: number | null;
}>;

export type SpotifyDiagnosticReport = Readonly<{
  allAvailable: boolean;
  checks: SpotifyDiagnosticCheck[];
}>;

type SpotifyDiagnosticOptions = Readonly<{
  fetchImplementation?: DiagnosticFetch;
  signal?: AbortSignal;
}>;

type DiagnosticFetch = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

type CheckDefinition = Readonly<{
  id: SpotifyDiagnosticCheckId;
  label: string;
  path: string;
  responseKind: "profile" | "page";
}>;

const SPOTIFY_API_ORIGIN = "https://api.spotify.com";

const CHECKS: readonly CheckDefinition[] = [
  {
    id: "profile",
    label: "Account profile",
    path: "/v1/me",
    responseKind: "profile",
  },
  {
    id: "playlists",
    label: "Your playlists",
    path: "/v1/me/playlists?limit=1&offset=0",
    responseKind: "page",
  },
  {
    id: "top_tracks",
    label: "Top tracks",
    path: "/v1/me/top/tracks?time_range=long_term&limit=1&offset=0",
    responseKind: "page",
  },
  {
    id: "top_artists",
    label: "Top artists",
    path: "/v1/me/top/artists?time_range=long_term&limit=1&offset=0",
    responseKind: "page",
  },
  {
    id: "recently_played",
    label: "Recently played",
    path: "/v1/me/player/recently-played?limit=1",
    responseKind: "page",
  },
  {
    id: "saved_tracks",
    label: "Saved tracks",
    path: "/v1/me/tracks?limit=1&offset=0",
    responseKind: "page",
  },
];

export async function runSpotifyEndpointDiagnostics(
  accessToken: string,
  options: SpotifyDiagnosticOptions = {}
): Promise<SpotifyDiagnosticReport> {
  if (!accessToken.trim()) {
    throw new Error("A Spotify access token is required for diagnostics");
  }

  const fetchImplementation = options.fetchImplementation ?? fetch;
  const checks: SpotifyDiagnosticCheck[] = [];

  // Run sequentially to avoid turning a diagnostic into a quota spike.
  for (const definition of CHECKS) {
    checks.push(
      await runCheck(
        definition,
        accessToken,
        fetchImplementation,
        options.signal
      )
    );
  }

  return {
    allAvailable: checks.every(({ outcome }) => outcome === "available"),
    checks,
  };
}

async function runCheck(
  definition: CheckDefinition,
  accessToken: string,
  fetchImplementation: DiagnosticFetch,
  signal?: AbortSignal
): Promise<SpotifyDiagnosticCheck> {
  try {
    const response = await fetchImplementation(
      new URL(definition.path, SPOTIFY_API_ORIGIN),
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal,
      }
    );

    if (response.status === 0) {
      return {
        id: definition.id,
        label: definition.label,
        outcome: "network_error",
        status: null,
      };
    }

    if (!response.ok) {
      return {
        id: definition.id,
        label: definition.label,
        outcome: await classifyHttpFailure(response),
        status: response.status,
      };
    }

    const valid = await hasExpectedResponseShape(
      response,
      definition.responseKind
    );
    return {
      id: definition.id,
      label: definition.label,
      outcome: valid ? "available" : "invalid_response",
      status: response.status,
    };
  } catch {
    return {
      id: definition.id,
      label: definition.label,
      outcome: "network_error",
      status: null,
    };
  }
}

async function classifyHttpFailure(
  response: Response
): Promise<SpotifyDiagnosticOutcome> {
  if (response.status === 401) return "unauthorized";
  if (response.status === 403) return "forbidden";
  if (response.status !== 429) return "provider_error";

  try {
    const body = (await response.json()) as {
      reason?: unknown;
      error?: { reason?: unknown };
    };
    const reason = body.reason ?? body.error?.reason;
    return reason === "QUOTA_EXCEEDED"
      ? "quota_exceeded"
      : "rate_limited";
  } catch {
    return "rate_limited";
  }
}

async function hasExpectedResponseShape(
  response: Response,
  kind: CheckDefinition["responseKind"]
): Promise<boolean> {
  try {
    const body = (await response.json()) as Record<string, unknown>;
    if (!body || typeof body !== "object") return false;
    if (kind === "profile") {
      return (
        (typeof body.account_id === "string" && body.account_id.length > 0) ||
        (typeof body.id === "string" && body.id.length > 0)
      );
    }
    return Array.isArray(body.items);
  } catch {
    return false;
  }
}
