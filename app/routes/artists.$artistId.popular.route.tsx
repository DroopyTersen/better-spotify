import { useOutletContext } from "react-router";
import { TrackItem } from "~/spotify/components/TrackItem";
import { usePlaylistBuildingService } from "~/spotify/playlistBuilder/usePlaylistBuildingService";
import type { loader as artistLoader } from "./artists.$artistId.route";

export default function ArtistPopularRoute() {
  const { catalogTracks } = useOutletContext() as Awaited<
    ReturnType<typeof artistLoader>
  >;
  const { selectedTrackIds, toggleTrackSelection } =
    usePlaylistBuildingService();

  if (!catalogTracks) return <div>Loading catalog tracks…</div>;

  return (
    <div className="space-y-4">
      {catalogTracks.slice(0, 10).map((track) => (
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
          metadata={<p>{track.album.name}</p>}
        />
      ))}
      {catalogTracks.length === 0 && (
        <p className="text-muted-foreground">
          No catalog tracks found for this artist.
        </p>
      )}
    </div>
  );
}
