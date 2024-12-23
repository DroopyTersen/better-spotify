import { z } from "zod";
import type { SpotifyImage } from "~/db/db.schema";

export const BuildPlaylistTrack = z.object({
  id: z.string(),
  name: z.string(),
  popularity: z.number().nullable().optional(),
  artist_name: z.string().nullable().optional(),
  artist_id: z.string().nullable().optional(),
});

export type BuildPlaylistTrack = z.infer<typeof BuildPlaylistTrack>;

export type SelectedPlaylistArtist = {
  artist_id: string;
  artist_name?: string;
  images?: SpotifyImage[] | null;
};

export type NewStuffAmount = "none" | "sprinkle" | "half" | "all";
export type BuildPlaylistFormData = {
  customInstructions?: string;
  newStuffAmount: NewStuffAmount;
  songCount: number;
};

export interface PlaylistBuilderData {
  // Selection state
  hashedSelection: string;
  selectedTracks: SelectedPlaylistTrack[];
  selectedArtists: SelectedPlaylistArtist[];
  // Computed results
  familiarSongsPool: FamiliarSongsPool | null;
  recommendedArtists: SelectedPlaylistArtist[];
  // Add form data
  formData?: BuildPlaylistFormData;
}

export type BuildPlaylistInput = {
  formData: BuildPlaylistFormData;
  data: Required<Omit<PlaylistBuilderData, "hashedSelection" | "formData">> & {
    formData: BuildPlaylistFormData;
  };
};

export type GeneratePlaylistInput = {
  formData: BuildPlaylistFormData;
  data: Required<Omit<PlaylistBuilderData, "hashedSelection">>;
  newSongs: BuildPlaylistTrack[];
};

export interface FamiliarSongsPool {
  specifiedTracks: BuildPlaylistTrack[];
  topTracks: BuildPlaylistTrack[];
  artistCatalogs: Array<{
    artist_id: string;
    artist_name: string;
    tracks: BuildPlaylistTrack[];
  }>;
  likedTracks: BuildPlaylistTrack[];
  recentlyPlayedTracks: BuildPlaylistTrack[];
}

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

export type SelectedPlaylistTrack = {
  track_id: string;
  track_name?: string;
  artist_id?: string | null;
  artist_name?: string | null;
  images?: SpotifyImage[] | null;
};
