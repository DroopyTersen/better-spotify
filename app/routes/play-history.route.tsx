import { LoaderFunctionArgs } from "react-router";
import dayjs from "dayjs";
import isToday from "dayjs/plugin/isToday";
import isYesterday from "dayjs/plugin/isYesterday";
import { PageHeader } from "~/layout/PageHeader";
import { getDb } from "~/db/db.client";
import { spotifyDb } from "~/spotify/spotify.db";
import { PlayHistoryItem } from "~/spotify/components/PlayHistoryItem";
import { SpotifyPlayedTrack } from "~/spotify/spotify.db";
import { TrackItem } from "~/spotify/components/TrackItem";
import { usePlaylistSelection } from "~/spotify/playlistBuilder/PlaylistSelectionContext";

// Configure dayjs plugins
dayjs.extend(isToday);
dayjs.extend(isYesterday);

export const clientLoader = async ({ request }: LoaderFunctionArgs) => {
  let db = getDb();
  let playHistory = await spotifyDb.getPlayHistory(db, { limit: 200 });
  return { playHistory };
};

// Group tracks by date
const groupTracksByDate = (tracks: SpotifyPlayedTrack[]) => {
  const groups: { [key: string]: SpotifyPlayedTrack[] } = {};

  tracks.forEach((track) => {
    const date = dayjs(track.played_at);
    let key = "";

    if (date.isToday()) {
      key = "Today";
    } else if (date.isYesterday()) {
      key = "Yesterday";
    } else if (date.isAfter(dayjs().subtract(7, "day"))) {
      key = "This Week";
    } else {
      key = date.format("MMMM D, YYYY");
    }

    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(track);
  });

  return groups;
};

export default function PlayHistoryRoute({ loaderData }: any) {
  const { playHistory } = loaderData;
  const groupedTracks = groupTracksByDate(playHistory);
  const { selectedTrackIds, toggleTrackSelection } = usePlaylistSelection();
  return (
    <>
      <PageHeader title="Play History" />
      <div className="space-y-8 max-w-4xl">
        {Object.entries(groupedTracks).map(([date, tracks]) => (
          <div key={date}>
            <div className="flex">
              <h2 className="text-lg font-semibold mb-4 relative">{date}</h2>
              <span className="relative -top-2 bg-primary text-white text-xs w-6 h-6 flex items-center justify-center rounded-full">
                {tracks.length}
              </span>
            </div>
            <div className="space-y-2">
              {tracks.map((track) => (
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
            </div>
          </div>
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
