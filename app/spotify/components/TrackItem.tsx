import { CheckIcon, Plus } from "lucide-react";
import { Badge } from "~/shadcn/components/ui/badge";
import { Button } from "~/shadcn/components/ui/button";
import { SpotifyImage } from "./SpotifyImage";
import { useCurrentUser } from "~/auth/useCurrentUser";

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
      className="grid grid-cols-[auto_1fr_auto] items-center space-x-4 py-4 border-b last:border-b-0 relative group"
    >
      <SpotifyImage
        src={track.images?.[0]?.url!}
        alt={track.track_name!}
        uri={`spotify:track:${track.track_id}`}
        canPlay={currentUser?.product === "premium"}
      />
      <div className="flex-grow">
        <h3 className="text-sm md:text-base font-semibold line-clamp-1">
          {track.track_name}
        </h3>{" "}
        <p className="text-sm text-muted-foreground">{track.artist_name}</p>
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
      </div>
      <div className="flex items-end gap-4">
        {metadata && (
          <div className="hidden md:block text-right text-sm text-muted-foreground">
            {metadata}
          </div>
        )}
        {toggleSelection && (
          <Button
            size="icon"
            onClick={() => toggleSelection?.(track.track_id!)}
            className={`rounded-full transition-opacity ${
              isSelected
                ? "opacity-80 bg-primary"
                : "opacity-20 md:opacity-0 group-hover:opacity-100"
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
