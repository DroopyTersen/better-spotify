import { CheckIcon, Pencil, X } from "lucide-react";
import { useState } from "react";
import { Button } from "~/shadcn/components/ui/button";
import { Input } from "~/shadcn/components/ui/input";
import { createSpotifySdk } from "../createSpotifySdk";
import { type AuthTokens } from "~/auth/auth.server";

interface EditablePlaylistNameProps {
  playlistId: string;
  name: string;
  isOwner: boolean;
  userTokens: AuthTokens;
  onSaved: (name: string) => void;
}

export const EditablePlaylistName = ({
  playlistId,
  name,
  isOwner,
  userTokens,
  onSaved,
}: EditablePlaylistNameProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState(name);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async (e?: React.FormEvent) => {
    e?.preventDefault();

    const nextName = getChangedPlaylistName(name, editedTitle);
    if (!nextName) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    try {
      const sdk = createSpotifySdk(userTokens);
      await sdk.playlists.changePlaylistDetails(playlistId, {
        name: nextName,
      });
      onSaved(nextName);
      setIsEditing(false);
    } catch {
      console.error("Failed to update playlist name");
      alert("Failed to update playlist name. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  if (isEditing) {
    return (
      <form
        onSubmit={handleSave}
        className="flex items-center gap-2 flex-1 flex-col md:flex-row"
      >
        <Input
          value={editedTitle}
          onChange={(e) => setEditedTitle(e.target.value)}
          className="md:text-xl font-bold h-auto py-1 flex-1 w-full md:w-[400px]"
          maxLength={100}
          autoFocus
          disabled={isSaving}
        />
        <div className="flex items-center gap-2">
          <Button
            size="icon"
            variant="ghost"
            type="submit"
            disabled={!editedTitle.trim() || isSaving}
          >
            <CheckIcon className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => {
              setIsEditing(false);
              setEditedTitle(name);
            }}
            disabled={isSaving}
            type="button"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <h2 className="md:text-2xl font-bold">{name}</h2>
      {isOwner && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            setEditedTitle(name);
            setIsEditing(true);
          }}
          className="h-8 w-8"
        >
          <Pencil className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
};

export function getChangedPlaylistName(
  currentName: string,
  draftName: string
): string | null {
  const normalizedName = draftName.trim();
  return normalizedName && normalizedName !== currentName
    ? normalizedName
    : null;
}
