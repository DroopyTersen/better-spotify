import { Card, CardContent } from "~/shadcn/components/ui/card";
import { Plus, CheckIcon } from "lucide-react";
import { Button } from "~/shadcn/components/ui/button";
import { Badge } from "~/shadcn/components/ui/badge";

interface Artist {
  artist_id: string | null;
  artist_name: string | null;
  genres: string[] | null;
  images?:
    | {
        url: string;
        width: number;
        height: number;
      }[]
    | null;
}

interface ArtistListProps {
  artists: Artist[];
  isSelected: (artistId: string) => boolean;
  toggleSelection: (artistId: string) => void;
}

export const ArtistList = ({
  artists,
  isSelected,
  toggleSelection,
}: ArtistListProps) => {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
      {artists
        .filter((a) => a.artist_id)
        .map((artist) => (
          <Card key={artist.artist_id} className="relative group p-0">
            <img
              src={
                artist.images?.[0]?.url ||
                "/placeholder.svg?height=160&width=160"
              }
              alt={artist.artist_name || ""}
              className="w-full object-cover rounded-t-md h-52"
            />
            <CardContent className="p-4">
              <h3 className="font-semibold truncate mb-2">
                {artist.artist_name}
              </h3>
              <Badge variant={"secondary"} className="text-sm ">
                {artist.genres?.[0] || ""}
              </Badge>
              <Button
                size="icon"
                onClick={() => toggleSelection(artist.artist_id!)}
                className={`absolute top-2 right-2 p-1 rounded-full transition-opacity ${
                  isSelected(artist.artist_id!)
                    ? "opacity-80 bg-teal-500"
                    : "opacity-0 group-hover:opacity-100"
                }`}
              >
                {isSelected(artist.artist_id!) ? (
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
