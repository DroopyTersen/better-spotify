import { useNavigate } from "react-router";
import dayjs from "dayjs";
import { ExternalLink, Plus, Trash2 } from "lucide-react";
import { useCurrentUser } from "~/auth/useCurrentUser";
import { Button } from "~/shadcn/components/ui/button";
import { SpotifyApiPlaylist } from "../api/getPlaylist";
import { usePlaylistBuildingService } from "../playlistBuilder/usePlaylistBuildingService";
import { SpotifyImage } from "./SpotifyImage";
import { TrackItem } from "./TrackItem";
import { createSpotifySdk } from "../createSpotifySdk";
import { useState } from "react";
import { PlaylistModificationForm } from "./PlaylistModificationForm";
import { EditablePlaylistName } from "./EditablePlaylistName";

interface PlaylistDisplayProps {
  playlist: SpotifyApiPlaylist;
}

export const PlaylistDisplay = ({ playlist }: PlaylistDisplayProps) => {
  let currentUser = useCurrentUser();
  let navigate = useNavigate();
  const { selectedTrackIds, toggleTrackSelection } =
    usePlaylistBuildingService();
  const isPlaylistOwner = true;
  const [showModifyForm, setShowModifyForm] = useState(false);

  const handleDeletePlaylist = async () => {
    if (!confirm(`Are you sure you want to delete "${playlist.name}"?`)) {
      return;
    }
    try {
      const sdk = createSpotifySdk(currentUser?.tokens!);
      await sdk.currentUser.playlists.unfollow(playlist.id);
      alert(
        "Success! Playlist deleted. Sending you back to your play history..."
      );
      navigate("/play-history");
    } catch (error) {
      console.error("Failed to delete playlist:", error);
      alert("Failed to delete playlist. Please try again.");
    }
  };

  return (
    <div className="space-y-4 w-full max-w-[100vw] md:max-w-5xl md:mx-auto">
      <div className="flex flex-col md:flex-row md:items-center gap-4 flex-wrap">
        <div className="md:hidden">
          <EditablePlaylistName
            playlistId={playlist.id}
            initialName={playlist.name}
            isOwner={isPlaylistOwner}
            userTokens={currentUser?.tokens!}
          />
        </div>
        <div className="grid grid-cols-[auto_1fr_auto] gap-4 w-full">
          <SpotifyImage
            src={playlist.images[0]?.url}
            alt={playlist.name}
            uri={`spotify:playlist:${playlist.id}`}
          />
          <div className="hidden md:block">
            <EditablePlaylistName
              playlistId={playlist.id}
              initialName={playlist.name}
              isOwner={isPlaylistOwner}
              userTokens={currentUser?.tokens!}
            />
            <div className="text-muted-foreground font-normal text-sm md:text-base md:block hidden">
              {playlist.tracks.total} tracks
            </div>
          </div>
          <div className="md:hidden"></div>
          {isPlaylistOwner && (
            <div className="flex gap-2">
              <Button
                variant="destructive"
                size="sm"
                className="rounded-full"
                onClick={handleDeletePlaylist}
              >
                <Trash2 className="w-4 h-4" />
                <span className="hidden md:block">Delete Playlist</span>
              </Button>
            </div>
          )}
        </div>
      </div>
      <div className="text-muted-foreground font-normal text-sm md:text-base md:hidden">
        {playlist.tracks.total} tracks
      </div>

      {showModifyForm ? (
        <div className="my-8">
          <PlaylistModificationForm
            playlistId={playlist.id}
            currentTracks={playlist.tracks.items.map((item) => ({
              id: item.track.id,
              name: item.track.name,
              artist_name: item.track.artists.map((a) => a.name).join(", "),
            }))}
            onClose={() => setShowModifyForm(false)}
          />
        </div>
      ) : (
        <Button
          variant="secondary"
          size="lg"
          onClick={() => setShowModifyForm(!showModifyForm)}
          className="w-full"
        >
          {showModifyForm ? "Cancel Modification" : "Tweak Playlist"}
        </Button>
      )}

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
                    artist_name: track.artists[0]?.name,
                    artist_id: track.artists[0]?.id,
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
