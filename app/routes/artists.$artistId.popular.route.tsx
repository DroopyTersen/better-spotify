import { useOutletContext, useRouteLoaderData } from "react-router";
import { TrackItem } from "~/spotify/components/TrackItem";
import { usePlaylistBuildingService } from "~/spotify/playlistBuilder/usePlaylistBuildingService";
import type { loader as artistLoader } from "./artists.$artistId.route"; // Import type for parent loader
import { useRouteData } from "~/toolkit/remix/useRouteData";

export default function ArtistPopularRoute() {
  // Access data loaded by the parent '$artistId' route using its exported ID
  const { topTracks } = useOutletContext() as Awaited<
    ReturnType<typeof artistLoader>
  >;
  const { selectedTrackIds, toggleTrackSelection } =
    usePlaylistBuildingService();

  if (!topTracks) return <div>Loading popular tracks...</div>; // Or handle loading/error state

  return (
    <div className="space-y-4">
      {topTracks.slice(0, 5).map((track) => (
        <TrackItem
          key={track.id}
          track={{
            track_id: track.id,
            track_name: track.name,
            artist_name: track.artists[0]?.name,
            artist_id: track.artists[0]?.id,
            images: track.album.images,
          }}
          isSelected={selectedTrackIds.includes(track.id)}
          toggleSelection={toggleTrackSelection}
          metadata={<p>Popularity: {track.popularity}</p>}
        />
      ))}
      {topTracks.length === 0 && (
        <p className="text-muted-foreground">
          No popular tracks found for this artist.
        </p>
      )}
    </div>
  );
}
