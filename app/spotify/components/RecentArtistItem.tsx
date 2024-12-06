import dayjs from "dayjs";
import { CheckIcon, Plus } from "lucide-react";
import { Badge } from "~/shadcn/components/ui/badge";
import { Button } from "~/shadcn/components/ui/button";
import { SpotifyRecentArtist } from "../spotify.db";
import { SpotifyImage } from "./TrackImage";

export function RecentArtistItem({
  artist,
  isSelected,
  toggleSelection,
}: {
  artist: SpotifyRecentArtist;
  isSelected?: boolean;
  toggleSelection?: (artistId: string) => void;
}) {
  return (
    <div
      key={artist.artist_id}
      className="flex items-center space-x-4 py-4 border-b last:border-b-0 relative group"
    >
      <SpotifyImage
        src={artist.images?.[0]?.url!}
        alt={artist.artist_name!}
        item_id={artist.artist_id!}
        item_type="artist"
      />
      <div className="flex-grow">
        <h3 className="font-semibold">{artist.artist_name}</h3>{" "}
        <p className="text-sm text-muted-foreground">
          {artist.play_count} Recent Plays
        </p>
        <div className="mt-1 flex items-center space-x-2">
          {artist.genres?.slice(0, 3).map((genre) => (
            <Badge variant="secondary">{genre}</Badge>
          ))}
        </div>
      </div>
      <div className="flex items-end gap-4">
        <div className="text-right text-sm text-muted-foreground">
          <p>{dayjs(artist.last_played).format("MM/DD/YYYY")}</p>
          <p>{dayjs(artist.last_played).format("h:mm A")}</p>
        </div>
        {toggleSelection && (
          <Button
            size="icon"
            onClick={() => toggleSelection?.(artist.artist_id!)}
            className={`rounded-full transition-opacity ${
              isSelected
                ? "opacity-80 bg-teal-500"
                : "opacity-0 group-hover:opacity-100"
            }`}
          >
            {isSelected ? (
              <CheckIcon className="w-6 h-6 text-white" />
            ) : (
              <Plus className="w-12 h-12 text-white" />
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
