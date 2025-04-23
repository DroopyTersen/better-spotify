import { LoaderFunctionArgs, useLoaderData } from "react-router";
import { requireAuth } from "~/auth/auth.server";
import { PageHeader } from "~/layout/PageHeader";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "~/shadcn/components/ui/tabs";
import { ArtistHeader } from "~/spotify/components/ArtistHeader";
import { TrackItem } from "~/spotify/components/TrackItem";
import { createSpotifySdk } from "~/spotify/createSpotifySdk";
import { usePlaylistBuildingService } from "~/spotify/playlistBuilder/usePlaylistBuildingService";
import { Route } from "./+types/artists.$artistId.route";
import { AlbumItem } from "~/spotify/components/AlbumItem";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  let user = await requireAuth(request);
  const { artistId } = params;
  if (!artistId) throw new Error("Artist ID is required");

  const sdk = createSpotifySdk(user.tokens);
  const [artist, topTracks, albums] = await Promise.all([
    sdk.artists.get(artistId),
    sdk.artists.topTracks(artistId, "US"),
    sdk.artists.albums(artistId),
  ]);

  return {
    artist,
    topTracks: topTracks.tracks,
    albums: albums.items,
  };
};

export default function ArtistRoute({ loaderData }: Route.ComponentProps) {
  const { artist, topTracks, albums } = loaderData;
  const {
    selectedTrackIds,
    toggleTrackSelection,
    selectedArtistIds,
    toggleArtistSelection,
  } = usePlaylistBuildingService();

  if (!artist) return null;

  return (
    <div className="">
      <PageHeader>{artist.name}</PageHeader>
      <div className="max-w-5xl mx-auto space-y-6">
        <ArtistHeader
          artist={artist}
          isSelected={selectedArtistIds.includes(artist.id)}
          onToggleSelection={() => toggleArtistSelection(artist.id)}
        />

        <Tabs defaultValue="popular" className="w-full">
          <TabsList>
            <TabsTrigger value="popular">Popular</TabsTrigger>
            <TabsTrigger value="albums">Albums</TabsTrigger>
          </TabsList>

          <TabsContent value="popular" className="space-y-4">
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
          </TabsContent>

          <TabsContent
            value="albums"
            className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
          >
            {albums.map((album) => (
              <AlbumItem key={album.id} album={album} />
            ))}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
