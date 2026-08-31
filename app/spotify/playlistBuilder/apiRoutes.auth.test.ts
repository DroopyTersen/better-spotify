import { describe, expect, test } from "bun:test";
import { AUTH_SESSION_USER_KEY, createStoredSessionUser } from "~/auth/auth.shared";
import { authSessionStorage } from "~/auth/authSession.server";
import {
  action as buildPlaylistAction,
  loader as buildPlaylistLoader,
} from "./api.buildPlaylist.route";
import {
  action as modifyPlaylistAction,
  loader as modifyPlaylistLoader,
} from "./api.modifyPlaylist.route";
import { action as recommendArtistsAction } from "./api.new-artist-recommendations.route";
import { action as syncFailureReportAction } from "../sync/api.syncFailureReport.route";

describe("playlist API authentication boundary", () => {
  test.each([
    ["build playlist", buildPlaylistAction],
    ["modify playlist", modifyPlaylistAction],
    ["recommend artists", recommendArtistsAction],
    ["sync failure report", syncFailureReportAction],
  ])("%s rejects an unauthenticated request before parsing its body", async (_, action) => {
    const request = new Request("http://local.test/api", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not-json",
    });

    let thrown: unknown;
    try {
      await action({ request } as never);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Response);
    const response = thrown as Response;
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/login");
  });

  test.each([
    ["build playlist", buildPlaylistAction],
    ["modify playlist", modifyPlaylistAction],
    ["recommend artists", recommendArtistsAction],
    ["sync failure report", syncFailureReportAction],
  ])("%s validates an authenticated body before external work", async (_, action) => {
    const request = new Request("http://local.test/api", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: await authenticatedCookie(),
      },
      body: "{}",
    });

    const response = await action({ request } as never);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Request body is invalid" });
  });

  test("playlist build resumption requires authentication", async () => {
    const request = new Request(
      "http://local.test/api/build-playlist?jobId=4a4de4c4-f5dd-46aa-9f9a-3cd794e78a5a"
    );

    let thrown: unknown;
    try {
      await buildPlaylistLoader({ request } as never);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(302);
  });

  test("playlist build resumption hides unavailable jobs", async () => {
    const request = new Request(
      "http://local.test/api/build-playlist?jobId=4a4de4c4-f5dd-46aa-9f9a-3cd794e78a5a",
      { headers: { cookie: await authenticatedCookie() } }
    );

    const response = await buildPlaylistLoader({ request } as never);
    expect(response.status).toBe(204);
  });

  test("playlist tweak resumption requires authentication", async () => {
    const request = new Request(
      "http://local.test/api/modify-playlist?jobId=4a4de4c4-f5dd-46aa-9f9a-3cd794e78a5a"
    );

    let thrown: unknown;
    try {
      await modifyPlaylistLoader({ request } as never);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(302);
  });

  test("playlist tweak resumption hides unavailable jobs", async () => {
    const request = new Request(
      "http://local.test/api/modify-playlist?jobId=4a4de4c4-f5dd-46aa-9f9a-3cd794e78a5a",
      { headers: { cookie: await authenticatedCookie() } }
    );

    const response = await modifyPlaylistLoader({ request } as never);
    expect(response.status).toBe(204);
  });
});

async function authenticatedCookie() {
  const session = await authSessionStorage.getSession();
  session.set(
    AUTH_SESSION_USER_KEY,
    createStoredSessionUser(
      { account_id: "account-id", display_name: "Listener" },
      {
        accessToken: "access-token",
        refreshToken: "refresh-token",
        tokenType: "Bearer",
        expiresAt: "2030-01-01T00:00:00.000Z",
      },
      "public-client-id"
    )
  );
  return (await authSessionStorage.commitSession(session)).split(";", 1)[0];
}
