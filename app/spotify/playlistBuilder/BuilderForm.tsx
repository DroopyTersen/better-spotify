import { Check, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "~/shadcn/components/ui/avatar";
import { Button } from "~/shadcn/components/ui/button";
import { Label } from "~/shadcn/components/ui/label";
import { RadioGroup, RadioGroupItem } from "~/shadcn/components/ui/radio-group";
import { Slider } from "~/shadcn/components/ui/slider";
import { Textarea } from "~/shadcn/components/ui/textarea";
import { NewStuffAmount } from "./playlistBuilder.types";
import { usePlaylistBuildingService } from "./usePlaylistBuildingService";
import { cn } from "~/shadcn/lib/utils";
import { Link, useNavigate } from "react-router";

export function BuilderForm() {
  const {
    selectedArtists,
    selectedTracks,
    removeArtist,
    removeTrack,
    totalSelectedCount,
    warmup,
    clearSelection,
    buildPlaylist,
    formData,
    updateFormData,
  } = usePlaylistBuildingService();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();
  const handleBuildPlaylist = async () => {
    setIsSubmitting(true);
    let result = await buildPlaylist()
      .then((playlist) => {
        navigate(`/playlist/${playlist.playlist.id}`);
      })
      .finally(() => {
        setIsSubmitting(false);
      });
    console.log("🚀 | handleBuildPlaylist= | result:", result);
  };

  useEffect(() => {
    warmup();
    return () => {
      console.log("Closing builder form");
    };
  }, []);

  return (
    <div className="@container space-y-8 md:space-y-16 max-w-2xl mx-auto pb-12">
      <div className="flex justify-between gap-8 items-center">
        <p className="text-sm font-medium text-muted-foreground">
          {totalSelectedCount} items selected
        </p>
        {totalSelectedCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearSelection}
            className="hover:text-destructive-foreground hover:bg-destructive"
          >
            Clear All
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="flex-1 @lg:grid @lg:grid-cols-2 @lg:gap-12 space-y-6 @lg:space-y-0">
        <div className="space-y-2">
          <h3 className="font-semibold">Artists ({selectedArtists.length})</h3>
          {selectedArtists.length === 0 ? (
            <p className="text-sm text-muted-foreground">No artists selected</p>
          ) : (
            selectedArtists.map((artist) => (
              <SelectionItem
                key={artist.artist_id}
                name={artist.artist_name || ""}
                imageUrl={artist.images?.[0]?.url}
                itemLink={`/artists/${artist.artist_id}`}
                onRemove={() => removeArtist(artist.artist_id)}
              />
            ))
          )}
        </div>

        <div className="space-y-2">
          <h3 className="font-semibold">Tracks ({selectedTracks.length})</h3>
          {selectedTracks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tracks selected</p>
          ) : (
            selectedTracks.map((track) => (
              <SelectionItem
                key={track.track_id}
                name={track.track_name || ""}
                subText={track.artist_name || ""}
                imageUrl={track.images?.[0]?.url}
                onRemove={() => removeTrack(track.track_id)}
              />
            ))
          )}
        </div>
      </div>

      <div className="space-y-4">
        <Label htmlFor="instructions">Custom Instructions</Label>
        <Textarea
          id="instructions"
          placeholder="Add any special instructions for your playlist..."
          className="min-h-[100px] md:text-base bg-secondary"
          value={formData.customInstructions}
          onChange={(e) => updateFormData("customInstructions", e.target.value)}
        />
      </div>

      <div className="space-y-4">
        <Label htmlFor="song-count">
          Number of Songs: {formData.songCount}
        </Label>
        <Slider
          id="song-count"
          value={[formData.songCount]}
          max={100}
          min={12}
          step={1}
          className="w-full"
          onValueChange={([value]) => updateFormData("songCount", value)}
        />
      </div>

      <div className="space-y-4">
        <Label>How much new stuff?</Label>
        <RadioGroup
          value={formData.newStuffAmount}
          onValueChange={(value) => {
            updateFormData("newStuffAmount", value as NewStuffAmount);
          }}
          className="space-y-1"
        >
          {[
            {
              value: "none",
              label: "No new stuff. Stick to only what I've selected",
            },
            {
              value: "sprinkle",
              label: "Sprinkle a little new stuff in there",
            },
            { value: "half", label: "Yeah make it about 50/50" },
            {
              value: "all",
              label: "Yes, ONLY new stuff based on what I've picked out",
            },
          ].map((option) => (
            <Label
              key={option.value}
              htmlFor={option.value}
              className={`group flex items-center space-x-3 space-y-0 rounded-md border py-4 hover:bg-sidebar-accent cursor-pointer ${
                formData.newStuffAmount === option.value ? "border-primary" : ""
              }`}
            >
              <RadioGroupItem
                checked={formData.newStuffAmount === option.value}
                value={option.value}
                id={option.value}
                className="sr-only"
              />
              <div className="flex items-center justify-center">
                <div
                  className={cn(
                    "w-6 h-6 rounded-full border flex items-center justify-center group-hover:bg-primary",
                    formData.newStuffAmount === option.value
                      ? "bg-primary"
                      : "bg-transparent"
                  )}
                >
                  <Check
                    className={`w-5 h-5 text-white ${
                      formData.newStuffAmount === option.value
                        ? "block"
                        : "hidden"
                    }`}
                  />
                </div>
              </div>
              <span className="text-sm font-normal leading-5">
                {option.label}
              </span>
            </Label>
          ))}
        </RadioGroup>
      </div>

      <Button
        className="w-full"
        disabled={
          (totalSelectedCount === 0 && !formData.customInstructions) ||
          isSubmitting
        }
        onClick={handleBuildPlaylist}
      >
        {isSubmitting ? "Building..." : "Build Playlist"}
      </Button>
    </div>
  );
}

function SelectionItem({
  name,
  subText,
  imageUrl,
  itemLink,
  onRemove,
}: {
  name: string;
  subText?: string;
  imageUrl?: string;
  itemLink?: string;
  onRemove: () => void;
}) {
  return (
    <div className="group flex items-center space-x-2 py-2 px-2 rounded-md hover:bg-gray-50 dark:hover:bg-sidebar">
      <Avatar className="w-8 h-8">
        <AvatarImage
          src={imageUrl || "/placeholder.svg?height=32&width=32"}
          alt={name}
        />
        <AvatarFallback>{name?.slice(0, 2).toUpperCase() || ""}</AvatarFallback>
      </Avatar>
      <div className="text-sm flex-grow">
        {itemLink ? (
          <Link to={itemLink} className="hover:underline">
            {name}
          </Link>
        ) : (
          <div>{name}</div>
        )}
        {subText && <div className="text-gray-500">{subText}</div>}
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={onRemove}
        className="opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/50 hover:text-destructive-foreground rounded-full"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
