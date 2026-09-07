import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { SpotifyApi } from "@spotify/web-api-ts-sdk";
import { createSpotifyRateLimitFetch } from "../../app/spotify/createSpotifySdk";
import {
  PLAYLIST_GENERATION_MODEL_ID,
} from "../../app/spotify/playlistBuilder/aiGeneration.server";
import {
  discoverArtistsForVibeSource,
  NEW_ARTIST_TARGET,
} from "../../app/spotify/playlistBuilder/playlistDiscovery.server";
import {
  createArtifactDirectory,
  sanitizeArtifactError,
  writeJsonExclusive,
} from "../playlist-quality/artifactStore";
import { discoveryQualityCases } from "./benchmark.v1";
import {
  createDiscoveryJudgePacket,
  runDiscoveryBenchmark,
  summarizeDiscoveryRun,
  validateDiscoveryBenchmark,
  validateDiscoveryLabel,
} from "./harness";

const DEFAULT_ARTIFACT_ROOT = resolve(".artifacts/discovery-quality");

await main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(sanitizeArtifactError(error).message);
  process.exitCode = 1;
});

async function main(rawArgs: string[]): Promise<void> {
  const args = rawArgs.filter((argument) => argument !== "--");
  if (args.length === 0 || args.includes("--help")) {
    printHelp();
    return;
  }
  if (!process.env.OPENAI_API_KEY?.trim()) {
    throw new Error("OPENAI_API_KEY is required for a live discovery eval run");
  }
  const spotifyClientId = requiredEnvironmentVariable("SPOTIFY_CLIENT_ID");
  const spotifyClientSecret = requiredEnvironmentVariable(
    "SPOTIFY_CLIENT_SECRET"
  );

  const label = requiredOption(args, "--label");
  validateDiscoveryLabel(label);
  const samplesPerCase = integerOption(args, "--samples", 3);
  const requestedCaseIds = optionValues(args, "--case");
  const outputOption = takeOption(args, "--output");
  assertNoUnusedArguments(args);

  const cases =
    requestedCaseIds.length === 0
      ? discoveryQualityCases
      : requestedCaseIds.map((caseId) => {
          const evalCase = discoveryQualityCases.find(({ id }) => id === caseId);
          if (!evalCase) throw new Error(`Unknown discovery case: ${caseId}`);
          return evalCase;
        });
  validateDiscoveryBenchmark(cases, samplesPerCase);
  const outputDirectory = resolve(
    outputOption ??
      join(DEFAULT_ARTIFACT_ROOT, `${label}-${fileTimestamp(Date.now())}`)
  );
  await createArtifactDirectory(outputDirectory);
  const sdk = SpotifyApi.withClientCredentials(
    spotifyClientId,
    spotifyClientSecret,
    [],
    { fetch: createSpotifyRateLimitFetch() }
  );
  const { authenticated } = await sdk.authenticate();
  if (!authenticated) {
    throw new Error("Spotify client credentials could not authenticate");
  }

  const run = await runDiscoveryBenchmark({
    label,
    modelId: PLAYLIST_GENERATION_MODEL_ID,
    sourceRevision: gitOutput(["rev-parse", "HEAD"]),
    sourceDirty: gitOutput(["status", "--porcelain"]).length > 0,
    samplesPerCase,
    cases,
    generate: async (evalCase) => {
      const discovery = await discoverArtistsForVibeSource(
        evalCase.referenceVibeBrief.source,
        evalCase.knownArtists,
        NEW_ARTIST_TARGET,
        sdk
      );
      return {
        vibeBrief: discovery.vibeBrief,
        resolvedArtists: discovery.rankedArtists.flatMap((artist) =>
          artist.artist_name
            ? [{ artistId: artist.artist_id, artistName: artist.artist_name }]
            : []
        ),
        discoveryEvidence: discovery.discoveryEvidence,
        failedScoutLanes: discovery.failedScoutLanes,
      };
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
      if (sample.status === "failure") {
        console.log(
          `${sample.caseId} sample ${sample.sample}: failed (${sample.error.name})`
        );
        return;
      }
      const summary = [
        `${sample.resolvedArtists.length} resolved artists`,
        `${sample.discoveryEvidence.length} evidence-backed`,
      ].join(", ");
      const failed =
        sample.failedScoutLanes.length > 0
          ? `; failed lanes: ${sample.failedScoutLanes.join(", ")}`
          : "";
      console.log(`${sample.caseId} sample ${sample.sample}: ${summary}${failed}`);
    },
  });

  await writeJsonExclusive(join(outputDirectory, "run.json"), run);
  await writeJsonExclusive(
    join(outputDirectory, "summary.json"),
    summarizeDiscoveryRun(run)
  );
  await writeJsonExclusive(
    join(outputDirectory, "judge-packet.json"),
    createDiscoveryJudgePacket(run)
  );
  console.log(`Discovery eval artifacts: ${outputDirectory}`);
  if (!run.complete) process.exitCode = 1;
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

function requiredEnvironmentVariable(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for a live discovery eval run`);
  }
  return value;
}

function fileTimestamp(milliseconds: number): string {
  return new Date(milliseconds).toISOString().replace(/[-:.]/g, "");
}

function printHelp(): void {
  console.log(`Discovery quality evaluation

Usage:
  bun run eval:discovery -- --label LABEL [--samples 3] [--case CASE_ID] [--output DIRECTORY]

The command is billable and requires OPENAI_API_KEY, SPOTIFY_CLIENT_ID, and
SPOTIFY_CLIENT_SECRET. Each sample runs the production baseline and three
bounded web scouts, then performs read-only Spotify artist searches. It never
uses a listener account or creates a playlist.`);
}
