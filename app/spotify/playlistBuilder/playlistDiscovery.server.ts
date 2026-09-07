import { z } from "zod";
import { mapWithConcurrency } from "../api/mapWithConcurrency";
import type { SpotifySdk } from "../createSpotifySdk";
import {
  generateStructuredObject,
  generateWebResearchObject,
  type StructuredGenerationRequest,
} from "./aiGeneration.server";
import {
  runDiscoveryScouts,
  type DiscoveryEvidence,
  type DiscoveryScoutGenerator,
  type DiscoveryScoutFinding,
  type DiscoveryScoutLane,
} from "./playlistDiscoveryScouts.server";
import type {
  BuildPlaylistInput,
  FamiliarSongsPool,
  SelectedPlaylistArtist,
} from "./playlistBuilder.types";
import {
  buildVibeBriefSource,
  VibeBriefSchema,
  VibeProfileSchema,
  VibeBriefSourceSchema,
  type VibeBrief,
  type VibeBriefSource,
} from "./vibeBrief";

export const NEW_ARTIST_TARGET = 5;
const ARTIST_CANDIDATE_BUFFER = 3;
const ARTIST_SEARCH_CONCURRENCY = 5;
const MAX_EXCLUDED_ARTISTS = 500;

const PlaylistDiscoveryModelResponse = z.object({
  vibeProfile: VibeProfileSchema,
  recommendedArtists: z.array(z.string().trim().min(1).max(200)),
});

type PlaylistDiscoveryModelResponse = z.infer<
  typeof PlaylistDiscoveryModelResponse
>;

type PlaylistDiscoveryGenerator = (
  request: StructuredGenerationRequest<PlaylistDiscoveryModelResponse>
) => Promise<PlaylistDiscoveryModelResponse>;

type PlaylistDiscoveryDependencies = {
  generateBaseline?: PlaylistDiscoveryGenerator;
  generateScout?: DiscoveryScoutGenerator;
  reportScoutFailures?: (lanes: readonly DiscoveryScoutLane[]) => void;
};

export type PlaylistDiscovery = {
  vibeBrief: VibeBrief;
  rankedArtists: SelectedPlaylistArtist[];
  discoveryEvidence: DiscoveryEvidence[];
  failedScoutLanes: DiscoveryScoutLane[];
};

export async function discoverPlaylistArtists(
  input: BuildPlaylistInput,
  sdk: SpotifySdk,
  {
    generateBaseline = generateStructuredObject,
    generateScout = generateWebResearchObject,
    reportScoutFailures = reportDiscoveryScoutFailures,
  }: PlaylistDiscoveryDependencies = {}
): Promise<PlaylistDiscovery> {
  const source = buildVibeBriefSource(input);
  const artistsToExclude = familiarArtistNames(input.data.familiarSongsPool);
  const desiredArtistCount =
    input.formData.newStuffAmount === "none" ? 0 : NEW_ARTIST_TARGET;
  return discoverArtistsForVibeSource(
    source,
    artistsToExclude,
    desiredArtistCount,
    sdk,
    { generateBaseline, generateScout, reportScoutFailures }
  );
}

export async function discoverArtistsForVibeSource(
  rawSource: VibeBriefSource,
  artistsToExclude: readonly string[],
  desiredBaselineArtistCount: number,
  sdk: SpotifySdk,
  {
    generateBaseline = generateStructuredObject,
    generateScout = generateWebResearchObject,
    reportScoutFailures = reportDiscoveryScoutFailures,
  }: PlaylistDiscoveryDependencies = {}
): Promise<PlaylistDiscovery> {
  const source = VibeBriefSourceSchema.parse(rawSource);
  const generated = await generatePlaylistDiscovery(
    source,
    artistsToExclude,
    desiredBaselineArtistCount,
    generateBaseline
  );
  const [baselineArtists, scoutRun] = await Promise.all([
    resolveArtistCandidates(
      sdk,
      generated.artistCandidates,
      desiredBaselineArtistCount,
      [
        ...artistsToExclude,
        ...source.selectedArtists,
        ...source.selectedTracks.map(({ artist }) => artist),
      ]
    ),
    desiredBaselineArtistCount === 0
      ? Promise.resolve({ findings: [], failedLanes: [] })
      : runDiscoveryScouts(
          generated.vibeBrief,
          artistsToExclude,
          generateScout
        ),
  ]);
  if (scoutRun.failedLanes.length > 0) {
    reportScoutFailures(scoutRun.failedLanes);
  }
  const scoutArtists = await resolveArtistCandidates(
    sdk,
    scoutRun.findings.map(({ artistName }) => artistName),
    scoutRun.findings.length,
    [
      ...source.selectedArtists,
      ...source.selectedTracks.map(({ artist }) => artist),
    ]
  );
  const rankedArtists = uniqueResolvedArtists([
    ...scoutArtists,
    ...baselineArtists,
  ]);

  return {
    vibeBrief: generated.vibeBrief,
    rankedArtists,
    discoveryEvidence: evidenceForResolvedArtists(
      scoutRun.findings,
      rankedArtists
    ),
    failedScoutLanes: scoutRun.failedLanes,
  };
}

