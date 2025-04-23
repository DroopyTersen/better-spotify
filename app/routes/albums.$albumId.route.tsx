import { LoaderFunctionArgs, useLoaderData } from "react-router";
import { requireAuth } from "~/auth/auth.server";
import { PageHeader } from "~/layout/PageHeader";
import { AlbumHeader } from "~/spotify/components/AlbumHeader";
import { TrackItem } from "~/spotify/components/TrackItem";
import { createSpotifySdk } from "~/spotify/createSpotifySdk";
import { usePlaylistBuildingService } from "~/spotify/playlistBuilder/usePlaylistBuildingService";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  let user = await requireAuth(request);
  const { albumId } = params;
  if (!albumId) throw new Error("Album ID is required");

  const sdk = createSpotifySdk(user.tokens);
  const album = await sdk.albums.get(albumId);

  return { album };
};

export default function AlbumRoute() {
  const { album } = useLoaderData<typeof loader>();
  const { selectedTrackIds, toggleTrackSelection, addAlbumToSelection } =
    usePlaylistBuildingService();

  if (!album) return null;

  return (
    <div className="">
      <PageHeader>{album.name}</PageHeader>
      <div className="max-w-5xl mx-auto space-y-6">
        <AlbumHeader
          album={album}
          onAddAllTracks={() => addAlbumToSelection(album.id)}
        />

        <div className="space-y-4">
          {album.tracks.items.map((track) => (
            <TrackItem
              key={track.id}
              track={{
                track_id: track.id,
                track_name: track.name,
                artist_name: track.artists[0]?.name,
                artist_id: track.artists[0]?.id,
                images: album.images,
              }}
              isSelected={selectedTrackIds.includes(track.id)}
              toggleSelection={toggleTrackSelection}
              metadata={
                <p>
                  Track {track.track_number} •{" "}
                  {Math.floor(track.duration_ms / 60000)}:
                  {String(
                    Math.floor((track.duration_ms % 60000) / 1000)
                  ).padStart(2, "0")}
                </p>
              }
            />
          ))}
        </div>
      </div>
    </div>
  );
}
