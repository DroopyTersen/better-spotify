import { z } from "zod";

const MAX_TEXT_LENGTH = 500;
const MAX_INSTRUCTIONS_LENGTH = 4_000;
const MAX_FAMILIAR_TRACKS = 1_500;

const SpotifyId = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9]+$/);
const DisplayText = z.string().trim().min(1).max(MAX_TEXT_LENGTH);
const OptionalDisplayText = z.string().trim().max(MAX_TEXT_LENGTH).optional();

const BuildPlaylistFormDataSchema = z.object({
  customInstructions: z.string().trim().max(MAX_INSTRUCTIONS_LENGTH).optional(),
  newStuffAmount: z.enum(["none", "sprinkle", "half", "all"]),
  songCount: z.number().int().min(1).max(100),
});

const BuildPlaylistTrackSchema = z.object({
  id: SpotifyId,
  name: DisplayText,
  popularity: z.number().int().min(0).max(100).nullable().optional(),
  artist_name: z.string().trim().max(MAX_TEXT_LENGTH).nullable().optional(),
  artist_id: SpotifyId.nullable().optional(),
});

const SelectedTrackSchema = z.object({
  track_id: SpotifyId,
  track_name: OptionalDisplayText,
  artist_id: SpotifyId.nullable().optional(),
  artist_name: z.string().trim().max(MAX_TEXT_LENGTH).nullable().optional(),
});

const SelectedArtistSchema = z.object({
  artist_id: SpotifyId,
  artist_name: OptionalDisplayText,
});

const FamiliarSongsPoolSchema = z.object({
  specifiedTracks: z.array(BuildPlaylistTrackSchema).max(200),
  topTracks: z.array(BuildPlaylistTrackSchema).max(250),
  artistCatalogs: z
    .array(
      z.object({
        artist_id: SpotifyId,
        artist_name: z.string().trim().max(MAX_TEXT_LENGTH),
        tracks: z.array(BuildPlaylistTrackSchema).max(100),
      })
    )
    .max(25),
  likedTracks: z.array(BuildPlaylistTrackSchema).max(250),
  recentlyPlayedTracks: z.array(BuildPlaylistTrackSchema).max(250),
});

export const BuildPlaylistRequestSchema = z
  .object({
    formData: BuildPlaylistFormDataSchema,
    data: z.object({
      selectedTracks: z.array(SelectedTrackSchema).max(200),
      selectedArtists: z.array(SelectedArtistSchema).max(25),
      familiarSongsPool: FamiliarSongsPoolSchema.nullable(),
      recommendedArtists: z.array(SelectedArtistSchema).max(20),
      formData: BuildPlaylistFormDataSchema,
    }),
  })
  .superRefine((input, context) => {
    const pool = input.data.familiarSongsPool;
    if (!pool) return;

    const trackCount =
      pool.specifiedTracks.length +
      pool.topTracks.length +
      pool.likedTracks.length +
      pool.recentlyPlayedTracks.length +
      pool.artistCatalogs.reduce(
        (total, catalog) => total + catalog.tracks.length,
        0
      );
    if (trackCount > MAX_FAMILIAR_TRACKS) {
      context.addIssue({
        code: "custom",
        message: "Familiar track pool is too large",
        path: ["data", "familiarSongsPool"],
      });
    }
  })
  .transform((input) => ({
    ...input,
    data: { ...input.data, formData: input.formData },
  }));

export const StartPlaylistBuildRequestSchema = z.object({
  jobId: z.uuid(),
  input: BuildPlaylistRequestSchema,
});

export const PlaylistModificationRequestSchema = z.object({
  playlistId: SpotifyId,
  snapshotId: z.string().trim().min(1).max(512),
  instructions: z.string().trim().min(1).max(MAX_INSTRUCTIONS_LENGTH),
  currentTracks: z
    .array(
      z.object({
        id: SpotifyId,
        name: DisplayText,
        artist_name: DisplayText,
      })
    )
    .max(100),
});

export const ArtistRecommendationRequestSchema = z.object({
  artistsToMatch: z.array(z.string().trim().min(1).max(200)).min(1).max(250),
  artistsToExclude: z.array(z.string().trim().min(1).max(200)).max(500),
  customInstructions: z.string().trim().max(MAX_INSTRUCTIONS_LENGTH).optional(),
  desiredArtistCount: z.number().int().min(1).max(20),
});