export async function generatePlaylistDiscovery(
  source: VibeBriefSource,
  artistsToExclude: readonly string[],
  desiredArtistCount: number,
  generate: PlaylistDiscoveryGenerator = generateStructuredObject
): Promise<{ vibeBrief: VibeBrief; artistCandidates: string[] }> {
  assertArtistCount(desiredArtistCount);
  const candidateCount =
    desiredArtistCount === 0
      ? 0
      : desiredArtistCount + ARTIST_CANDIDATE_BUFFER;
  const normalizedSource = VibeBriefSourceSchema.parse(source);
  const exclusions = uniqueArtistNames(artistsToExclude).slice(
    0,
    MAX_EXCLUDED_ARTISTS
  );
  const result = await generate({
    instructions: PLAYLIST_DISCOVERY_INSTRUCTIONS,
    prompt: buildPlaylistDiscoveryPrompt(
      normalizedSource,
      exclusions,
      candidateCount
    ),
    schema: createPlaylistDiscoveryResponseSchema(candidateCount),
  });

  return {
    vibeBrief: VibeBriefSchema.parse({
      source: normalizedSource,
      profile: result.vibeProfile,
    }),
    artistCandidates: normalizeArtistCandidates(
      result.recommendedArtists,
      normalizedSource,
      exclusions,
      candidateCount
    ),
  };
}

export function createPlaylistDiscoveryResponseSchema(candidateCount: number) {
  if (!Number.isInteger(candidateCount) || candidateCount < 0) {
    throw new RangeError("candidateCount must be a non-negative integer");
  }
  return PlaylistDiscoveryModelResponse.extend({
    recommendedArtists: z
      .array(z.string().trim().min(1).max(200))
      .length(candidateCount),
  });
}

export function buildPlaylistDiscoveryPrompt(
  source: VibeBriefSource,
  artistsToExclude: readonly string[],
  candidateCount: number
): string {
  const recommendationRequest =
    candidateCount === 0
      ? "Do not recommend any artists for this familiar-only playlist."
      : `Recommend exactly ${candidateCount} candidate artists in descending vibe-fit order.`;

  return `${recommendationRequest}

<vibe_sources>
${JSON.stringify(source)}
</vibe_sources>

<artists_to_exclude>
${artistsToExclude.join("\n")}
</artists_to_exclude>`;
}

export function normalizeArtistCandidates(
  candidates: readonly string[],
  source: VibeBriefSource,
  artistsToExclude: readonly string[],
  candidateCount: number
): string[] {
  if (candidateCount === 0) return [];
  const blocked = new Set(
    [
      ...source.selectedArtists,
      ...source.selectedTracks.map(({ artist }) => artist),
      ...artistsToExclude,
    ].map(normalizeArtistName)
  );
  const seen = new Set<string>();
  const normalized = candidates.flatMap((candidate) => {
    const trimmed = candidate.trim();
    const key = normalizeArtistName(trimmed);
    if (!key || blocked.has(key) || seen.has(key)) return [];
    seen.add(key);
    return [trimmed];
  });

  if (normalized.length !== candidateCount) {
    throw new Error(
      `Expected ${candidateCount} unique artist candidates, received ${normalized.length}`
    );
  }
  return normalized;
}

