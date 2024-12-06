import { usePlaylistSelection } from "./PlaylistSelectionContext";
import { Button } from "~/shadcn/components/ui/button";
import { X } from "lucide-react";
import { Form, useSubmit } from "react-router";
import { SheetHeader, SheetTitle } from "~/shadcn/components/ui/sheet";
import { useState } from "react";

export function CartPanel() {
  let {
    selectedArtistIds,
    selectedTrackIds,
    removeArtist,
    removeTrack,
    totalSelectedCount,
  } = usePlaylistSelection();
  let submit = useSubmit();
  let [isSubmitting, setIsSubmitting] = useState(false);

  const handleBuildPlaylist = async () => {
    setIsSubmitting(true);
    let input = {
      topTracks: [],
      likedTracks: [],
      playHistory: [],
      topArtists: [],
      request: {
        artistIds: selectedArtistIds,
        trackIds: selectedTrackIds,
        numSongs: 32,
      },
    };
    submit(JSON.stringify(input), {
      method: "post",
      action: "/api/buildPlaylist",
      encType: "application/json",
    });
  };

  return (
    <div className="flex flex-col h-full">
      <SheetHeader>
        <SheetTitle>Your Playlist Selection</SheetTitle>
      </SheetHeader>

      <p className="text-sm text-muted-foreground mt-2">
        {totalSelectedCount} items selected
      </p>

      <div className="flex-1 overflow-auto mt-4 space-y-6">
        <div className="space-y-2">
          <h3 className="font-semibold">Artists</h3>
          {selectedArtistIds.length === 0 ? (
            <p className="text-sm text-muted-foreground">No artists selected</p>
          ) : (
            selectedArtistIds.map((artistId) => (
              <div
                key={artistId}
                className="flex items-center justify-between py-2 px-2 rounded-md hover:bg-gray-50"
              >
                <span className="text-sm">{artistId}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeArtist(artistId)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))
          )}
        </div>

        <div className="space-y-2">
          <h3 className="font-semibold">Tracks</h3>
          {selectedTrackIds.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tracks selected</p>
          ) : (
            selectedTrackIds.map((trackId) => (
              <div
                key={trackId}
                className="flex items-center justify-between py-2 px-2 rounded-md hover:bg-gray-50"
              >
                <span className="text-sm">{trackId}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeTrack(trackId)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))
          )}
        </div>
      </div>

      <Button
        className="mt-4 w-full"
        disabled={totalSelectedCount === 0 || isSubmitting}
        onClick={handleBuildPlaylist}
      >
        {isSubmitting ? "Building..." : "Build Playlist"}
      </Button>
    </div>
  );
}
