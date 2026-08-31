import { describe, expect, test } from "bun:test";
import { shouldRevalidate } from "./spotify-diagnostics.route";

type RevalidationArgs = Parameters<typeof shouldRevalidate>[0];

const createArgs = (
  overrides: Partial<RevalidationArgs> = {}
): RevalidationArgs => ({
  currentUrl: new URL("https://betterspotify.com/diagnostics"),
  currentParams: {},
  nextUrl: new URL("https://betterspotify.com/diagnostics"),
  nextParams: {},
  defaultShouldRevalidate: true,
  ...overrides,
});

describe("Spotify diagnostics revalidation", () => {
  test("ignores ambient same-page revalidations", () => {
    expect(shouldRevalidate(createArgs())).toBe(false);
  });

  test("keeps React Router defaults for navigation and submissions", () => {
    expect(
      shouldRevalidate(
        createArgs({
          nextUrl: new URL("https://betterspotify.com/diagnostics?run=2"),
        })
      )
    ).toBe(true);
    expect(
      shouldRevalidate(createArgs({ formMethod: "POST" }))
    ).toBe(true);
  });
});
