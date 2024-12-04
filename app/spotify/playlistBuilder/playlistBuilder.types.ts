import { z } from "zod";

export const PlaylistBuilderRequest = z.object({
  numSongs: z.number().optional().default(30),
  /** Artists to include in the playlist */
  artistIds: z.array(z.string()),
  trackIds: z.array(z.string()),
  instructions: z.string().optional(),
  deepCutsRatio: z
    .number()
    .optional()
    .describe("Ratio of deep cuts vs familiar liked and popular tracks"),
  newArtistsRatio: z
    .number()
    .optional()
    .describe("Ratio of new artists vs top artists"),
});

export type BuildPlaylistInput = z.infer<typeof BuildPlaylistInput>;

export interface SongDistribution {
  numFamiliarSongs: number;
  numNewSongs: number;
}

export const BuildPlaylistTrack = z.object({
  id: z.string(),
  name: z.string(),
  popularity: z.number().nullable().optional(),
  artist_name: z.string().nullable(),
  artist_id: z.string().nullable(),
});

export type BuildPlaylistTrack = z.infer<typeof BuildPlaylistTrack>;

export interface FamiliarSongsPool {
  specifiedTracks: BuildPlaylistTrack[];
  topTracks: BuildPlaylistTrack[];
  artistCatalogs: Record<string, BuildPlaylistTrack[]>;
  likedTracks: BuildPlaylistTrack[];
}

export const BuildPlaylistInput = z.object({
  topTracks: z.array(BuildPlaylistTrack),
  likedTracks: z.array(BuildPlaylistTrack),
  topArtists: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
    })
  ),
  request: PlaylistBuilderRequest,
});

export type GeneratePlaylistInput = {
  request: PlaylistBuilderRequest;
  familiarOptions: FamiliarSongsPool;
  distribution: SongDistribution;
  newOptions: NewSongsPool;
};
export type NewSongsPool = BuildPlaylistTrack[];

export interface LLMCurationResponse {
  thought: string;
  playlist: {
    name: string;
    trackIds: string[];
  };
}

export const DEFAULT_PLAYLIST_BUILDER_REQUEST = {
  artistIds: [],
  trackIds: [],
  numSongs: 32,
  deepCutsRatio: 0.3,
  newArtistsRatio: 0.2,
  instructions: "",
} satisfies PlaylistBuilderRequest;

export type PlaylistBuilderRequest = z.infer<typeof PlaylistBuilderRequest>;
