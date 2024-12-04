import { useState } from "react";
import { useFetcher } from "react-router";
import { Button } from "~/shadcn/components/ui/button";
import { useRouteData } from "~/toolkit/remix/useRouteData";
import {
  SpotifyLikedTrack,
  SpotifyTopArtist,
  SpotifyTopTrack,
} from "../spotify.db";
import { BuildPlaylistInput } from "./playlistBuilder.types";

export const PlaylistBuilder = () => {
  let topArtists = useRouteData(
    (r) => r?.data?.topArtists
  ) as SpotifyTopArtist[];
  let fetcher = useFetcher();
  let topTracks = useRouteData((r) => r?.data?.topTracks) as SpotifyTopTrack[];
  let likedTracks = useRouteData(
    (r) => r?.data?.playHistory
  ) as SpotifyLikedTrack[];

  let allTracks = [
    ...new Map(
      [...topTracks, ...likedTracks].map((track) => [track.track_id, track])
    ).values(),
  ];
  let [selectedArtistIds, setSelectedArtistIds] = useState<string[]>([]);
  let [selectedTrackIds, setSelectedTrackIds] = useState<string[]>([]);
  let selectedTracks = selectedTrackIds.map((id) =>
    allTracks.find((t) => t.track_id === id)
  );
  let selectedArtists = selectedArtistIds.map((id) =>
    topArtists.find((a) => a.artist_id === id)
  );

  let handleBuildPlaylist = async () => {
    let input: BuildPlaylistInput = {
      topTracks: topTracks.map((t) => ({
        id: t.track_id!,
        name: t.track_name!,
        artist_id: t.artist_id!,
        artist_name: t.artist_name!,
        popularity: t.track_popularity,
      })),
      topArtists: topArtists.map((a) => ({
        id: a.artist_id!,
        name: a.artist_name!,
      })),
      likedTracks: likedTracks.map((t) => ({
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
    fetcher.submit(input, {
      method: "post",
      encType: "application/json",
      action: "/api/buildPlaylist",
    });
  };

  console.log("Fetcher data", fetcher.data);
  return (
    <div>
      <fieldset
        className="grid grid-cols-2 gap-4"
        disabled={fetcher.state !== "idle"}
      >
        <div className="col-span-1 w-full">
          <h3 className="text-sm font-bold">Top Artists</h3>
          <select
            multiple
            name="artists"
            className="border p-2 rounded h-[600px] w-full"
            onChange={(e) => {
              setSelectedArtistIds(
                Array.from(e.target.selectedOptions).map((o) => o.value)
              );
            }}
          >
            {topArtists.map((artist) => (
              <option key={artist.artist_id} value={artist.artist_id!}>
                {artist.artist_name}
              </option>
            ))}
          </select>
          <hr className="my-4" />
          {selectedArtists.map((artist) => (
            <div className="font-semibold" key={artist?.artist_id}>
              {artist?.artist_name}
            </div>
          ))}
        </div>
        <div className="col-span-1 w-full">
          <h3 className="text-sm font-bold">Top Tracks</h3>
          <select
            multiple
            name="tracks"
            className="border p-2 rounded h-[600px] w-full"
            onChange={(e) => {
              setSelectedTrackIds(
                Array.from(e.target.selectedOptions).map((o) => o.value)
              );
            }}
          >
            {allTracks.map((track) => (
              <option key={track.track_id} value={track.track_id!}>
                {track.track_name} | {track.artist_name}
              </option>
            ))}
          </select>
          <hr className="my-4" />
          {selectedTracks.map((track) => (
            <div className="font-semibold" key={track?.track_id}>
              {track?.track_name} | {track?.artist_name}
            </div>
          ))}
        </div>
      </fieldset>
      <div className="w-full text-center mt-8">
        <Button
          size="lg"
          onClick={handleBuildPlaylist}
          disabled={fetcher.state !== "idle"}
        >
          Build Playlist
        </Button>
      </div>
      {fetcher.data && (
        <div className="mt-4">
          <div>
            {fetcher.data?.playlist?.name} has{" "}
            {fetcher.data?.playlist?.tracks?.length} songs
          </div>
          <pre className="p-2 text-sm">
            {JSON.stringify(fetcher.data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};
