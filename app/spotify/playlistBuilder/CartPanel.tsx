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
import { ScrollArea } from "~/shadcn/components/ui/scroll-area";
import { SheetHeader, SheetTitle } from "~/shadcn/components/ui/sheet";
import { Slider } from "~/shadcn/components/ui/slider";
import { Textarea } from "~/shadcn/components/ui/textarea";
import { NewStuffAmount } from "./playlistBuilder.types";
import { usePlaylistBuildingService } from "./usePlaylistBuildingService";

export function CartPanel() {
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

  const handleBuildPlaylist = async () => {
    setIsSubmitting(true);
    let result = await buildPlaylist().finally(() => {
      setIsSubmitting(false);
    });
    console.log("🚀 | handleBuildPlaylist= | result:", result);
  };
  useEffect(() => {
    warmup();
    return () => {
      console.log("Closing cart panel");
    };
  }, []);

  const renderArtistItem = (artist: (typeof selectedArtists)[number]) => {
    return (
      <div className="group flex items-center space-x-2 py-2 px-2 rounded-md hover:bg-gray-50">
        <Avatar className="w-8 h-8">
          <AvatarImage
            src={
              artist.images?.[0]?.url || "/placeholder.svg?height=32&width=32"
            }
            alt={artist?.artist_name || ""}
          />
          <AvatarFallback>
            {artist?.artist_name?.slice(0, 2).toUpperCase() || ""}
          </AvatarFallback>
        </Avatar>
        <span className="text-sm flex-grow">{artist.artist_name}</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => removeArtist(artist.artist_id)}
          className="opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <SheetHeader>
        <SheetTitle>Your Playlist Selection</SheetTitle>
      </SheetHeader>
      <ScrollArea className="-m-2">
        <div className="m-2">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground mt-2">
              {totalSelectedCount} items selected
            </p>
            {totalSelectedCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearSelection}
                className="ml-2 text-muted-foreground hover:text-destructive"
              >
                <X className="h-4 w-4 mr-2" />
                Clear All
              </Button>
            )}
          </div>

          <div className="flex-1 overflow-auto mt-4 mb-12 space-y-6">
            <div className="space-y-2">
              <h3 className="font-semibold">
                Artists ({selectedArtists.length})
              </h3>
              {selectedArtists.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No artists selected
                </p>
              ) : (
                selectedArtists.map((artist) => (
                  <div key={artist.artist_id}>{renderArtistItem(artist)}</div>
                ))
              )}
            </div>

            <div className="space-y-2">
              <h3 className="font-semibold">
                Tracks ({selectedTracks.length})
              </h3>
              {selectedTracks.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No tracks selected
                </p>
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
                      onClick={() => removeTrack(track.track_id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="space-y-12">
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
                  console.log("🚀 | CartPanel | value:", value);
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
                    className={`flex items-center space-x-3 space-y-0 rounded-md border py-4 hover:bg-accent cursor-pointer ${
                      formData.newStuffAmount === option.value
                        ? "border-primary"
                        : ""
                    }`}
                  >
                    <RadioGroupItem
                      checked={formData.newStuffAmount === option.value}
                      value={option.value}
                      id={option.value}
                      className="sr-only"
                    />
                    <div className="flex items-center justify-center">
                      <div className="w-6 h-6 rounded-full border flex items-center justify-center">
                        <Check
                          className={`w-5 h-5 ${
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

            <div className="space-y-4">
              <Label htmlFor="instructions">Custom Instructions</Label>
              <Textarea
                id="instructions"
                placeholder="Add any special instructions for your playlist..."
                className="min-h-[100px]"
                value={formData.customInstructions}
                onChange={(e) =>
                  updateFormData("customInstructions", e.target.value)
                }
              />
            </div>
          </div>
        </div>
      </ScrollArea>

      <Button
        className="mt-12 w-full"
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
