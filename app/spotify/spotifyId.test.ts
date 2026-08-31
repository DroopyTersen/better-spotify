import { describe, expect, test } from "bun:test";
import { requireSpotifyId } from "./spotifyId";

describe("Spotify route ids", () => {
  test("accepts a bounded base62-style Spotify id", () => {
    expect(requireSpotifyId("4NHQUGzhtTLFvgF5SZesLK")).toBe(
      "4NHQUGzhtTLFvgF5SZesLK"
    );
  });

  test.each([
    undefined,
    "",
    "../me",
    "artist/related",
    "id?market=US",
    "a".repeat(129),
  ])("rejects an unsafe Spotify route id: %s", (value) => {
    let thrown: unknown;
    try {
      requireSpotifyId(value);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(404);
  });
});
