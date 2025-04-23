import { Album } from "@spotify/web-api-ts-sdk";
import { Button } from "~/shadcn/components/ui/button";
import { Plus } from "lucide-react";
import { TooltipWrapper } from "~/toolkit/components/TooltipWrapper";
import { SpotifyImage } from "./SpotifyImage";
import { Link } from "react-router";
import dayjs from "dayjs";

interface AlbumHeaderProps {
  album: Album;
  onAddAllTracks?: () => void;
}

export function AlbumHeader({ album, onAddAllTracks }: AlbumHeaderProps) {
  return (
    <div className="flex flex-col md:flex-row gap-6 items-center">
      <div className="shrink-0">
        <SpotifyImage
          src={album.images[0]?.url}
          alt={album.name}
          uri={album.uri}
          size={240}
        />
      </div>
      <div className="flex flex-col justify-end gap-4 flex-1 text-center md:text-left">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">{album.name}</h1>
          <div className="flex items-center justify-center md:justify-start gap-2 mt-2">
            <Link
              to={`/artists/${album.artists[0]?.id}`}
              className="text-base sm:text-lg hover:underline"
            >
              {album.artists[0]?.name}
            </Link>
          </div>
          <p className="text-muted-foreground mt-2 text-sm sm:text-base">
            {dayjs(album.release_date).format("YYYY")} • {album.total_tracks}{" "}
            tracks
          </p>
        </div>
        <div className="flex justify-center md:justify-start gap-4 mt-2">
          <TooltipWrapper
            tooltip={`Add all ${album.total_tracks} tracks to your playlist`}
          >
            <Button onClick={onAddAllTracks} className="gap-2">
              <Plus className="w-4 h-4" />
              Add All to Playlist
            </Button>
          </TooltipWrapper>
        </div>
      </div>
    </div>
  );
}
