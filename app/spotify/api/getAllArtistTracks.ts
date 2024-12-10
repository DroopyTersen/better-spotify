import { SpotifySdk } from "../createSpotifySdk";
import { BuildPlaylistTrack } from "../playlistBuilder/playlistBuilder.types";

/**
 * Helper function to get tracks from an artist's albums
 * Gets up to 20 albums and all their tracks
 */
export async function getAllArtistTracks(
  sdk: SpotifySdk,
  artistId: string
): Promise<BuildPlaylistTrack[]> {
  const startTime = performance.now();
  const tracks: BuildPlaylistTrack[] = [];
  const limit = 10; // Number of albums to fetch

  // Get first batch of albums
  const albumsFetchStartTime = performance.now();
  const response = await sdk.artists.albums(artistId, "album", "US", limit, 0);
  console.log(
    `⏱️ Fetching albums for artist ${artistId} took: ${
      performance.now() - albumsFetchStartTime
    }ms`
  );

  // Get tracks from all albums in parallel
  const tracksStartTime = performance.now();
  const albumTrackPromises = response.items.map(async (album) =>
    sdk.albums.tracks(album.id)
  );

  const albumTracksResults = await Promise.all(albumTrackPromises);
  console.log(
    `⏱️ Fetching all album tracks for artist ${artistId} took: ${
      performance.now() - tracksStartTime
    }ms`
  );

  // Process all album tracks
  const processingStartTime = performance.now();
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
  console.log(
    `⏱️ Processing album tracks for artist ${artistId} took: ${
      performance.now() - processingStartTime
    }ms`
  );
  console.log(
    `⏱️ Total time to get all tracks for artist ${artistId}: ${
      performance.now() - startTime
    }ms`
  );

  return tracks;
}
