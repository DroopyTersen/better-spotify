import { spotifyWebApi } from "../api/spotifyWebApi";
import type { SpotifySdk } from "../createSpotifySdk";
import type { BuildPlaylistTrack } from "./playlistBuilder.types";

const MAX_CATALOG_RELEASES = 10;
const MAX_CATALOG_TRACKS = 50;

type ArtistCatalogLimits = {
  releaseLimit: number;
  trackLimit: number;
};

export async function getArtistCatalogTracks(
  sdk: SpotifySdk,
  artistId: string,
  { releaseLimit, trackLimit }: ArtistCatalogLimits
): Promise<BuildPlaylistTrack[]> {
  if (
    !Number.isInteger(releaseLimit) ||
    releaseLimit < 1 ||
    releaseLimit > MAX_CATALOG_RELEASES
  ) {
    throw new RangeError(
      `Artist release limit must be between 1 and ${MAX_CATALOG_RELEASES}`
    );
  }
  if (
    !Number.isInteger(trackLimit) ||
    trackLimit < 1 ||
    trackLimit > MAX_CATALOG_TRACKS
  ) {
    throw new RangeError(
      `Artist track limit must be between 1 and ${MAX_CATALOG_TRACKS}`
    );
  }

  const tracks = await spotifyWebApi.getArtistCatalogTracks(
    sdk,
    artistId,
    releaseLimit,
    trackLimit
  );
  return tracks.map((track) => {
    const catalogArtist = track.artists.find(({ id }) => id === artistId);
    return {
      id: track.id,
      name: track.name,
      popularity: null,
      artist_id: catalogArtist?.id ?? artistId,
      artist_name: catalogArtist?.name ?? null,
      release_date: track.album.releaseDate,
      album_popularity: track.album.popularity,
      spotify_uri: track.spotifyUri,
    };
  });
}
