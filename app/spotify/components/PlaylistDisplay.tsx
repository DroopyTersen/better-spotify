import dayjs from "dayjs";
import { CheckIcon, ExternalLink, Plus } from "lucide-react";
import { useCurrentUser } from "~/auth/useCurrentUser";
import { Button } from "~/shadcn/components/ui/button";
import { SpotifyApiPlaylist } from "../api/getPlaylist";
import { usePlaylistBuildingService } from "../playlistBuilder/usePlaylistBuildingService";
import { SpotifyImage } from "./SpotifyImage";

interface PlaylistDisplayProps {
  playlist: SpotifyApiPlaylist;
}

export const PlaylistDisplay = ({ playlist }: PlaylistDisplayProps) => {
  let currentUser = useCurrentUser();
  const { selectedTrackIds, toggleTrackSelection } =
    usePlaylistBuildingService();

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <SpotifyImage
            src={playlist.images[0]?.url}
            alt={playlist.name}
            uri={`spotify:playlist:${playlist.id}`}
            canPlay={currentUser?.product === "premium"}
          />
          <div>
            <h2 className="text-2xl font-bold">{playlist.name} </h2>
            <div className="text-muted-foreground font-medium text-base">
              {playlist.tracks.total} tracks
            </div>
          </div>
        </div>
        <Button asChild variant="outline">
          <a href={"spotify:playlist:" + playlist.id}>
            Open in Spotify
            <ExternalLink className="ml-2 h-4 w-4" />
          </a>
        </Button>
      </div>

      <div className="divide-y">
        {playlist.tracks.items.map((item, index) => {
          const track = item?.track;
          if (!track) return null;
          const isSelected = selectedTrackIds.includes(track.id);

          return (
            <div
              key={track.id + index}
              className="flex items-center space-x-4 py-4 relative group"
            >
              <div className="w-8 h-8 flex items-center justify-center font-bold text-sm mr-4 text-muted-foreground bg-gray-100 rounded-full">
                {index + 1}
              </div>
              <SpotifyImage
                src={track.album.images[0]?.url}
                alt={track.name}
                uri={`spotify:track:${track.id}`}
                canPlay={currentUser?.product === "premium"}
              />
              <div className="flex-grow">
                <h3 className="font-semibold">{track.name}</h3>
                <p className="text-sm text-muted-foreground">
                  {track.artists.map((a) => a.name).join(", ")}
                </p>
              </div>
              <div className="flex items-end gap-4">
                <div className="text-right text-sm text-muted-foreground">
                  <p>{dayjs(item.added_at).format("MM/DD/YYYY")}</p>
                  <p>{dayjs(item.added_at).format("h:mm A")}</p>
                </div>
                <Button
                  size="icon"
                  onClick={() => toggleTrackSelection(track.id)}
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
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
