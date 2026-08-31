import { LoaderFunctionArgs, useLoaderData, Link } from "react-router";
import { requireAuth } from "~/auth/auth.server";
import { PageHeader } from "~/layout/PageHeader";
import { AlbumHeader } from "~/spotify/components/AlbumHeader";
import { TrackItem } from "~/spotify/components/TrackItem";
import { createSpotifySdk } from "~/spotify/createSpotifySdk";
import { usePlaylistBuildingService } from "~/spotify/playlistBuilder/usePlaylistBuildingService";
import { requireSpotifyId } from "~/spotify/spotifyId";
import { spotifyWebApi } from "~/spotify/api/spotifyWebApi";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  let user = await requireAuth(request);
  const albumId = requireSpotifyId(params.albumId);

  const sdk = createSpotifySdk(user.tokens);
  const [album, tracks] = await Promise.all([
    sdk.albums.get(albumId),
    spotifyWebApi.getAlbumTracks(sdk, albumId),
  ]);

  return { album, tracks };
};

export default function AlbumRoute() {
  const { album, tracks } = useLoaderData<typeof loader>();
  const { selectedTrackIds, toggleTrackSelection, addAlbumToSelection } =
    usePlaylistBuildingService();

  if (!album) return null;

  const artist = album.artists[0];

  return (
    <div className="">
      <PageHeader>
        {artist ? (
          <Link to={`/artists/${artist.id}`} className="hover:underline">
            {artist.name}
          </Link>
        ) : (
          "Unknown Artist"
        )}{" "}
        / {album.name}
      </PageHeader>
      <div className="max-w-5xl mx-auto space-y-6">
        <AlbumHeader
          album={album}
          onAddAllTracks={() => addAlbumToSelection(album.id)}
        />

        <div className="space-y-4">
          {tracks.map((track) => (
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
