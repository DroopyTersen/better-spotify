import { mkdir, open, readFile } from "node:fs/promises";
import { dirname } from "node:path";

export async function createArtifactDirectory(path: string): Promise<string> {
  await mkdir(dirname(path), { recursive: true });
  try {
    await mkdir(path);
  } catch (error) {
    if (isAlreadyExists(error)) {
      throw new Error(`Artifact directory already exists: ${path}`);
    }
    throw error;
  }
  return path;
}
export async function writeJsonExclusive(
  path: string,
  value: unknown
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  let file;
  try {
    file = await open(path, "wx");
  } catch (error) {
    if (isAlreadyExists(error)) {
      throw new Error(`Artifact file already exists: ${path}`);
    }
    throw error;
  }

  try {
    await file.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  } finally {
    await file.close();
  }
}

export async function readJsonFile(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

function isAlreadyExists(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "EEXIST"
  );
}
