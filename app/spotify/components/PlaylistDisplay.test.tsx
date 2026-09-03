import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PlaylistDescription } from "./PlaylistDisplay";

describe("playlist description", () => {
  test("shows Spotify's description without surrounding whitespace", () => {
    const markup = renderToStaticMarkup(
      <PlaylistDescription description="  Dusty boots and bright hooks.  " />
    );

    expect(markup).toContain("Dusty boots and bright hooks.");
    expect(markup).not.toContain("  Dusty");
  });

  test("omits missing and blank descriptions", () => {
    expect(
      renderToStaticMarkup(<PlaylistDescription description={null} />)
    ).toBe("");
    expect(
      renderToStaticMarkup(<PlaylistDescription description="   " />)
    ).toBe("");
  });
});
