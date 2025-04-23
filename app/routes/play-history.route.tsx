import dayjs from "dayjs";
import { LoaderFunctionArgs } from "react-router";
import { getDb } from "~/db/db.client";
import { PageHeader } from "~/layout/PageHeader";
import { TrackItem } from "~/spotify/components/TrackItem";
import { usePlaylistBuildingService } from "~/spotify/playlistBuilder/usePlaylistBuildingService";
import { spotifyDb } from "~/spotify/spotify.db";
import { Route } from "./+types/play-history.route";

export const clientLoader = async ({ request }: LoaderFunctionArgs) => {
  let db = getDb();
  let playHistory = await spotifyDb.getPlayHistory(db, { limit: 200 });
  return { playHistory };
};

export default function PlayHistoryRoute({ loaderData }: Route.ComponentProps) {
  const { playHistory } = loaderData;
  const { selectedTrackIds, toggleTrackSelection } =
    usePlaylistBuildingService();

  // Calculate the earliest date from play history
  const earliestDate =
    playHistory.length > 0
      ? dayjs(playHistory[playHistory.length - 1].played_at).format("M/D/YY")
      : null;

  // Sort play history by played_at in descending order (most recent first)
  playHistory.sort((a, b) => {
    return dayjs(b.played_at).valueOf() - dayjs(a.played_at).valueOf();
  });
  return (
    <>
      <PageHeader>Play History</PageHeader>
      <div className="flex flex-col max-w-4xl mx-auto">
        {playHistory.length > 0 && (
          <p className="text-muted-foreground text-sm mb-4">
            Showing {playHistory.length} tracks since {earliestDate}
          </p>
        )}
        {playHistory.map((track) => (
          <TrackItem
            key={`${track.track_id ?? ""}-${track.played_at}`}
            track={track}
            isSelected={selectedTrackIds.includes(track.track_id!)}
            toggleSelection={toggleTrackSelection}
            metadata={
              <>
                <p>{dayjs(track.played_at).format("MM/DD/YYYY")}</p>
                <p>{dayjs(track.played_at).format("h:mm A")}</p>
              </>
            }
          />
        ))}
        {playHistory.length === 0 && (
          <div className="text-center text-gray-500 py-8">
            No play history available
          </div>
        )}
      </div>
    </>
  );
}
