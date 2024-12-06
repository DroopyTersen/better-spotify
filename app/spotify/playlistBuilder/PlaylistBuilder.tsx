import { useState } from "react";
import { useFetcher } from "react-router";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "~/shadcn/components/ui/tabs";

import {
  SpotifyLikedTrack,
  SpotifyPlayedTrack,
  SpotifyRecentArtist,
  SpotifyTopArtist,
  SpotifyTopTrack,
} from "../spotify.db";
import { useRouteData } from "~/toolkit/remix/useRouteData";
import { ArtistList } from "../components/ArtistList";
import { TrackList } from "../components/TrackList";
import { PlaylistBuilderSelection } from "./PlaylistBuilderSelection";
import { BuildPlaylistInput } from "./playlistBuilder.types";
import type { BuildPlaylistOutput } from "./buildPlaylist.server";
import { PlaylistDisplay } from "../components/PlaylistDisplay";
import { PlayHistoryItem } from "../components/PlayHistoryItem";
import { RecentArtistItem } from "../components/RecentArtistItem";

export const PlaylistBuilder = () => {
  const spotifyData = useSpotifyData();
  const fetcher = useFetcher<BuildPlaylistOutput>();
  const [selectedArtistIds, setSelectedArtistIds] = useState<string[]>([]);
  const [selectedTrackIds, setSelectedTrackIds] = useState<string[]>([]);

  const allTracks = [
    ...new Map(
      [
        ...spotifyData.topTracks,
        ...spotifyData.likedTracks,
        ...spotifyData.playHistory,
      ].map((track) => [track.track_id, track])
    ).values(),
  ];

  const handleBuildPlaylist = async () => {
    const input = await getBuildPlaylistInput(spotifyData, {
      selectedArtistIds,
      selectedTrackIds,
    });
    fetcher.submit(input, {
      method: "post",
      encType: "application/json",
      action: "/api/buildPlaylist",
    });
  };

  const isArtistSelected = (artistId: string) =>
    selectedArtistIds.includes(artistId);
  const isTrackSelected = (trackId: string) =>
    selectedTrackIds.includes(trackId);

  const toggleArtistSelection = (artistId: string) => {
    setSelectedArtistIds((prev) =>
      prev.includes(artistId)
        ? prev.filter((id) => id !== artistId)
        : [...prev, artistId]
    );
  };

  const toggleTrackSelection = (trackId: string) => {
    setSelectedTrackIds((prev) =>
      prev.includes(trackId)
        ? prev.filter((id) => id !== trackId)
        : [...prev, trackId]
    );
  };

  const handleRemoveArtist = (artistId: string) => {
    setSelectedArtistIds((prev) => prev.filter((id) => id !== artistId));
  };

  const handleRemoveTrack = (trackId: string) => {
    setSelectedTrackIds((prev) => prev.filter((id) => id !== trackId));
  };

  console.log(
    "spotifyData.playHistory",
    JSON.stringify(spotifyData.playHistory[0], null, 2)
  );
  return (
    <div className="">
      {!fetcher?.data && (
        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2">
            <Tabs defaultValue="topArtists">
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="topArtists">Top Artists</TabsTrigger>
                <TabsTrigger value="topTracks">Top Tracks</TabsTrigger>
                <TabsTrigger value="likedTracks">Liked Tracks</TabsTrigger>
                <TabsTrigger value="playHistory">Recent Tracks</TabsTrigger>
                <TabsTrigger value="recentArtists">Recent Artists</TabsTrigger>
              </TabsList>
              <TabsContent value="topArtists">
                <ArtistList
                  artists={spotifyData.topArtists}
                  isSelected={isArtistSelected}
                  toggleSelection={toggleArtistSelection}
                />
              </TabsContent>
              <TabsContent value="topTracks">
                <TrackList
                  tracks={spotifyData.topTracks}
                  isSelected={isTrackSelected}
                  toggleSelection={toggleTrackSelection}
                />
              </TabsContent>
              <TabsContent value="likedTracks">
                <TrackList
                  tracks={spotifyData.likedTracks}
                  isSelected={isTrackSelected}
                  toggleSelection={toggleTrackSelection}
                />
              </TabsContent>
              <TabsContent value="playHistory">
                <div className="flex flex-col">
                  {spotifyData.playHistory.map((track) => (
                    <PlayHistoryItem
                      track={track}
                      isSelected={isTrackSelected(track.track_id!)}
                      toggleSelection={toggleTrackSelection}
                    />
                  ))}
                </div>
                {/* <TrackList
                  tracks={spotifyData.playHistory}
                  isSelected={isTrackSelected}
                  toggleSelection={toggleTrackSelection}
                /> */}
              </TabsContent>
              <TabsContent value="recentArtists">
                {spotifyData.recentArtists.map((artist) => (
                  <RecentArtistItem
                    artist={artist}
                    isSelected={isArtistSelected(artist.artist_id!)}
                    toggleSelection={toggleArtistSelection}
                  />
                ))}
              </TabsContent>
            </Tabs>
          </div>
          <div>
            <PlaylistBuilderSelection
              selectedArtists={
                spotifyData.topArtists.filter((a) =>
                  selectedArtistIds.includes(a.artist_id!)
                ) as any
              }
              selectedTracks={
                allTracks.filter((t) =>
                  selectedTrackIds.includes(t.track_id!)
                ) as any
              }
              onBuildPlaylist={handleBuildPlaylist}
              isBuilding={fetcher.state !== "idle"}
              onRemoveArtist={handleRemoveArtist}
              onRemoveTrack={handleRemoveTrack}
            />
          </div>
        </div>
      )}
      {fetcher.data && <PlaylistDisplay playlist={fetcher.data.playlist} />}
    </div>
  );
};

