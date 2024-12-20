import { SpotifyImage } from "./SpotifyImage";
import { useCurrentUser } from "~/auth/useCurrentUser";
import dayjs from "dayjs";

interface AlbumItemProps {
  album: {
    id: string;
    name: string;
    artists: Array<{ name: string }>;
    images: Array<{ url: string }>;
    release_date: string;
    total_tracks: number;
    uri: string;
  };
}

export function AlbumItem({ album }: AlbumItemProps) {
  const currentUser = useCurrentUser();

  return (
    <div className="group relative">
      <SpotifyImage
        src={album.images[0]?.url}
        alt={album.name}
        uri={album.uri}
        canPlay={currentUser?.product === "premium"}
      />
      <div className="mt-2">
        <h3 className="font-semibold truncate">{album.name}</h3>
        <p className="text-sm text-muted-foreground truncate">
          {album.artists[0]?.name}
        </p>
        <div className="text-xs text-muted-foreground mt-1">
          {dayjs(album.release_date).format("YYYY")} • {album.total_tracks}{" "}
          tracks
        </div>
      </div>
    </div>
  );
}