export async function resolveArtistCandidates(
  sdk: SpotifySdk,
  candidates: readonly string[],
  desiredArtistCount: number,
  blockedArtistNames: readonly string[]
): Promise<SelectedPlaylistArtist[]> {
  assertArtistCount(desiredArtistCount);
  if (desiredArtistCount === 0) return [];
  const blocked = new Set(blockedArtistNames.map(normalizeArtistName));
  const resolved = await mapWithConcurrency(
    candidates,
    ARTIST_SEARCH_CONCURRENCY,
    async (artistName) => {
      const result = await sdk.search(
        `artist:${JSON.stringify(artistName)}`.slice(0, 249),
        ["artist"],
        "US",
        10
      );
      const exactMatches = new Map(
        result.artists.items
          .filter(
            (candidate) =>
              normalizeArtistName(candidate.name) ===
              normalizeArtistName(artistName)
          )
          .map((candidate) => [candidate.id, candidate])
      );
      const artist =
        exactMatches.size === 1 ? exactMatches.values().next().value : null;
      return artist
        ? {
            artist_id: artist.id,
            artist_name: artist.name,
            images: artist.images,
          }
        : null;
    }
  );
  const seenIds = new Set<string>();

  return resolved
    .filter((artist): artist is NonNullable<typeof artist> => {
      if (
        !artist ||
        blocked.has(normalizeArtistName(artist.artist_name)) ||
        seenIds.has(artist.artist_id)
      ) {
        return false;
      }
      seenIds.add(artist.artist_id);
      return true;
    })
    .slice(0, desiredArtistCount);
}

export function normalizeArtistName(name: string): string {
  return name.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function familiarArtistNames(pool: FamiliarSongsPool | null): string[] {
  if (!pool) return [];
  return uniqueArtistNames([
    ...pool.artistCatalogs.map(({ artist_name }) => artist_name),
    ...pool.specifiedTracks.map(({ artist_name }) => artist_name ?? ""),
    ...pool.topTracks.map(({ artist_name }) => artist_name ?? ""),
    ...pool.likedTracks.map(({ artist_name }) => artist_name ?? ""),
    ...pool.recentlyPlayedTracks.map(({ artist_name }) => artist_name ?? ""),
  ]).slice(0, MAX_EXCLUDED_ARTISTS);
}

function evidenceForResolvedArtists(
  findings: readonly DiscoveryScoutFinding[],
  artists: readonly SelectedPlaylistArtist[]
): DiscoveryEvidence[] {
  const evidenceByArtist = new Map(
    findings.map((finding) => [normalizeArtistName(finding.artistName), finding])
  );
  return artists.flatMap((artist) => {
    if (!artist.artist_name) return [];
    const artistName = artist.artist_name;
    const finding = evidenceByArtist.get(normalizeArtistName(artistName));
    return finding
      ? [{ ...finding, artistId: artist.artist_id, artistName }]
      : [];
  });
}

function uniqueResolvedArtists(
  artists: readonly SelectedPlaylistArtist[]
): SelectedPlaylistArtist[] {
  const seenIds = new Set<string>();
  return artists.filter(({ artist_id }) => {
    if (seenIds.has(artist_id)) return false;
    seenIds.add(artist_id);
    return true;
  });
}

function reportDiscoveryScoutFailures(
  lanes: readonly DiscoveryScoutLane[]
): void {
  console.warn(
    `Playlist discovery continued without scout lanes: ${lanes.join(", ")}`
  );
}

function uniqueArtistNames(names: readonly string[]): string[] {
  const seen = new Set<string>();
  return names.flatMap((name) => {
    const trimmed = name.trim();
    const key = normalizeArtistName(trimmed);
    if (!key || seen.has(key)) return [];
    seen.add(key);
    return [trimmed];
  });
}

function assertArtistCount(count: number): void {
  if (!Number.isInteger(count) || count < 0 || count > 20) {
    throw new RangeError("desiredArtistCount must be between 0 and 20");
  }
}

const PLAYLIST_DISCOVERY_INSTRUCTIONS = `You are a music curator. Turn the supplied artists, tracks, and explicit instructions into one structured vibe profile, then recommend artists when requested.

Vibe rules:
- Treat selected artists and tracks as positive stylistic evidence, not automatic inclusion requirements.
- Explicit instructions are authoritative. They override any conflicting inference from the selected music.
- Describe mood, energy, tempo feel, genre boundaries, era, positive stylistic anchors, vocal character, instrumentation, production texture, negative constraints, and playlist arc.
- Keep every field concise and grounded in the supplied sources. Do not invent a user preference that the evidence does not support.

Artist rules:
- Return the exact requested number of artist names, ordered from strongest to weakest fit for the vibe profile.
- Never return an artist named in the selected music or exclusion list.
- Include a thoughtful mix of established and emerging artists when the vibe permits it.
- Prefer artists with a meaningful Spotify catalog and a distinctive, complementary sound.
- Do not return duplicates or spelling variants.
- You do not have Spotify or web-search access. Return names only; the application verifies them separately.`;
