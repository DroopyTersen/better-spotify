import dayjs from "dayjs";
import { requireAuth } from "~/auth/auth.server";
import { initAccountDatabase } from "~/db/db.client";
import { PageHeader } from "~/layout/PageHeader";
import { TrackItem } from "~/spotify/components/TrackItem";
import { usePlaylistBuildingService } from "~/spotify/playlistBuilder/usePlaylistBuildingService";
import { spotifyDb } from "~/spotify/spotify.db";
import type { Route } from "./+types/play-history.route";
import { withOptionalLibraryDeadline } from "~/spotify/sync/librarySnapshot.client";

export const loader = async ({ request }: Route.LoaderArgs) => {
  const user = await requireAuth(request);
  return { accountId: user.id };
};

export const clientLoader = async ({ serverLoader }: Route.ClientLoaderArgs) => {
  const { accountId } = await serverLoader();
  try {
    return await withOptionalLibraryDeadline(async () => {
      const { db } = await initAccountDatabase(accountId);
      const playHistory = await spotifyDb.getPlayHistory(db, { limit: 200 });
      return { playHistory };
    });
  } catch {
    return { playHistory: [] };
  }
};
clientLoader.hydrate = true as const;

export const HydrateFallback = () => null;

export default function PlayHistoryRoute({ loaderData }: Route.ComponentProps) {
  const { playHistory } = loaderData;
  const { selectedTrackIds, toggleTrackSelection } =
    usePlaylistBuildingService();

  // Calculate the earliest date from play history
  const earliestDate =
    playHistory.length > 0
      ? dayjs(playHistory[playHistory.length - 1].played_at).format("M/D/YY")
      : null;

  const sortedPlayHistory = [...playHistory].sort((a, b) => {
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
        {sortedPlayHistory.map((track) => (
          <TrackItem
            key={track.play_id}
            track={track}
            isSelected={
              track.track_id
                ? selectedTrackIds.includes(track.track_id)
                : false
            }
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
