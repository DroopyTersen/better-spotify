import { describe, expect, test } from "bun:test";
import { getChangedPlaylistName } from "./EditablePlaylistName";

describe("editable playlist name", () => {
  test("returns one trimmed canonical value only when the name changed", () => {
    expect(getChangedPlaylistName("Road Trip", "  Night Drive  ")).toBe(
      "Night Drive"
    );
    expect(getChangedPlaylistName("Road Trip", "Road Trip")).toBeNull();
    expect(getChangedPlaylistName("Road Trip", "   ")).toBeNull();
  });
});
