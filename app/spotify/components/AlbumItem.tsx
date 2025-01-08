import { Link } from "react-router";
import { SpotifyImage } from "./SpotifyImage";
import { useCurrentUser } from "~/auth/useCurrentUser";
import dayjs from "dayjs";
import { Button } from "~/shadcn/components/ui/button";
import { Plus } from "lucide-react";
import { usePlaylistBuildingService } from "../playlistBuilder/usePlaylistBuildingService";
import { TooltipWrapper } from "~/toolkit/components/TooltipWrapper";
import { useState } from "react";

interface AlbumItemProps {
  album: {
    id: string;
    name: string;
    artists: Array<{ name: string; id: string }>;
    images: Array<{ url: string }>;
    release_date: string;
    total_tracks: number;
    uri: string;
  };
}

export function AlbumItem({ album }: AlbumItemProps) {
  const currentUser = useCurrentUser();
  const { addAlbumToSelection } = usePlaylistBuildingService();
  const [isAdding, setIsAdding] = useState(false);

  const handleAddAlbum = async () => {
    setIsAdding(true);
    try {
      await addAlbumToSelection(album.id);
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="group relative">
      <SpotifyImage
        src={album.images[0]?.url}
        alt={album.name}
        uri={album.uri}
        canPlay={currentUser?.product === "premium"}
        size={328}
      />
      <div className="mt-2">
        <h3 className="font-semibold truncate">{album.name}</h3>
        <Link
          to={`/artists/${album.artists[0]?.id}`}
          className="text-sm text-muted-foreground truncate hover:underline block"
        >
          {album.artists[0]?.name}
        </Link>
        <div className="text-xs text-muted-foreground mt-1">
          {dayjs(album.release_date).format("YYYY")} • {album.total_tracks}{" "}
          tracks
        </div>
      </div>
      <TooltipWrapper
        tooltip={`Add all ${album.total_tracks} tracks from ${album.name} to your playlist`}
      >
        <Button
          size="icon"
          onClick={handleAddAlbum}
          disabled={isAdding}
          className={`absolute top-2 right-2 rounded-full transition-opacity ${
            isAdding ? "opacity-50" : "opacity-0 group-hover:opacity-100"
          }`}
        >
          <Plus className="w-6 h-6" />
        </Button>
      </TooltipWrapper>
    </div>
  );
}
