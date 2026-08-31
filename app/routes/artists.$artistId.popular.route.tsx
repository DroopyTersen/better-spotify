import { Suspense } from "react";
import { Await } from "react-router";
import { requireAuth } from "~/auth/auth.server";
import {
  spotifyWebApi,
  type ArtistCatalogTrack,
} from "~/spotify/api/spotifyWebApi";
import { TrackItem } from "~/spotify/components/TrackItem";
import { createSpotifySdk } from "~/spotify/createSpotifySdk";
import { usePlaylistBuildingService } from "~/spotify/playlistBuilder/usePlaylistBuildingService";
import { requireSpotifyId } from "~/spotify/spotifyId";
import type { Route } from "./+types/artists.$artistId.popular.route";

export const loader = async ({ request, params }: Route.LoaderArgs) => {
  const user = await requireAuth(request);
  const artistId = requireSpotifyId(params.artistId);
  const sdk = createSpotifySdk(user.tokens);
  return {
    catalogTracks: spotifyWebApi.getArtistCatalogTracks(sdk, artistId),
  };
};

function CatalogTracksSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading catalog tracks">
      {Array.from({ length: 6 }, (_, index) => (
        <div
          key={index}
          className="grid grid-cols-[3rem_1fr] items-center gap-4 border-b py-4"
        >
          <div className="h-12 w-12 animate-pulse rounded bg-muted" />
          <div className="space-y-2">
            <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

function CatalogTracks({
  tracks,
  selectedTrackIds,
  toggleTrackSelection,
}: {
  tracks: ArtistCatalogTrack[];
  selectedTrackIds: string[];
  toggleTrackSelection: (trackId: string) => Promise<void>;
}) {
  return (
    <div className="space-y-4">
      {tracks.map((track) => (
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
      {tracks.length === 0 && (
        <p className="text-muted-foreground">
          No catalog tracks found for this artist.
        </p>
      )}
    </div>
  );
}

export default function ArtistPopularRoute({ loaderData }: Route.ComponentProps) {
  const { selectedTrackIds, toggleTrackSelection } =
    usePlaylistBuildingService();

  return (
    <Suspense fallback={<CatalogTracksSkeleton />}>
      <Await
        resolve={loaderData.catalogTracks}
        errorElement={
          <p role="alert" className="text-sm text-destructive">
            Catalog tracks could not be loaded. Please try again.
          </p>
        }
      >
        {(tracks) => (
          <CatalogTracks
            tracks={tracks}
            selectedTrackIds={selectedTrackIds}
            toggleTrackSelection={toggleTrackSelection}
          />
        )}
      </Await>
    </Suspense>
  );
}
