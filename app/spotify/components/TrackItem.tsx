import { CheckIcon, Plus } from "lucide-react";
import { Badge } from "~/shadcn/components/ui/badge";
import { Button } from "~/shadcn/components/ui/button";
import { SpotifyImage } from "./SpotifyImage";
import { useCurrentUser } from "~/auth/useCurrentUser";
import { TooltipWrapper } from "~/toolkit/components/TooltipWrapper";
import { Link } from "react-router";

export function TrackItem({
  track,
  metadata,
  isSelected,
  toggleSelection,
}: {
  track: {
    track_id: string | null;
    track_name: string | null;
    artist_name: string | null;
    artist_id: string | null;
    genres?: string[] | null;
    images?: { url: string }[] | null;
  };
  metadata?: React.ReactNode | React.ReactNode[];
  isSelected?: boolean;
  toggleSelection?: (trackId: string) => void;
}) {
  let currentUser = useCurrentUser();
  return (
    <div
      key={track.track_id}
      className="grid grid-cols-[auto_1fr_auto] items-center gap-3 sm:gap-4 py-3 border-b last:border-b-0 relative group"
    >
      <SpotifyImage
        src={track.images?.[0]?.url!}
        alt={track.track_name!}
        uri={`spotify:track:${track.track_id}`}
        canPlay={currentUser?.product === "premium"}
        size={48}
      />
      <div className="flex-grow min-w-0">
        <h3 className="text-sm md:text-base font-semibold truncate">
          {track.track_name}
        </h3>{" "}
        <Link
          to={`/artists/${track.artist_id}`}
          className="text-xs sm:text-sm text-muted-foreground hover:underline block truncate"
        >
          {track.artist_name}
        </Link>
        {track?.genres?.length && track?.genres?.length > 0 && (
          <div className="mt-1 items-center space-x-2 -mx-1 hidden md:flex">
            {track?.genres
              ?.filter((g) => g && g !== "NULL")
              .slice(0, 3)
              .map((genre) => (
                <Badge variant="secondary" key={genre}>
                  {genre}
                </Badge>
              ))}
          </div>
        )}
        {/* Show metadata on mobile below the artist name */}
        {metadata && (
          <div className="block md:hidden text-xs text-muted-foreground mt-1">
            {metadata}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 sm:gap-4">
        {metadata && (
          <div className="hidden md:block text-right text-sm text-muted-foreground">
            {metadata}
          </div>
        )}
        {toggleSelection && (
          <TooltipWrapper
            tooltip={
              isSelected
                ? `${track.track_name} has been added to your new playlist.`
                : `Add ${track.track_name} to your new playlist.`
            }
          >
            <Button
              size="icon"
              onClick={() => toggleSelection?.(track.track_id!)}
              className={`rounded-full transition-opacity h-8 w-8 sm:h-10 sm:w-10 ${
                isSelected
                  ? "opacity-80 bg-primary"
                  : "opacity-40 md:opacity-0 group-hover:opacity-100"
              }`}
            >
              {isSelected ? (
                <CheckIcon className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              ) : (
                <Plus className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              )}
            </Button>
          </TooltipWrapper>
        )}
      </div>
    </div>
  );
}
