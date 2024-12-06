import { Button } from "~/shadcn/components/ui/button";
import { Badge } from "~/shadcn/components/ui/badge";
import { CheckIcon, ExternalLink, Plus } from "lucide-react";
import { SpotifyApiPlaylist } from "../api/getPlaylist";
import { SpotifyImage } from "./TrackImage";
import dayjs from "dayjs";
import { usePlaylistSelection } from "~/playlistBuilder/PlaylistSelectionContext";

interface PlaylistDisplayProps {
  playlist: SpotifyApiPlaylist;
}

export const PlaylistDisplay = ({ playlist }: PlaylistDisplayProps) => {
  const { selectedTrackIds, toggleTrackSelection } = usePlaylistSelection();

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">
          {playlist.name}{" "}
          <span className="text-muted-foreground font-medium text-lg">
            {playlist.tracks.total} tracks
          </span>
        </h2>
        <Button asChild variant="outline">
          <a
            href={playlist.external_urls.spotify}
            target="_blank"
            rel="noopener noreferrer"
          >
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
              key={track.id}
              className="flex items-center space-x-4 py-4 relative group"
            >
              <div className="w-8 h-8 flex items-center justify-center font-bold text-sm mr-4 text-muted-foreground bg-gray-100 rounded-full">
                {index + 1}
              </div>
              <SpotifyImage
                src={track.album.images[0]?.url}
                alt={track.name}
                item_id={track.id}
                item_type="track"
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
