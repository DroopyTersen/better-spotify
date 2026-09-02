import { z } from "zod";
import type { BuildPlaylistInput } from "./playlistBuilder.types";

const Descriptor = z.string().trim().min(1).max(120);
const Note = z.string().trim().min(1).max(500);

export const VibeBriefSourceSchema = z
  .object({
    selectedArtists: z.array(Descriptor).max(25),
    selectedTracks: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(500),
          artist: z.string().trim().max(500),
        })
      )
      .max(200),
    explicitInstructions: z.string().trim().max(4_000),
  })
  .strict()
  .refine(
    ({ selectedArtists, selectedTracks, explicitInstructions }) =>
      selectedArtists.length > 0 ||
      selectedTracks.length > 0 ||
      explicitInstructions.length > 0,
    { message: "A vibe brief requires music selections or instructions" }
  );

export const VibeProfileSchema = z
  .object({
    summary: Note,
    mood: z.array(Descriptor).min(1).max(8),
    energy: z.enum(["low", "medium", "high", "dynamic"]),
    tempoFeel: Note,
    genres: z
      .object({
        include: z.array(Descriptor).max(8),
        avoid: z.array(Descriptor).max(8),
      })
      .strict(),
    era: z.array(Descriptor).max(6),
    positiveAnchors: z.array(Descriptor).min(1).max(12),
    vocals: Note,
    instrumentation: z.array(Descriptor).max(10),
    productionTexture: z.array(Descriptor).max(8),
    negativeConstraints: z.array(Descriptor).max(12),
    arc: Note,
  })
  .strict();

export const VibeBriefSchema = z
  .object({
    source: VibeBriefSourceSchema,
    profile: VibeProfileSchema,
  })
  .strict();

export type VibeBriefSource = z.infer<typeof VibeBriefSourceSchema>;
export type VibeProfile = z.infer<typeof VibeProfileSchema>;
export type VibeBrief = z.infer<typeof VibeBriefSchema>;

export function buildVibeBriefSource(
  input: BuildPlaylistInput
): VibeBriefSource {
  const pool = input.data.familiarSongsPool;
  const specifiedTrackById = new Map(
    (pool?.specifiedTracks ?? []).map((track) => [track.id, track])
  );
  const artistNameById = new Map(
    (pool?.artistCatalogs ?? []).map((catalog) => [
      catalog.artist_id,
      catalog.artist_name,
    ])
  );

  return VibeBriefSourceSchema.parse({
    selectedArtists: uniqueText(
      input.data.selectedArtists.map(
        (artist) =>
          artist.artist_name ?? artistNameById.get(artist.artist_id) ?? ""
      )
    ),
    selectedTracks: input.data.selectedTracks.flatMap((track) => {
      const canonical = specifiedTrackById.get(track.track_id);
      const name = (track.track_name ?? canonical?.name ?? "").trim();
      if (!name) return [];
      return [
        {
          name,
          artist: (track.artist_name ?? canonical?.artist_name ?? "").trim(),
        },
      ];
    }),
    explicitInstructions: input.formData.customInstructions?.trim() ?? "",
  });
}

export function formatVibeBrief(vibeBrief: VibeBrief): string {
  return JSON.stringify(VibeBriefSchema.parse(vibeBrief));
}

function uniqueText(values: readonly string[]): string[] {
  const seen = new Set<string>();
  return values.flatMap((value) => {
    const trimmed = value.trim();
    const key = trimmed.toLocaleLowerCase();
    if (!trimmed || seen.has(key)) return [];
    seen.add(key);
    return [trimmed];
  });
}
