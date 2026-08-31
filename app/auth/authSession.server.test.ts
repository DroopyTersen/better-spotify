import { describe, expect, test } from "bun:test";
import {
  MIN_PRODUCTION_SESSION_SECRET_BYTES,
  requireValidSessionSecret,
} from "./authSession.server";

describe("SESSION_SECRET validation", () => {
  test("always requires a non-empty value", () => {
    expect(() => requireValidSessionSecret(undefined, "development")).toThrow(
      "SESSION_SECRET must be set"
    );
    expect(() => requireValidSessionSecret("   ", "test")).toThrow(
      "SESSION_SECRET must be set"
    );
  });

  test("requires at least 32 bytes in production", () => {
    expect(() => requireValidSessionSecret("too-short", "production")).toThrow(
      "SESSION_SECRET must be at least 32 bytes in production"
    );
    expect(
      requireValidSessionSecret(
        "x".repeat(MIN_PRODUCTION_SESSION_SECRET_BYTES),
        "production"
      )
    ).toHaveLength(MIN_PRODUCTION_SESSION_SECRET_BYTES);
  });

  test("does not break an existing local development session", () => {
    expect(requireValidSessionSecret("local-secret", "development")).toBe(
      "local-secret"
    );
  });
});
