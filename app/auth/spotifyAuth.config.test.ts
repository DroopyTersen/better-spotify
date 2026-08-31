import { describe, expect, test } from "bun:test";
import { normalizeAppOrigin } from "./spotifyAuth.config";

describe("APP_URL validation", () => {
  test("accepts an HTTP loopback or HTTPS deployment origin", () => {
    expect(normalizeAppOrigin("http://127.0.0.1:5173")).toBe(
      "http://127.0.0.1:5173"
    );
    expect(normalizeAppOrigin("http://[::1]:5173")).toBe(
      "http://[::1]:5173"
    );
    expect(normalizeAppOrigin("https://music.example.com/")).toBe(
      "https://music.example.com"
    );
  });

  test.each([
    "javascript:alert(1)",
    "http://localhost:5173",
    "http://music.example.com",
    "https://user:password@music.example.com",
    "https://music.example.com/unexpected-path",
    "https://music.example.com?redirect=elsewhere",
  ])("rejects a non-origin APP_URL: %s", (value) => {
    expect(() => normalizeAppOrigin(value)).toThrow(
      "APP_URL must be a valid HTTP(S) origin"
    );
  });
});
