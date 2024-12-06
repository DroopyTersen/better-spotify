import dayjs from "dayjs";
import { LoaderFunctionArgs } from "react-router";
import { getDb } from "~/db/db.client";
import { PageHeader } from "~/layout/PageHeader";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "~/shadcn/components/ui/tabs";
import { TrackItem } from "~/spotify/components/TrackItem";
import { usePlaylistSelection } from "~/spotify/playlistBuilder/PlaylistSelectionContext";
import type { SpotifyPlayedTrack } from "~/spotify/spotify.db";
import { spotifyDb } from "~/spotify/spotify.db";
import { Route } from "./+types/songs.route";

export const clientLoader = async ({ request }: LoaderFunctionArgs) => {
  let db = getDb();
  let [topTracks, likedTracks, playHistory] = await Promise.all([
    spotifyDb.getTopTracks(db, { limit: 300 }),
    spotifyDb.getLikedTracks(db, { limit: 200 }),
    spotifyDb.getPlayHistory(db, { limit: 200 }),
  ]);
  return { topTracks, likedTracks, playHistory };
};

export default function SongsRoute({ loaderData }: Route.ComponentProps) {
  console.log("🚀 | SongsRoute | loaderData:", loaderData);
  const { topTracks, likedTracks, playHistory } = loaderData;
  const { selectedTrackIds, toggleTrackSelection } = usePlaylistSelection();

  return (
    <>
      <PageHeader title="Songs" />
      <Tabs defaultValue="top" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="top">Top</TabsTrigger>
          <TabsTrigger value="liked">Liked</TabsTrigger>
          <TabsTrigger value="recent">Recent</TabsTrigger>
        </TabsList>
        <TabsContent value="top">
          <div className="flex flex-col">
            {topTracks.map((track) => (
              <TrackItem
                key={track.track_id}
                track={track!}
                metadata={<p>Popularity: {track.track_popularity}</p>}
                isSelected={selectedTrackIds.includes(track.track_id!)}
                toggleSelection={toggleTrackSelection}
              />
            ))}
          </div>
        </TabsContent>
        <TabsContent value="liked">
          <div className="flex flex-col">
            {likedTracks.map((track) => (
              <TrackItem
                key={track.track_id}
                track={track!}
                metadata={
                  <>
                    <p>Liked on {dayjs(track.added_at).format("M/D/YYYY")}</p>
                  </>
                }
                isSelected={selectedTrackIds.includes(track.track_id!)}
                toggleSelection={toggleTrackSelection}
              />
            ))}
          </div>
        </TabsContent>
        <TabsContent value="recent">
          <div className="flex flex-col">
            {playHistory.map((track: SpotifyPlayedTrack) => (
              <TrackItem
                key={track.track_id}
                track={track!}
                metadata={
                  <>
                    <p>{dayjs(track.played_at).format("MM/DD/YYYY")}</p>
                    <p>{dayjs(track.played_at).format("h:mm A")}</p>
                  </>
                }
                isSelected={selectedTrackIds.includes(track.track_id!)}
                toggleSelection={toggleTrackSelection}
              />
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}
