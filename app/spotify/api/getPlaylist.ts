import type { SpotifySdk } from "../createSpotifySdk";
import { spotifyWebApi } from "./spotifyWebApi";

/** The normalized 2026 playlist shape returned by the compatibility adapter. */
export type SpotifyApiPlaylist = Awaited<
  ReturnType<typeof spotifyWebApi.getPlaylist>
>;

export const getPlaylist = (sdk: SpotifySdk, playlistId: string) =>
  spotifyWebApi.getPlaylist(sdk, playlistId);
