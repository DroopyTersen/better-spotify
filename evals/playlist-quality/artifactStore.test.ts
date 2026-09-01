import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createArtifactDirectory,
  writeJsonExclusive,
} from "./artifactStore";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});
describe("playlist evaluation artifact storage", () => {
  test("creates a new run directory and refuses to reuse it", async () => {
    const root = await mkdtemp(join(tmpdir(), "playlist-eval-store-"));
    temporaryRoots.push(root);
    const runDirectory = join(root, "run-one");

    await expect(createArtifactDirectory(runDirectory)).resolves.toBe(
      runDirectory
    );
    await expect(createArtifactDirectory(runDirectory)).rejects.toThrow(
      "already exists"
    );
  });

  test("writes formatted JSON exactly once", async () => {
    const root = await mkdtemp(join(tmpdir(), "playlist-eval-json-"));
    temporaryRoots.push(root);
    const output = join(root, "artifact.json");

    await writeJsonExclusive(output, { result: "baseline" });
    expect(await readFile(output, "utf8")).toBe(
      '{\n  "result": "baseline"\n}\n'
    );
    await expect(
      writeJsonExclusive(output, { result: "replacement" })
    ).rejects.toThrow("already exists");
  });
});
