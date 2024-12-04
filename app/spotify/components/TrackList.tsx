import { Card, CardContent } from "~/shadcn/components/ui/card";
import { Plus, CheckIcon } from "lucide-react";
import { Button } from "~/shadcn/components/ui/button";

interface Track {
  track_id: string | null;
  track_name: string | null;
  artist_id: string | null;
  artist_name: string | null;
  images?:
    | {
        url: string;
        width: number;
        height: number;
      }[]
    | null;
}

interface TrackListProps {
  tracks: Track[];
  isSelected: (trackId: string) => boolean;
  toggleSelection: (trackId: string) => void;
}

export const TrackList = ({
  tracks,
  isSelected,
  toggleSelection,
}: TrackListProps) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {tracks
        .filter((t) => t.track_id)
        .map((track) => (
          <Card key={track.track_id} className="relative group">
            <CardContent className="p-4 flex items-center">
              <img
                src={
                  track.images?.[0]?.url ||
                  "/placeholder.svg?height=64&width=64"
                }
                alt={track.track_name || ""}
                className="w-16 h-16 object-cover rounded-full mr-4"
              />
              <div className="flex-grow">
                <h3 className="font-semibold truncate">{track.track_name}</h3>
                <p className="text-sm text-gray-500 truncate">
                  {track.artist_name}
                </p>
              </div>
              <Button
                size="icon"
                onClick={() => toggleSelection(track.track_id!)}
                className={`p-1 rounded-full transition-opacity ${
                  isSelected(track.track_id!)
                    ? "opacity-80 bg-teal-500"
                    : "opacity-0 group-hover:opacity-100"
                }`}
              >
                {isSelected(track.track_id!) ? (
                  <CheckIcon className="w-6 h-6 text-white" />
                ) : (
                  <Plus className="w-12 h-12 text-white" />
                )}
              </Button>
            </CardContent>
          </Card>
        ))}
    </div>
  );
};
