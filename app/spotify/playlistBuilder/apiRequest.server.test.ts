import { describe, expect, test } from "bun:test";
import { z } from "zod";
import {
  ApiRequestError,
  apiErrorResponse,
  parseJsonMutation,
} from "./apiRequest.server";

const ExampleSchema = z.object({ name: z.string().max(20) });

describe("parseJsonMutation", () => {
  test("accepts a bounded JSON POST and returns only schema fields", async () => {
    const request = jsonRequest(
      JSON.stringify({ name: "playlist", ignored: "not forwarded" })
    );

    await expect(parseJsonMutation(request, ExampleSchema, 100)).resolves.toEqual({
      name: "playlist",
    });
  });

  test("rejects methods and content types outside the JSON POST contract", async () => {
    const methodError = await captureApiError(
      parseJsonMutation(
        new Request("http://local.test/api", { method: "DELETE" }),
        ExampleSchema,
        100
      )
    );
    expect(methodError.status).toBe(405);
    expect(methodError.headers).toEqual({ Allow: "POST" });

    const contentTypeError = await captureApiError(
      parseJsonMutation(
        new Request("http://local.test/api", {
          method: "POST",
          headers: { "content-type": "text/plain" },
          body: JSON.stringify({ name: "playlist" }),
        }),
        ExampleSchema,
        100
      )
    );
    expect(contentTypeError.status).toBe(415);
  });

  test("enforces declared and streamed byte limits", async () => {
    const declaredLengthError = await captureApiError(
      parseJsonMutation(
        new Request("http://local.test/api", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "content-length": "1000",
          },
          body: "{}",
        }),
        ExampleSchema,
        100
      )
    );
    expect(declaredLengthError.status).toBe(413);

    const streamedLengthError = await captureApiError(
      parseJsonMutation(jsonRequest(JSON.stringify({ name: "playlist" })), ExampleSchema, 5)
    );
    expect(streamedLengthError.status).toBe(413);
  });

  test("returns generic client errors for malformed and invalid bodies", async () => {
    const malformedError = await captureApiError(
      parseJsonMutation(jsonRequest("{"), ExampleSchema, 100)
    );
    expect(malformedError.status).toBe(400);
    expect(malformedError.clientMessage).toBe("Request body must be valid JSON");

    const schemaError = await captureApiError(
      parseJsonMutation(jsonRequest(JSON.stringify({ name: 42 })), ExampleSchema, 100)
    );
    expect(schemaError.status).toBe(400);
    expect(schemaError.clientMessage).toBe("Request body is invalid");
  });
});

test("apiErrorResponse never propagates an unexpected error message", async () => {
  const response = apiErrorResponse(
    new Error("provider-secret-and-payload"),
    "Request failed"
  );

  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ error: "Request failed" });
});

function jsonRequest(body: string) {
  return new Request("http://local.test/api", {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body,
  });
}

async function captureApiError(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ApiRequestError);
    return error as ApiRequestError;
  }
  throw new Error("Expected ApiRequestError");
}
