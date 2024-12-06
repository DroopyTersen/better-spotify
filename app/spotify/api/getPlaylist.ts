import { SpotifyApi } from "@spotify/web-api-ts-sdk";
interface SpotifyImage {
  url: string;
  height: number;
  width: number;
}

interface SpotifyArtist {
  external_urls: {
    spotify: string;
  };
  href: string;
  id: string;
  name: string;
  type: string;
  uri: string;
}

interface SpotifyAlbum {
  href: string;
  id: string;
  images: SpotifyImage[];
  name: string;
}

export interface SpotifyPlaylistTrack {
  added_at: string;
  track: {
    album: SpotifyAlbum;
    artists: SpotifyArtist[];
    href: string;
    id: string;
    name: string;
  };
}

export interface SpotifyApiPlaylist {
  external_urls: {
    spotify: string;
  };
  id: string;
  images: SpotifyImage[];
  name: string;
  tracks: {
    total: number;
    items: SpotifyPlaylistTrack[];
  };
}

export const getPlaylist = async (sdk: SpotifyApi, playlistId: string) => {
  let fields = `name,id,external_urls,images,tracks.total,tracks.items(added_at,track(id,name,href,artists,album(id,name,href,images)))`;
  const playlist = await sdk.playlists.getPlaylist(playlistId, "US", fields);
  return playlist as SpotifyApiPlaylist;
};
