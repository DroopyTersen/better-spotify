import { SpotifySdk } from "../createSpotifySdk";
import { syncFullArtistData } from "./syncFullArtistData";
import { syncPlayHistory } from "./syncPlayHistory";
import { syncSavedTracks } from "./syncSavedTracks";
import { syncTopArtists } from "./syncTopArtists";
import { syncTopTracks } from "./syncTopTracks";

export const syncSpotifyData = async (sdk: SpotifySdk) => {
  await Promise.all([
    syncTopTracks(sdk),
    syncTopArtists(sdk),
    syncPlayHistory(sdk),
    syncSavedTracks(sdk),
  ]);
  await syncFullArtistData(sdk);
};
