import { SpotifySdk } from "../createSpotifySdk";
import { syncFullArtistData } from "./syncFullArtistData";
import { syncPlayHistory } from "./syncPlayHistory";
import { syncSavedTracks } from "./syncSavedTracks";
import { syncTopArtists } from "./syncTopArtists";
import { syncTopTracks } from "./syncTopTracks";

export const syncSpotifyData = async (sdk: SpotifySdk) => {
  await syncTopTracks(sdk);
  await syncTopArtists(sdk);
  await syncPlayHistory(sdk);
  // await syncPlaylists(sdk);
  await syncSavedTracks(sdk);
  await syncFullArtistData(sdk);
};
