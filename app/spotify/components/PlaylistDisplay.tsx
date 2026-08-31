import { useNavigate } from "react-router";
import dayjs from "dayjs";
import { Trash2 } from "lucide-react";
import { useCurrentUser } from "~/auth/useCurrentUser";
import { Button } from "~/shadcn/components/ui/button";
import { SpotifyApiPlaylist } from "../api/getPlaylist";
import { usePlaylistBuildingService } from "../playlistBuilder/usePlaylistBuildingService";
import { SpotifyImage } from "./SpotifyImage";
import { TrackItem } from "./TrackItem";
import { createSpotifySdk } from "../createSpotifySdk";
import { useEffect, useState } from "react";
import { PlaylistModificationForm } from "./PlaylistModificationForm";
import { EditablePlaylistName } from "./EditablePlaylistName";
import { spotifyWebApi } from "../api/spotifyWebApi";
import { hasPersistedPlaylistModification } from "../playlistBuilder/playlistModification.client";

interface PlaylistDisplayProps {
  playlist: SpotifyApiPlaylist;
  onPlaylistModified: () => void;
}

export const PlaylistDisplay = ({
  playlist,
  onPlaylistModified,
}: PlaylistDisplayProps) => {
  let currentUser = useCurrentUser();
  let navigate = useNavigate();
  const { selectedTrackIds, toggleTrackSelection } =
    usePlaylistBuildingService();
  const [showModifyForm, setShowModifyForm] = useState(false);
  const [playlistName, setPlaylistName] = useState(playlist.name);

  useEffect(() => setPlaylistName(playlist.name), [playlist.name]);

  useEffect(() => {
    let isCurrent = true;
    void hasPersistedPlaylistModification(playlist.id).then((hasJob) => {
      if (isCurrent && hasJob) setShowModifyForm(true);
    });
    return () => {
      isCurrent = false;
    };
  }, [playlist.id]);

  if (!currentUser) return null;

  const isPlaylistOwner = playlist.owner?.id === currentUser.spotifyId;
  const hasModificationAccess =
    playlist.itemsAvailability === "available" &&
    (isPlaylistOwner || playlist.collaborative);
  const canModifyPlaylist =
    hasModificationAccess && playlist.tracks.total <= 100;

  const handleDeletePlaylist = async () => {
    if (!confirm(`Remove "${playlistName}" from your Spotify library?`)) {
      return;
    }
    try {
      const sdk = createSpotifySdk(currentUser.tokens);
      await spotifyWebApi.removePlaylistFromLibrary(sdk, playlist.id);
      alert(
        "Playlist removed from your library. Sending you back to play history…"
      );
      navigate("/play-history");
    } catch {
      console.error("Failed to remove a playlist from the Spotify library");
      alert("Failed to remove the playlist. Please try again.");
    }
  };

  return (
    <div className="space-y-4 w-full max-w-[100vw] md:max-w-5xl md:mx-auto">
      <div className="flex flex-col md:flex-row md:items-center gap-4 flex-wrap">
        <div className="md:hidden">
          <EditablePlaylistName
            playlistId={playlist.id}
            name={playlistName}
            isOwner={isPlaylistOwner}
            userTokens={currentUser.tokens}
            onSaved={setPlaylistName}
          />
        </div>
        <div className="grid grid-cols-[auto_1fr_auto] gap-4 w-full">
          <SpotifyImage
            src={playlist.images[0]?.url}
            alt={playlistName}
            uri={`spotify:playlist:${playlist.id}`}
          />
          <div className="hidden md:block">
            <EditablePlaylistName
              playlistId={playlist.id}
              name={playlistName}
              isOwner={isPlaylistOwner}
              userTokens={currentUser.tokens}
              onSaved={setPlaylistName}
            />
            <div className="text-muted-foreground font-normal text-sm md:text-base md:block hidden">
              {playlist.itemsAvailability === "available"
                ? `${playlist.tracks.total} tracks`
                : "Tracks unavailable"}
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
                <span className="hidden md:block">Remove Playlist</span>
              </Button>
            </div>
          )}
        </div>
      </div>
      <div className="text-muted-foreground font-normal text-sm md:text-base md:hidden">
        {playlist.itemsAvailability === "available"
          ? `${playlist.tracks.total} tracks`
          : "Tracks unavailable"}
      </div>

      {playlist.itemsAvailability === "unavailable" && (
        <p className="rounded-md border border-border bg-muted p-4 text-sm text-muted-foreground">
          Spotify does not make this playlist&apos;s tracks available to this
          app. Only playlists you own or collaborate on can be viewed and
          modified here.
        </p>
      )}

      {hasModificationAccess && playlist.tracks.total > 100 && (
        <p className="rounded-md border border-border bg-muted p-4 text-sm text-muted-foreground">
          AI tweaking is limited to playlists with 100 tracks or fewer because
          Spotify&apos;s full-replace operation accepts at most 100 items.
        </p>
      )}

      {canModifyPlaylist && showModifyForm ? (
        <div className="my-8">
          <PlaylistModificationForm
            playlistId={playlist.id}
            snapshotId={playlist.snapshot_id}
            currentTracks={playlist.tracks.items.map((item) => ({
              id: item.track.id,
              name: item.track.name,
              artist_name: item.track.artists.map((a) => a.name).join(", "),
            }))}
            onClose={() => setShowModifyForm(false)}
            onSuccess={onPlaylistModified}
          />
        </div>
      ) : canModifyPlaylist ? (
        <Button
          variant="secondary"
          size="lg"
          onClick={() => setShowModifyForm(!showModifyForm)}
          className="w-full"
        >
          Tweak Playlist
        </Button>
      ) : null}

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
