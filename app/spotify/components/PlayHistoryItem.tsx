import { Badge } from "~/shadcn/components/ui/badge";
import { RecentlyPlayedTrack } from "../api/getPlayHistory";
import { SpotifyPlayedTrack } from "../spotify.db";
import { SpotifyImage } from "./SpotifyImage";
import dayjs from "dayjs";
import { Button } from "~/shadcn/components/ui/button";
import { Plus, CheckIcon } from "lucide-react";
import { useCurrentUser } from "~/auth/useCurrentUser";

export function PlayHistoryItem({
  track,
  isSelected,
  toggleSelection,
}: {
  track: SpotifyPlayedTrack;
  isSelected?: boolean;
  toggleSelection?: (trackId: string) => void;
}) {
  let currentUser = useCurrentUser();
  return (
    <div
      key={track.track_id}
      className="flex items-center space-x-4 py-4 border-b last:border-b-0 relative group"
    >
      <SpotifyImage
        src={track.images?.[0]?.url!}
        alt={track.track_name!}
        uri={`spotify:track:${track.track_id}`}
        canPlay={currentUser?.product === "premium"}
      />
      <div className="flex-grow">
        <h3 className="font-semibold">{track.track_name}</h3>{" "}
        <p className="text-sm text-muted-foreground">{track.artist_name}</p>
        <div className="mt-1 flex items-center space-x-2">
          {track.genres?.slice(0, 3).map((genre) => (
            <Badge variant="secondary" key={genre}>
              {genre}
            </Badge>
          ))}
        </div>
      </div>
      <div className="flex items-end gap-4">
        <div className="text-right text-sm text-muted-foreground">
          <p>{dayjs(track.played_at).format("MM/DD/YYYY")}</p>
          <p>{dayjs(track.played_at).format("h:mm A")}</p>
        </div>
        {toggleSelection && (
          <Button
            size="icon"
            onClick={() => toggleSelection?.(track.track_id!)}
            className={`rounded-full transition-opacity ${
              isSelected
                ? "opacity-80 bg-primary"
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
