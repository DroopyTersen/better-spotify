import { Artist } from "@spotify/web-api-ts-sdk";
import { Button } from "~/shadcn/components/ui/button";
import { Badge } from "~/shadcn/components/ui/badge";
import { Plus, Check } from "lucide-react";
import { TooltipWrapper } from "~/toolkit/components/TooltipWrapper";
import { SpotifyImage } from "./SpotifyImage";
import { useHandledAsyncAction } from "./useHandledAsyncAction";

interface ArtistHeaderProps {
  artist: Artist;
  isSelected: boolean;
  onToggleSelection: () => Promise<void>;
}

export function ArtistHeader({
  artist,
  isSelected,
  onToggleSelection,
}: ArtistHeaderProps) {
  const followerCount = artist.followers?.total;
  const popularity = artist.popularity;
  const action = useHandledAsyncAction(
    onToggleSelection,
    `Could not update ${artist.name}. Please try again.`
  );

  return (
    <div className="flex flex-col md:flex-row gap-6 items-center">
      <SpotifyImage
        src={artist.images?.[0]?.url ?? "/spotify-logo.svg"}
        alt={artist.name}
        uri={`spotify:artist:${artist.id}`}
        size={256}
        className="rounded-full object-cover"
      />

      <div className="flex-1 space-y-4 text-center md:text-left">
        <div className="flex items-center justify-between flex-col md:flex-row gap-4">
          <h1 className="text-3xl font-bold">{artist.name}</h1>
          <TooltipWrapper
            tooltip={
              action.error ??
              (isSelected ? "Remove from playlist" : "Add to playlist")
            }
          >
            <Button
              onClick={action.run}
              disabled={action.isPending}
              aria-label={action.error ?? `Update ${artist.name} selection`}
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

        {(typeof followerCount === "number" ||
          typeof popularity === "number") && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground justify-center md:justify-start">
            {typeof followerCount === "number" && (
              <span>{followerCount.toLocaleString()} followers</span>
            )}
            {typeof followerCount === "number" &&
              typeof popularity === "number" && <span>•</span>}
            {typeof popularity === "number" && (
              <span>{popularity}% popularity</span>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2 md:-ml-2">
          {artist.genres?.map((genre) => (
            <Badge key={genre} variant="secondary">
              {genre}
            </Badge>
          ))}
        </div>
      </div>
    </div>
  );
}
