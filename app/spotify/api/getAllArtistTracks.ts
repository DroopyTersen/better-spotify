import { shuffleArray } from "~/toolkit/utils/shuffleArray";
import { SpotifySdk } from "../createSpotifySdk";
import { BuildPlaylistTrack } from "../playlistBuilder/playlistBuilder.types";
import { mapWithConcurrency } from "./mapWithConcurrency";
import { spotifyWebApi } from "./spotifyWebApi";

const ALBUM_TRACK_FETCH_CONCURRENCY = 3;

/**
 * Helper function to get tracks from an artist's albums
 * Gets up to 20 albums and randomly selects 5 of them to get tracks from
 */
export async function getAllArtistTracks(
  sdk: SpotifySdk,
  artistId: string,
  trackLimit = 20
): Promise<BuildPlaylistTrack[]> {
  if (!Number.isInteger(trackLimit) || trackLimit < 1 || trackLimit > 100) {
    throw new RangeError("Artist track limit must be between 1 and 100");
  }
  const tracks: BuildPlaylistTrack[] = [];
  const limit = 50; // Number of albums to fetch

  // Get first batch of albums
  const response = await sdk.artists.albums(artistId, "album", "US", limit, 0);

  // Randomly select up to 5 albums
  const albumCount = Math.min(5, response.items.length);
  const selectedAlbums = shuffleArray(response.items).slice(0, albumCount);

  // Load complete albums while keeping Spotify request fan-out bounded.
  const albumTracksResults = await mapWithConcurrency(
    selectedAlbums,
    ALBUM_TRACK_FETCH_CONCURRENCY,
    (album) => spotifyWebApi.getAlbumTracks(sdk, album.id)
  );

  // Process tracks from selected albums
  albumTracksResults.forEach((albumTracks) => {
    tracks.push(
      ...albumTracks.map(
        (track): BuildPlaylistTrack => ({
          id: track.id,
          name: track.name,
          popularity: null,
          artist_id: artistId,
          artist_name: track.artists[0]?.name ?? null,
        })
      )
    );
  });

  const seenTrackIds = new Set<string>();
  return tracks.filter(({ id }) => {
    if (seenTrackIds.has(id) || seenTrackIds.size >= trackLimit) return false;
    seenTrackIds.add(id);
    return true;
  });
}
