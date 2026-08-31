import { LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "~/shadcn/components/ui/button";
import { Textarea } from "~/shadcn/components/ui/textarea";
import {
  hasPersistedPlaylistModification,
  resumePlaylistModification,
  startPlaylistModification,
} from "~/spotify/playlistBuilder/playlistModification.client";
import type { PlaylistBuildProgress } from "~/spotify/playlistBuilder/playlistBuildProgress";

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
  const [progress, setProgress] = useState<PlaylistBuildProgress | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const activeController = useRef<AbortController | null>(null);
  const onCloseRef = useRef(onClose);
  const onSuccessRef = useRef(onSuccess);

  useEffect(() => {
    onCloseRef.current = onClose;
    onSuccessRef.current = onSuccess;
  }, [onClose, onSuccess]);

  useEffect(() => {
    let cancelled = false;

    void hasPersistedPlaylistModification(playlistId).then((hasJob) => {
      if (!hasJob || cancelled || activeController.current) return;
      const controller = new AbortController();
      activeController.current = controller;
      setIsLoading(true);
      setSubmitError(null);

      void resumePlaylistModification(playlistId, {
        signal: controller.signal,
        onProgress: setProgress,
      })
        .then((result) => {
          if (!result || controller.signal.aborted) return;
          onSuccessRef.current();
          onCloseRef.current();
        })
        .catch((error) => {
          if (!controller.signal.aborted) {
            setSubmitError(getModificationError(error));
          }
        })
        .finally(() => {
          if (activeController.current !== controller) return;
          activeController.current = null;
          if (!controller.signal.aborted) {
            setIsLoading(false);
            setProgress(null);
          }
        });
    });

    return () => {
      cancelled = true;
      activeController.current?.abort();
      activeController.current = null;
    };
  }, [playlistId]);

  const handleSubmit = async () => {
    if (activeController.current) return;
    const controller = new AbortController();
    activeController.current = controller;
    setIsLoading(true);
    setSubmitError(null);
    try {
      await startPlaylistModification(
        {
          playlistId,
          snapshotId,
          instructions: instructions.trim(),
          currentTracks,
        },
        {
          signal: controller.signal,
          onProgress: setProgress,
        }
      );

      onSuccess();
      onClose();
    } catch (error) {
      if (!controller.signal.aborted) {
        setSubmitError(getModificationError(error));
      }
    } finally {
      if (activeController.current === controller) {
        activeController.current = null;
        if (!controller.signal.aborted) {
          setIsLoading(false);
          setProgress(null);
        }
      }
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
        <Button variant="outline" onClick={onClose}>
          {isLoading ? "Hide" : "Cancel"}
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={!instructions.trim() || isLoading}
        >
          {isLoading && <LoaderCircle className="h-4 w-4 animate-spin" />}
          {isLoading ? progress?.label ?? "Tweaking..." : "Modify Playlist"}
        </Button>
      </div>
      {isLoading && progress && (
        <div
          className="space-y-3 rounded-xl border bg-card p-4 shadow-sm"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center justify-between gap-4">
            <p className="font-medium">{progress.label}</p>
            <p className="text-sm tabular-nums text-muted-foreground">
              {progress.percent}%
            </p>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-secondary"
            role="progressbar"
            aria-label="Playlist tweak progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.percent}
          >
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
          <p className="text-sm text-muted-foreground">{progress.detail}</p>
          <p className="text-xs text-muted-foreground">
            You can lock your phone or leave this screen. We&apos;ll reconnect
            to this tweak when you return.
          </p>
        </div>
      )}
      {submitError && (
        <p className="text-sm text-destructive" role="alert">
          {submitError}
        </p>
      )}
    </div>
  );
}

function getModificationError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The playlist could not be tweaked. Please try again.";
}
