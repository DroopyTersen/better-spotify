import React, { createContext, useContext, useEffect, useState } from "react";
import { createSpotifySdk } from "../createSpotifySdk";
import { useCurrentUser } from "~/auth/useCurrentUser";
import { getDb } from "~/db/db.client";
import { spotifyDb, SpotifyArtistById, SpotifyTrackById } from "../spotify.db";
import { syncNewArtists, syncNewTracks } from "../sync/syncNewItems";
import usePersistedState from "~/toolkit/hooks/usePersistedState";

type PlaylistSelectionContextValue = {
  selectedArtists: SpotifyArtistById[];
  selectedTracks: SpotifyTrackById[];
  selectedArtistIds: string[];
  selectedTrackIds: string[];
  toggleArtistSelection: (id: string) => Promise<void>;
  toggleTrackSelection: (id: string) => Promise<void>;
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
  const user = useCurrentUser();
  const [selectedArtists, setSelectedArtists] = usePersistedState<
    SpotifyArtistById[]
  >([], "playlist_selection_artists");
  const [selectedTracks, setSelectedTracks] = usePersistedState<
    SpotifyTrackById[]
  >([], "playlist_selection_tracks");

  const toggleArtistSelection = async (artistId: string) => {
    if (selectedArtists.some((a) => a.artist_id === artistId)) {
      setSelectedArtists((prev) =>
        prev.filter((a) => a.artist_id !== artistId)
      );
      return;
    }

    setSelectedArtists((prev) => [
      ...prev,
      { artist_id: artistId } as SpotifyArtistById,
    ]);

    try {
      const sdk = createSpotifySdk(user?.tokens!);
      await syncNewArtists(sdk, [artistId]);

      const db = getDb();
      const [artist] = await spotifyDb.getArtistsByIds(db, [artistId]);
      if (artist) {
        setSelectedArtists((prev) =>
          prev.map((a) => (a.artist_id === artistId ? artist : a))
        );
      }
    } catch (error) {
      setSelectedArtists((prev) =>
        prev.filter((a) => a.artist_id !== artistId)
      );
    }
  };

  const toggleTrackSelection = async (trackId: string) => {
    if (selectedTracks.some((t) => t.track_id === trackId)) {
      setSelectedTracks((prev) => prev.filter((t) => t.track_id !== trackId));
      return;
    }

    setSelectedTracks((prev) => [
      ...prev,
      { track_id: trackId } as SpotifyTrackById,
    ]);

    try {
      const sdk = createSpotifySdk(user?.tokens!);
      await syncNewTracks(sdk, [trackId]);

      const db = getDb();
      const [track] = await spotifyDb.getTracksByIds(db, [trackId]);
      if (track) {
        setSelectedTracks((prev) =>
          prev.map((t) => (t.track_id === trackId ? track : t))
        );
      }
    } catch (error) {
      setSelectedTracks((prev) => prev.filter((t) => t.track_id !== trackId));
    }
  };

  const removeArtist = (id: string) => {
    setSelectedArtists((prev) => prev.filter((a) => a.artist_id !== id));
  };

  const removeTrack = (id: string) => {
    setSelectedTracks((prev) => prev.filter((t) => t.track_id !== id));
  };

  const value = {
    selectedArtists,
    selectedTracks,
    selectedArtistIds: selectedArtists.map((a) => a.artist_id),
    selectedTrackIds: selectedTracks.map((t) => t.track_id),
    toggleArtistSelection,
    toggleTrackSelection,
    removeArtist,
    removeTrack,
    totalSelectedCount: selectedArtists.length + selectedTracks.length,
  };

  return (
    <PlaylistSelectionContext.Provider value={value}>
      {children}
    </PlaylistSelectionContext.Provider>
  );
};

export function usePlaylistSelection() {
  return useContext(PlaylistSelectionContext);
}
