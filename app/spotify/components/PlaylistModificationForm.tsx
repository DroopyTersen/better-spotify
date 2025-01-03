import { useState } from "react";
import { Button } from "~/shadcn/components/ui/button";
import { Textarea } from "~/shadcn/components/ui/textarea";
import { useNavigate } from "react-router";

export function PlaylistModificationForm({
  playlistId,
  currentTracks,
  onClose,
}: {
  playlistId: string;
  currentTracks: Array<{
    id: string;
    name: string;
    artist_name: string;
  }>;
  onClose: () => void;
}) {
  const [instructions, setInstructions] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

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
          instructions,
          currentTracks,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to modify playlist");
      }

      // Refresh the current route to show updated playlist
      navigate(".", { replace: true });
      onClose();
    } catch (error) {
      console.error("Failed to modify playlist:", error);
      alert("Failed to modify playlist. Please try again.");
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
        className="min-h-[100px] bg-secondary text-lg"
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
