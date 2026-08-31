import { expect, test } from "bun:test";
import {
  getFetchErrorMessage,
  mergeRequestOptions,
} from "./fetch.utils";

test("fetch errors omit credentials, request bodies, queries, and response bodies", () => {
  const request = {
    url: "https://api.example.test/music?access_token=query-secret",
    method: "POST",
    headers: { Authorization: "Bearer header-secret" },
    body: "request-body-secret",
  };
  const message = getFetchErrorMessage(
    "Unsuccessful status code",
    request,
    new Response("response-body-secret", { status: 401 })
  );

  expect(message).toContain("POST https://api.example.test/music");
  expect(message).toContain("401");
  expect(message).not.toContain("query-secret");
  expect(message).not.toContain("header-secret");
  expect(message).not.toContain("request-body-secret");
  expect(message).not.toContain("response-body-secret");
});

test("request options merge every HeadersInit shape and allow blank overrides", () => {
  const options = mergeRequestOptions(
    {
      method: "GET",
      headers: new Headers({
        accept: "application/json",
        "content-type": "application/json",
      }),
    },
    {
      method: "POST",
      headers: [
        ["accept", "application/problem+json"],
        ["content-type", ""],
        ["x-request-id", "request-1"],
      ],
    }
  );
  const headers = new Headers(options.headers);

  expect(options.method).toBe("POST");
  expect(headers.get("accept")).toBe("application/problem+json");
  expect(headers.has("content-type")).toBeFalse();
  expect(headers.get("x-request-id")).toBe("request-1");
});
