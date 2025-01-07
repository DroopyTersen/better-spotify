import { Artist } from "@spotify/web-api-ts-sdk";
import { Button } from "~/shadcn/components/ui/button";
import { Badge } from "~/shadcn/components/ui/badge";
import { Plus, Check } from "lucide-react";
import { TooltipWrapper } from "~/toolkit/components/TooltipWrapper";

interface ArtistHeaderProps {
  artist: Artist;
  isSelected: boolean;
  onToggleSelection: () => void;
}

export function ArtistHeader({
  artist,
  isSelected,
  onToggleSelection,
}: ArtistHeaderProps) {
  return (
    <div className="flex flex-col md:flex-row gap-6 items-start md:items-center">
      <img
        src={artist.images[0]?.url}
        alt={artist.name}
        className="w-48 h-48 rounded-full object-cover"
      />

      <div className="flex-1 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">{artist.name}</h1>
          <TooltipWrapper
            tooltip={isSelected ? "Remove from playlist" : "Add to playlist"}
          >
            <Button
              onClick={onToggleSelection}
              variant={isSelected ? "default" : "secondary"}
              size="lg"
              className="mt-4"
            >
              {isSelected ? (
                <Check className="w-4 h-4 mr-2" />
              ) : (
                <Plus className="w-4 h-4 mr-2" />
              )}
              {isSelected ? "Added to Playlist" : "Add to Playlist"}
            </Button>
          </TooltipWrapper>
        </div>

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{artist.followers.total.toLocaleString()} followers</span>
          <span>•</span>
          <span>{artist.popularity}% popularity</span>
        </div>

        <div className="flex flex-wrap gap-2">
          {artist.genres.map((genre) => (
            <Badge key={genre} variant="secondary">
              {genre}
            </Badge>
          ))}
        </div>
      </div>
    </div>
  );
}
