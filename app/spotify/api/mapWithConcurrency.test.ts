import { describe, expect, test } from "bun:test";
import { mapWithConcurrency } from "./mapWithConcurrency";

describe("mapWithConcurrency", () => {
  test("bounds active work and preserves input order", async () => {
    let active = 0;
    let maximumActive = 0;

    const results = await mapWithConcurrency(
      [3, 2, 1, 0],
      2,
      async (value) => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await new Promise((resolve) => setTimeout(resolve, value));
        active -= 1;
        return `result-${value}`;
      }
    );

    expect(maximumActive).toBe(2);
    expect(results).toEqual([
      "result-3",
      "result-2",
      "result-1",
      "result-0",
    ]);
  });

  test("rejects invalid concurrency", async () => {
    await expect(
      mapWithConcurrency([1], 0, async (value) => value)
    ).rejects.toThrow(RangeError);
  });

  test("stops dequeuing work after a mapper fails", async () => {
    const started: number[] = [];

    await expect(
      mapWithConcurrency([0, 1, 2, 3], 2, async (value) => {
        started.push(value);
        if (value === 0) throw new Error("failed");
        await new Promise((resolve) => setTimeout(resolve, 0));
        return value;
      })
    ).rejects.toThrow("failed");

    expect(started).toEqual([0, 1]);
  });
});
