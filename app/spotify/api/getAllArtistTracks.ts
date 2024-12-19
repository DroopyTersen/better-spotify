import { shuffleArray } from "~/toolkit/utils/shuffleArray";
import { SpotifySdk } from "../createSpotifySdk";
import { BuildPlaylistTrack } from "../playlistBuilder/playlistBuilder.types";

/**
 * Helper function to get tracks from an artist's albums
 * Gets up to 20 albums and randomly selects 5 of them to get tracks from
 */
export async function getAllArtistTracks(
  sdk: SpotifySdk,
  artistId: string
): Promise<BuildPlaylistTrack[]> {
  const startTime = performance.now();
  const tracks: BuildPlaylistTrack[] = [];
  const limit = 50; // Number of albums to fetch

  // Get first batch of albums
  const response = await sdk.artists.albums(artistId, "album", "US", limit, 0);

  // Randomly select up to 5 albums
  // Randomly select up to 5 albums
  const albumCount = Math.min(5, response.items.length);
  const selectedAlbums = shuffleArray(response.items).slice(0, albumCount);

  // Get tracks from selected albums in parallel
  const albumTrackPromises = selectedAlbums.map(async (album) =>
    sdk.albums.tracks(album.id)
  );

  const albumTracksResults = await Promise.all(albumTrackPromises);

  // Process tracks from selected albums
  albumTracksResults.forEach((albumTracks) => {
    tracks.push(
      ...albumTracks.items.map(
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

  return tracks;
}