const useSpotifyData = () => {
  let topArtists = useRouteData(
    (r) => r?.data?.topArtists
  ) as SpotifyTopArtist[];
  let topTracks = useRouteData((r) => r?.data?.topTracks) as SpotifyTopTrack[];
  let playHistory = useRouteData(
    (r) => r?.data?.playHistory
  ) as SpotifyPlayedTrack[];
  let likedTracks = useRouteData(
    (r) => r?.data?.likedTracks
  ) as SpotifyLikedTrack[];
  let recentArtists = useRouteData(
    (r) => r?.data?.recentArtists
  ) as SpotifyRecentArtist[];

  return {
    topArtists,
    topTracks,
    playHistory,
    likedTracks,
    recentArtists,
  };
};

const getBuildPlaylistInput = async (
  spotifyData: ReturnType<typeof useSpotifyData>,
  {
    selectedArtistIds,
    selectedTrackIds,
  }: {
    selectedArtistIds: string[];
    selectedTrackIds: string[];
  }
) => {
  let input: BuildPlaylistInput = {
    topTracks: spotifyData.topTracks.map((t) => ({
      id: t.track_id!,
      name: t.track_name!,
      artist_id: t.artist_id!,
      artist_name: t.artist_name!,
      popularity: t.track_popularity,
    })),
    topArtists: spotifyData.topArtists.map((a) => ({
      id: a.artist_id!,
      name: a.artist_name!,
    })),
    playHistory: spotifyData.playHistory.map((t) => ({
      id: t.track_id!,
      name: t.track_name!,
      artist_id: t.artist_id!,
      artist_name: t.artist_name!,
      popularity: t.track_popularity,
    })),
    likedTracks: spotifyData.likedTracks.map((t) => ({
      id: t.track_id!,
      name: t.track_name!,
      artist_id: t.artist_id!,
      artist_name: t.artist_name!,
      popularity: t.track_popularity,
    })),
    request: {
      artistIds: selectedArtistIds,
      trackIds: selectedTrackIds,
      numSongs: 32,
    },
  };
  return input;
};
