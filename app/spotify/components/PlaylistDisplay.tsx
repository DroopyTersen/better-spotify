import dayjs from "dayjs";
import { CheckIcon, ExternalLink, Plus } from "lucide-react";
import { useCurrentUser } from "~/auth/useCurrentUser";
import { Button } from "~/shadcn/components/ui/button";
import { SpotifyApiPlaylist } from "../api/getPlaylist";
import { usePlaylistBuildingService } from "../playlistBuilder/usePlaylistBuildingService";
import { SpotifyImage } from "./SpotifyImage";
import { TrackItem } from "./TrackItem";

interface PlaylistDisplayProps {
  playlist: SpotifyApiPlaylist;
}

export const PlaylistDisplay = ({ playlist }: PlaylistDisplayProps) => {
  let currentUser = useCurrentUser();
  const { selectedTrackIds, toggleTrackSelection } =
    usePlaylistBuildingService();

  return (
    <div className="space-y-4 w-full max-w-[100vw] md:max-w-5xl md:mx-auto">
      <div className="flex flex-wrap gap-y-4 justify-between items-center mb-8">
        <div className="flex items-center gap-4">
          <SpotifyImage
            src={playlist.images[0]?.url}
            alt={playlist.name}
            uri={`spotify:playlist:${playlist.id}`}
            canPlay={currentUser?.product === "premium"}
          />
          <div>
            <h2 className="md:text-2xl font-bold">{playlist.name} </h2>
            <div className="text-muted-foreground font-normal text-sm md:text-base">
              {playlist.tracks.total} tracks
            </div>
          </div>
        </div>
      </div>

      <div className="divide-y">
        {playlist.tracks.items.map((item, index) => {
          const track = item?.track;
          if (!track) return null;
          const isSelected = selectedTrackIds.includes(track.id);

          return (
            <div key={track.id + index} className="flex items-center gap-4">
              <div className="w-6 h-6 text-xs md:w-8 md:h-8 flex items-center justify-center font-bold md:text-sm bg-sidebar-accent text-sidebar-accent-foreground rounded-full">
                {index + 1}
              </div>
              <div className="flex-grow">
                <TrackItem
                  track={{
                    track_id: track.id,
                    track_name: track.name,
                    artist_name: track.artists.map((a) => a.name).join(", "),
                    images: track.album.images,
                  }}
                  metadata={
                    <>
                      <p>{dayjs(item.added_at).format("MM/DD/YYYY")}</p>
                      <p>{dayjs(item.added_at).format("h:mm A")}</p>
                    </>
                  }
                  isSelected={isSelected}
                  toggleSelection={toggleTrackSelection}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
