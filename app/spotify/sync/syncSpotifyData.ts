import { SpotifySdk } from "../createSpotifySdk";
import { syncFullArtistData } from "./syncFullArtistData";
import { syncPlayHistory } from "./syncPlayHistory";
import { syncPlaylists } from "./syncPlaylists";
import { syncTopArtists } from "./syncTopArtists";
import { syncTopTracks } from "./syncTopTracks";

export const syncSpotifyData = async (sdk: SpotifySdk) => {
  await syncTopTracks(sdk);
  await syncTopArtists(sdk);
  await syncPlayHistory(sdk);
  await syncPlaylists(sdk);
  await syncFullArtistData(sdk);
};