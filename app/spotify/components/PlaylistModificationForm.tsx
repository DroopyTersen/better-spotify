import { useState } from "react";
import { Button } from "~/shadcn/components/ui/button";
import { Textarea } from "~/shadcn/components/ui/textarea";

export function PlaylistModificationForm({
  playlistId,
  snapshotId,
  currentTracks,
  onClose,
  onSuccess,
}: {
  playlistId: string;
  snapshotId: string;
  currentTracks: Array<{
    id: string;
    name: string;
    artist_name: string;
  }>;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [instructions, setInstructions] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/modify-playlist", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          playlistId,
          snapshotId,
          instructions,
          currentTracks,
        }),
      });

      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(result?.error || "Failed to modify playlist");
      }

      onSuccess();
      onClose();
    } catch (error) {
      console.error("Failed to modify playlist");
      alert(
        error instanceof Error
          ? error.message
          : "Failed to modify playlist. Please try again."
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Textarea
        autoFocus
        placeholder="Enter modification instructions (e.g., 'add 4 songs by Everclear' or 'replace slow songs with upbeat ones')"
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
        className="min-h-[100px] bg-secondary md:text-base"
        disabled={isLoading}
      />

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose} disabled={isLoading}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={!instructions || isLoading}>
          {isLoading ? "Modifying..." : "Modify Playlist"}
        </Button>
      </div>
    </div>
  );
}
