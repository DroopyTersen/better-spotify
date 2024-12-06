import { usePlaylistSelection } from "./PlaylistSelectionContext";
import { Button } from "~/shadcn/components/ui/button";
import { X } from "lucide-react";
import { Form, useSubmit } from "react-router";
import { SheetHeader, SheetTitle } from "~/shadcn/components/ui/sheet";
import { useState } from "react";
import {
  Avatar,
  AvatarImage,
  AvatarFallback,
} from "~/shadcn/components/ui/avatar";

interface SelectedArtist {
  artist_id: string | null;
  artist_name: string | null;
  images?: {
    url: string;
    width: number;
    height: number;
  }[];
}

interface SelectedTrack {
  track_id: string | null;
  track_name: string | null;
  artist_name: string | null;
  images?: {
    url: string;
    width: number;
    height: number;
  }[];
}

export function CartPanel() {
  let {
    selectedArtistIds,
    selectedTrackIds,
    removeArtist,
    removeTrack,
    totalSelectedCount,
    spotifyData,
  } = usePlaylistSelection();
  let submit = useSubmit();
  let [isSubmitting, setIsSubmitting] = useState(false);

  const selectedArtists = spotifyData.topArtists.filter((a) =>
    selectedArtistIds.includes(a.artist_id!)
  );

  const allTracks = [
    ...new Map(
      [
        ...spotifyData.topTracks,
        ...spotifyData.likedTracks,
        ...spotifyData.playHistory,
      ].map((track) => [track.track_id, track])
    ).values(),
  ];

  const selectedTracks = allTracks.filter((t) =>
    selectedTrackIds.includes(t.track_id!)
  );

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
          <h3 className="font-semibold">Artists ({selectedArtists.length})</h3>
          {selectedArtists.length === 0 ? (
            <p className="text-sm text-muted-foreground">No artists selected</p>
          ) : (
            selectedArtists.map((artist) => (
              <div
                key={artist.artist_id}
                className="group flex items-center space-x-2 py-2 px-2 rounded-md hover:bg-gray-50"
              >
                <Avatar className="w-8 h-8">
                  <AvatarImage
                    src={
                      artist.images?.[0]?.url ||
                      "/placeholder.svg?height=32&width=32"
                    }
                    alt={artist.artist_name || ""}
                  />
                  <AvatarFallback>
                    {artist.artist_name?.slice(0, 2).toUpperCase() || ""}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm flex-grow">{artist.artist_name}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeArtist(artist.artist_id!)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))
          )}
        </div>

        <div className="space-y-2">
          <h3 className="font-semibold">Tracks ({selectedTracks.length})</h3>
          {selectedTracks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tracks selected</p>
          ) : (
            selectedTracks.map((track) => (
              <div
                key={track.track_id}
                className="group flex items-center space-x-2 py-2 px-2 rounded-md hover:bg-gray-50"
              >
                <Avatar className="w-8 h-8">
                  <AvatarImage
                    src={
                      track.images?.[0]?.url ||
                      "/placeholder.svg?height=32&width=32"
                    }
                    alt={track.track_name || ""}
                  />
                  <AvatarFallback>
                    {track.track_name?.slice(0, 2).toUpperCase() || ""}
                  </AvatarFallback>
                </Avatar>
                <div className="text-sm flex-grow">
                  <div>{track.track_name}</div>
                  <div className="text-gray-500">{track.artist_name}</div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeTrack(track.track_id!)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
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
