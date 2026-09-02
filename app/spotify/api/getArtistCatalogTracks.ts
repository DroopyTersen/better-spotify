import type { SpotifySdk } from "../createSpotifySdk";
import type { BuildPlaylistTrack } from "../playlistBuilder/playlistBuilder.types";
import { spotifyWebApi } from "./spotifyWebApi";

const MAX_CATALOG_ALBUMS = 10;

export async function getArtistCatalogTracks(
  sdk: SpotifySdk,
  artistId: string,
  trackLimit = 20
): Promise<BuildPlaylistTrack[]> {
  if (!Number.isInteger(trackLimit) || trackLimit < 1 || trackLimit > 100) {
    throw new RangeError("Artist track limit must be between 1 and 100");
  }

  const tracks = await spotifyWebApi.getArtistCatalogTracks(
    sdk,
    artistId,
    MAX_CATALOG_ALBUMS,
    trackLimit
  );
  return tracks.map((track) => ({
    id: track.id,
    name: track.name,
    popularity: track.album.popularity,
    artist_id: track.artists[0]?.id ?? artistId,
    artist_name: track.artists[0]?.name ?? null,
    release_date: track.album.releaseDate,
    spotify_uri: track.spotifyUri,
    external_url: track.externalUrl,
  }));
}
