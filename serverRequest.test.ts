import { describe, expect, test } from "bun:test";
import { withExternalOrigin } from "./serverRequest";

describe("Fly proxy request URLs", () => {
  test("reconstructs the public HTTPS URL and preserves an action body", async () => {
    const request = new Request("http://0.0.0.0:3000/login?from=home", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        host: "betterspotify.com",
        origin: "https://betterspotify.com",
        "x-forwarded-proto": "https",
      },
      body: "intent=login",
    });

    const externalRequest = withExternalOrigin(request);

    expect(externalRequest.url).toBe(
      "https://betterspotify.com/login?from=home"
    );
    expect(externalRequest.method).toBe("POST");
    expect(externalRequest.headers.get("origin")).toBe(
      "https://betterspotify.com"
    );
    expect(await externalRequest.text()).toBe("intent=login");
  });

  test("uses the first forwarded protocol value", () => {
    const request = proxiedRequest({ "x-forwarded-proto": "https, http" });

    expect(withExternalOrigin(request).url).toBe(
      "https://betterspotify.com/login"
    );
  });

  test("leaves requests unchanged without trusted proxy URL metadata", () => {
    const noProtocol = proxiedRequest({ "x-forwarded-proto": "" });
    const unsafeProtocol = proxiedRequest({ "x-forwarded-proto": "javascript" });
    const unsafeHost = proxiedRequest({
      host: "betterspotify.com/path",
      "x-forwarded-proto": "https",
    });

    expect(withExternalOrigin(noProtocol)).toBe(noProtocol);
    expect(withExternalOrigin(unsafeProtocol)).toBe(unsafeProtocol);
    expect(withExternalOrigin(unsafeHost)).toBe(unsafeHost);
  });
});

function proxiedRequest(headers: Record<string, string>): Request {
  return new Request("http://0.0.0.0:3000/login", {
    headers: {
      host: "betterspotify.com",
      ...headers,
    },
  });
}
