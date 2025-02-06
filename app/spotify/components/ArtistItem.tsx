import { Link } from "react-router";
import dayjs from "dayjs";
import { CheckIcon, Plus } from "lucide-react";
import { Badge } from "~/shadcn/components/ui/badge";
import { Button } from "~/shadcn/components/ui/button";
import { SpotifyImage } from "./SpotifyImage";
import { useCurrentUser } from "~/auth/useCurrentUser";
import { TooltipWrapper } from "~/toolkit/components/TooltipWrapper";

export function ArtistItem({
  artist,
  metadata,
  isSelected,
  toggleSelection,
}: {
  artist: {
    artist_id: string | null;
    artist_name: string | null;
    genres?: string[] | null;
    images?: { url: string }[] | null;
    play_count?: number;
  };
  metadata?: React.ReactNode | React.ReactNode[];
  isSelected?: boolean;
  toggleSelection?: (artistId: string) => void;
}) {
  let currentUser = useCurrentUser();
  return (
    <div
      key={artist.artist_id}
      className="grid grid-cols-[auto_1fr_auto] items-center gap-x-4 py-4 border-b last:border-b-0 relative group"
    >
      <SpotifyImage
        src={artist.images?.[0]?.url!}
        alt={artist.artist_name!}
        uri={`spotify:artist:${artist.artist_id}`}
      />
      <div className="flex-grow">
        <Link
          to={`/artists/${artist.artist_id}`}
          className="font-semibold text-sm md:text-base hover:underline"
        >
          {artist.artist_name}
        </Link>
        {artist.play_count && artist?.play_count > 0 ? (
          <p className="text-xs text-muted-foreground">
            {artist.play_count} Recent Plays
          </p>
        ) : null}
        {artist?.genres && artist?.genres?.length > 0 && (
          <div className="mt-1 items-center space-x-2 -mx-1 hidden md:flex">
            {artist?.genres
              ?.filter((g) => g && g !== "NULL")
              .slice(0, 3)
              .map((genre) => (
                <Badge variant="secondary" key={genre}>
                  {genre}
                </Badge>
              ))}
          </div>
        )}
      </div>
      <div className="flex items-end gap-4">
        {metadata && (
          <div className="text-right text-sm text-muted-foreground hidden md:block">
            {metadata}
          </div>
        )}
        {toggleSelection && (
          <TooltipWrapper
            tooltip={
              isSelected
                ? `${artist.artist_name} has been added to your new playlist.`
                : `Add ${artist.artist_name} to your new playlist.`
            }
          >
            <Button
              size="icon"
              onClick={() => toggleSelection?.(artist.artist_id!)}
              className={`rounded-full transition-opacity ${
                isSelected
                  ? "opacity-100 bg-primary/80 text-white"
                  : "opacity-20 md:opacity-0 group-hover:opacity-100"
              }`}
            >
              {isSelected ? (
                <CheckIcon className="w-6 h-6 text-white" />
              ) : (
                <Plus className="w-12 h-12 text-white" />
              )}
            </Button>
          </TooltipWrapper>
        )}
      </div>
    </div>
  );
}
