import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { PLAYLIST_GENERATION_MODEL_ID } from "../../app/spotify/playlistBuilder/aiGeneration.server";
import { generatePlaylist } from "../../app/spotify/playlistBuilder/generatePlaylist.server";
import { createArtifactDirectory, readJsonFile, writeJsonExclusive } from "./artifactStore";
import { playlistQualityCases } from "./benchmark.v1";
import {
  createBlindComparison,
  createJudgePacket,
  runPlaylistBenchmark,
} from "./harness";
import {
  summarizeDeterministicRun,
  summarizePlaylistRun,
  validatePlaylistBenchmark,
} from "./metrics";
import {
  PlaylistEvalJudgmentsSchema,
  PlaylistEvalRunSchema,
} from "./schemas";

const DEFAULT_ARTIFACT_ROOT = resolve(".artifacts/playlist-quality");

await main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Playlist evaluation failed");
  process.exitCode = 1;
});

async function main(rawArgs: string[]): Promise<void> {
  const args = rawArgs.filter((argument) => argument !== "--");
  const command = args.shift();
  if (!command || command === "help" || command === "--help") {
    printHelp();
    return;
  }

  if (command === "run") {
    await runCommand(args);
    return;
  }
  if (command === "compare") {
    await compareCommand(args);
    return;
  }
  if (command === "report") {
    await reportCommand(args);
    return;
  }
  throw new Error(`Unknown eval command: ${command}`);
}

async function runCommand(args: string[]): Promise<void> {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    throw new Error("OPENAI_API_KEY is required for a live playlist eval run");
  }

  const label = requiredOption(args, "--label");
  const samplesPerCase = integerOption(args, "--samples", 3);
  const requestedCaseIds = optionValues(args, "--case");
  const outputOption = takeOption(args, "--output");
  assertNoUnusedArguments(args);

  const cases =
    requestedCaseIds.length === 0
      ? playlistQualityCases
      : requestedCaseIds.map((caseId) => {
          const evalCase = playlistQualityCases.find(({ id }) => id === caseId);
          if (!evalCase) throw new Error(`Unknown benchmark case: ${caseId}`);
          return evalCase;
        });
  validatePlaylistBenchmark(cases);
  const sourceRevision = gitOutput(["rev-parse", "HEAD"]);
  const sourceDirty = gitOutput(["status", "--porcelain"]).length > 0;

  const outputDirectory = resolve(
    outputOption ?? join(DEFAULT_ARTIFACT_ROOT, `${label}-${fileTimestamp(Date.now())}`)
  );
  await createArtifactDirectory(outputDirectory);

  const run = await runPlaylistBenchmark({
    label,
    cases,
    samplesPerCase,
    sourceRevision,
    sourceDirty,
    generator: {
      modelId: PLAYLIST_GENERATION_MODEL_ID,
      generate: (input) => generatePlaylist(input, { vibeBrief: null }),
    },
    onSample: async (sample) => {
      await writeJsonExclusive(
        join(
          outputDirectory,
          "samples",
          `${sample.caseId}.sample-${sample.sample}.json`
        ),
        sample
      );
      console.log(
        `${sample.caseId} sample ${sample.sample}: ${sample.status}`
      );
    },
  });

  await writeJsonExclusive(join(outputDirectory, "run.json"), run);
  await writeJsonExclusive(
    join(outputDirectory, "deterministic-summary.json"),
    summarizeDeterministicRun(run)
  );
  await writeJsonExclusive(
    join(outputDirectory, "judge-packet.json"),
    createJudgePacket(run)
  );

  console.log(`Playlist eval artifacts: ${outputDirectory}`);
  if (!run.complete) process.exitCode = 1;
}

async function compareCommand(args: string[]): Promise<void> {
  const baselinePath = resolve(requiredOption(args, "--baseline"));
  const candidatePath = resolve(requiredOption(args, "--candidate"));
  const seed = takeOption(args, "--seed") ?? "playlist-quality-v1";
  const outputOption = takeOption(args, "--output");
  assertNoUnusedArguments(args);

  const baseline = PlaylistEvalRunSchema.parse(await readJsonFile(baselinePath));
  const candidate = PlaylistEvalRunSchema.parse(await readJsonFile(candidatePath));
  const comparison = createBlindComparison(baseline, candidate, seed);
  const outputDirectory = resolve(
    outputOption ??
      join(DEFAULT_ARTIFACT_ROOT, `comparison-${fileTimestamp(Date.now())}`)
  );
  await createArtifactDirectory(outputDirectory);
  await writeJsonExclusive(
    join(outputDirectory, "comparison.json"),
    comparison.packet
  );
  await writeJsonExclusive(
    join(outputDirectory, "comparison-key.json"),
    comparison.key
  );
  console.log(`Blind comparison artifacts: ${outputDirectory}`);
}

async function reportCommand(args: string[]): Promise<void> {
  const runPath = resolve(requiredOption(args, "--run"));
  const judgmentsPath = resolve(requiredOption(args, "--judgments"));
  const outputPath = resolve(
    takeOption(args, "--output") ?? join(dirname(runPath), "report.json")
  );
  assertNoUnusedArguments(args);

  const run = PlaylistEvalRunSchema.parse(await readJsonFile(runPath));
  const judgments = PlaylistEvalJudgmentsSchema.parse(
    await readJsonFile(judgmentsPath)
  );
  const report = summarizePlaylistRun(run, judgments);
  await writeJsonExclusive(outputPath, report);
  console.log(`Playlist eval report: ${outputPath}`);
}

function requiredOption(args: string[], name: string): string {
  const value = takeOption(args, name);
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function integerOption(args: string[], name: string, fallback: number): number {
  const value = takeOption(args, name);
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`${name} must be an integer`);
  return parsed;
}

function optionValues(args: string[], name: string): string[] {
  const values: string[] = [];
  let value = takeOption(args, name);
  while (value !== undefined) {
    values.push(value);
    value = takeOption(args, name);
  }
  return values;
}

function takeOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  args.splice(index, 2);
  return value;
}

function assertNoUnusedArguments(args: string[]): void {
  if (args.length > 0) throw new Error(`Unexpected arguments: ${args.join(" ")}`);
}

function gitOutput(args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function fileTimestamp(milliseconds: number): string {
  return new Date(milliseconds).toISOString().replace(/[-:.]/g, "");
}

function printHelp(): void {
  console.log(`Playlist quality evaluation

Commands:
  run --label LABEL [--samples 3] [--case CASE_ID] [--output DIRECTORY]
  compare --baseline RUN_JSON --candidate RUN_JSON [--seed SEED] [--output DIRECTORY]
  report --run RUN_JSON --judgments JUDGMENTS_JSON [--output REPORT_JSON]

The run command is billable and requires OPENAI_API_KEY. Compare and report are
network-free. No command authenticates with Spotify or writes a Spotify playlist.`);
}
