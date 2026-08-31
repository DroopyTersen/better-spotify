import { describe, expect, test } from "bun:test";
import {
  runSpotifyEndpointDiagnostics,
  SPOTIFY_DIAGNOSTIC_CHECK_IDS,
} from "./spotifyDiagnostics";

describe("Spotify account diagnostics", () => {
  test("probes every read-only integration boundary without exposing the token", async () => {
    const requests: Request[] = [];
    const report = await runSpotifyEndpointDiagnostics("access-secret", {
      fetchImplementation: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        const profile = request.url.endsWith("/v1/me");
        return Response.json(profile ? { account_id: "account" } : { items: [] });
      },
    });

    expect(report.allAvailable).toBeTrue();
    expect(report.checks.map(({ id }) => id)).toEqual([
      ...SPOTIFY_DIAGNOSTIC_CHECK_IDS,
    ]);
    expect(requests).toHaveLength(SPOTIFY_DIAGNOSTIC_CHECK_IDS.length);
    expect(
      requests.every(
        (request) =>
          request.url.startsWith("https://api.spotify.com/v1/") &&
          request.headers.get("authorization") === "Bearer access-secret"
      )
    ).toBeTrue();
    expect(JSON.stringify(report)).not.toContain("access-secret");
  });

  test("classifies provider failures without returning response bodies", async () => {
    const responses = [
      new Response("expired token details", { status: 401 }),
      new Response("account policy details", { status: 403 }),
      Response.json(
        { error: { reason: "QUOTA_EXCEEDED", message: "private detail" } },
        { status: 429 }
      ),
      new Response("temporarily busy", { status: 503 }),
      Response.json({ unexpected: true }),
      Response.error(),
    ];
    let index = 0;

    const report = await runSpotifyEndpointDiagnostics("access-secret", {
      fetchImplementation: () => Promise.resolve(responses[index++]!),
    });

    expect(report.allAvailable).toBeFalse();
    expect(report.checks.map(({ outcome, status }) => ({ outcome, status })))
      .toEqual([
        { outcome: "unauthorized", status: 401 },
        { outcome: "forbidden", status: 403 },
        { outcome: "quota_exceeded", status: 429 },
        { outcome: "provider_error", status: 503 },
        { outcome: "invalid_response", status: 200 },
        { outcome: "network_error", status: null },
      ]);
    expect(JSON.stringify(report)).not.toContain("private detail");
    expect(JSON.stringify(report)).not.toContain("account policy details");
  });

  test("contains a rejected browser request as a network result", async () => {
    const report = await runSpotifyEndpointDiagnostics("access-secret", {
      fetchImplementation: () => Promise.reject(new TypeError("CORS blocked")),
    });

    expect(report.checks.every(({ outcome }) => outcome === "network_error"))
      .toBeTrue();
  });
});
