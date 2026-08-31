import { describe, expect, test } from "bun:test";
import {
  AUTH_REVALIDATION_LEEWAY_MS,
  getAuthRevalidationDelay,
} from "./authRevalidation";

describe("browser auth revalidation", () => {
  test("requests server refresh before the access token expires", () => {
    const now = Date.parse("2026-08-30T12:00:00.000Z");
    const expiresAt = new Date(now + 60 * 60 * 1000).toISOString();

    expect(getAuthRevalidationDelay(expiresAt, now)).toBe(
      60 * 60 * 1000 - AUTH_REVALIDATION_LEEWAY_MS
    );
  });

  test("revalidates immediately for expired or invalid token timestamps", () => {
    const now = Date.parse("2026-08-30T12:00:00.000Z");

    expect(
      getAuthRevalidationDelay("2026-08-30T11:59:00.000Z", now)
    ).toBe(0);
    expect(getAuthRevalidationDelay("invalid", now)).toBe(0);
  });
});
