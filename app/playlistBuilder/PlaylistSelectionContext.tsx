import React, { createContext, useContext, useEffect, useState } from "react";

type PlaylistSelectionContextValue = {
  selectedArtistIds: string[];
  selectedTrackIds: string[];
  toggleArtistSelection: (id: string) => void;
  toggleTrackSelection: (id: string) => void;
  removeArtist: (id: string) => void;
  removeTrack: (id: string) => void;
  totalSelectedCount: number;
};

const PlaylistSelectionContext = createContext<PlaylistSelectionContextValue>(
  null!
);

export const PlaylistSelectionProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [selectedArtistIds, setSelectedArtistIds] = useState<string[]>([]);
  const [selectedTrackIds, setSelectedTrackIds] = useState<string[]>([]);

  useEffect(() => {
    let stored = localStorage.getItem("playlist_selection");
    if (stored) {
      let { selectedArtistIds, selectedTrackIds } = JSON.parse(stored);
      setSelectedArtistIds(selectedArtistIds || []);
      setSelectedTrackIds(selectedTrackIds || []);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      "playlist_selection",
      JSON.stringify({ selectedArtistIds, selectedTrackIds })
    );
  }, [selectedArtistIds, selectedTrackIds]);

  const toggleArtistSelection = (id: string) => {
    setSelectedArtistIds((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  };

  const toggleTrackSelection = (id: string) => {
    setSelectedTrackIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  };

  const removeArtist = (id: string) => {
    setSelectedArtistIds((prev) => prev.filter((a) => a !== id));
  };

  const removeTrack = (id: string) => {
    setSelectedTrackIds((prev) => prev.filter((t) => t !== id));
  };

  const totalSelectedCount = selectedArtistIds.length + selectedTrackIds.length;

  return (
    <PlaylistSelectionContext.Provider
      value={{
        selectedArtistIds,
        selectedTrackIds,
        toggleArtistSelection,
        toggleTrackSelection,
        removeArtist,
        removeTrack,
        totalSelectedCount,
      }}
    >
      {children}
    </PlaylistSelectionContext.Provider>
  );
};

export function usePlaylistSelection() {
  return useContext(PlaylistSelectionContext);
}
