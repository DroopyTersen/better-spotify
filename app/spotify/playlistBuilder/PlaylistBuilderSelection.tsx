import { Button } from "~/shadcn/components/ui/button";
import { Card, CardContent } from "~/shadcn/components/ui/card";
import {
  Avatar,
  AvatarImage,
  AvatarFallback,
} from "~/shadcn/components/ui/avatar";
import { ScrollArea } from "@radix-ui/react-scroll-area";

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

interface PlaylistBuilderSelectionProps {
  selectedArtists: SelectedArtist[];
  selectedTracks: SelectedTrack[];
  onBuildPlaylist: () => void;
  isBuilding: boolean;
}

export const PlaylistBuilderSelection = ({
  selectedArtists,
  selectedTracks,
  onBuildPlaylist,
  isBuilding,
}: PlaylistBuilderSelectionProps) => {
  return (
    <Card>
      <CardContent className="p-4">
        <h2 className="text-xl font-semibold mb-4">Selected Items</h2>
        <div className="mb-4">
          <h3 className="font-semibold mb-2">
            Artists ({selectedArtists.length})
          </h3>
          <div className="mb-8">
            {selectedArtists.map((artist) => (
              <div
                key={artist.artist_id}
                className="flex items-center space-x-2 mb-2"
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
                <span className="text-sm">{artist.artist_name}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="mb-8">
          <h3 className="font-semibold mb-2">
            Tracks ({selectedTracks.length})
          </h3>
          <div>
            {selectedTracks.map((track) => (
              <div
                key={track.track_id}
                className="flex items-center space-x-2 mb-2"
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
                <span className="text-sm">
                  {track.track_name} - {track.artist_name}
                </span>
              </div>
            ))}
          </div>
        </div>
        <Button
          onClick={onBuildPlaylist}
          disabled={
            isBuilding ||
            (selectedArtists.length === 0 && selectedTracks.length === 0)
          }
          className="w-full mt-4"
        >
          {isBuilding ? "Building..." : "Build Playlist"}
        </Button>
      </CardContent>
    </Card>
  );
};
