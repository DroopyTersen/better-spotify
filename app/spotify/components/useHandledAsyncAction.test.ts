import { describe, expect, test } from "bun:test";
import { runHandledAsyncAction } from "./useHandledAsyncAction";

describe("runHandledAsyncAction", () => {
  test("contains a rejected album action and always resets pending state", async () => {
    const pendingStates: boolean[] = [];
    const errors: Array<string | null> = [];

    await expect(
      runHandledAsyncAction(
        async () => {
          throw new Error("album provider failed");
        },
        "Could not add this album",
        {
          setPending: (pending) => pendingStates.push(pending),
          setError: (error) => errors.push(error),
        }
      )
    ).resolves.toBeUndefined();

    expect(pendingStates).toEqual([true, false]);
    expect(errors).toEqual([null, "Could not add this album"]);
  });
});
