import { CheckIcon, Plus } from "lucide-react";
import { requireAuth } from "~/auth/auth.server";
import { useCurrentUser } from "~/auth/useCurrentUser";
import { PageHeader } from "~/layout/PageHeader";
import { Badge } from "~/shadcn/components/ui/badge";
import { Button } from "~/shadcn/components/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "~/shadcn/components/ui/tabs";
import { SpotifyImage } from "~/spotify/components/SpotifyImage";
import { TrackItem } from "~/spotify/components/TrackItem";
import { createSpotifySdk } from "~/spotify/createSpotifySdk";
import { usePlaylistBuildingService } from "~/spotify/playlistBuilder/usePlaylistBuildingService";
import { Route } from "./+types/search.route";
import { ArtistItem } from "~/spotify/components/ArtistItem";
import { SearchInput } from "~/spotify/components/SearchInput";

export const loader = async ({ request }: Route.LoaderArgs) => {
  const user = await requireAuth(request);
  const sdk = createSpotifySdk(user.tokens);
  const url = new URL(request.url);
  const query = url.searchParams.get("query");

  if (!query) {
    return { query: "", results: null };
  }

  const [artists, tracks] = await Promise.all([
    sdk.search(query, ["artist"], "US", 30),
    sdk.search(query, ["track"], "US", 50),
    // sdk.search(query, ["album"], "US", 20),
  ]);

  const transformedArtists = artists.artists.items.map((artist) => ({
    artist_id: artist.id,
    artist_name: artist.name,
    images: artist.images,
    popularity: artist.popularity,
    genres: artist.genres,
  }));

  return {
    query,
    results: {
      artists: transformedArtists,
      tracks: tracks.tracks.items,
      // albums: albums.albums.items,
    },
  };
};

export default function SearchRoute({ loaderData }: Route.ComponentProps) {
  const {
    selectedArtistIds,
    selectedTrackIds,
    toggleArtistSelection,
    toggleTrackSelection,
  } = usePlaylistBuildingService();
  const currentUser = useCurrentUser();

  if (!loaderData.results) {
    return (
      <>
        <PageHeader>Search</PageHeader>
        <div className="text-center text-muted-foreground mt-8">
          Search for artists, songs, or albums to get started
        </div>
      </>
    );
  }

  const { artists, tracks } = loaderData.results;

  return (
    <>
      <PageHeader>{`Search: "${loaderData.query}"`}</PageHeader>
      <div className="max-w-3xl mx-auto">
        <SearchInput className="md:hidden mb-2" />
        <Tabs defaultValue="artists" className="w-full">
          <TabsList className="">
            <TabsTrigger value="artists">Artists</TabsTrigger>
            <TabsTrigger value="tracks">Songs</TabsTrigger>
          </TabsList>

          <TabsContent value="artists">
            {artists.length > 0 ? (
              <div className="flex flex-col">
                {artists.map((artist) => (
                  <ArtistItem
                    key={artist.artist_id}
                    artist={{
                      artist_id: artist.artist_id,
                      artist_name: artist.artist_name,
                      images: artist.images,
                      genres: artist.genres,
                    }}
                    isSelected={selectedArtistIds.includes(artist.artist_id)}
                    toggleSelection={toggleArtistSelection}
                  />
                ))}
              </div>
            ) : (
              <div className="text-muted-foreground">No artists found</div>
            )}
          </TabsContent>

          <TabsContent value="tracks">
            {tracks.length > 0 ? (
              <div className="flex flex-col">
                {tracks.map((track) => (
                  <TrackItem
                    key={track.id}
                    track={{
                      track_id: track.id,
                      track_name: track.name,
                      artist_id: track.artists[0]?.id || null,
                      artist_name: track.artists[0]?.name || null,
                      images: track.album.images,
                    }}
                    isSelected={selectedTrackIds.includes(track.id)}
                    toggleSelection={toggleTrackSelection}
                  />
                ))}
              </div>
            ) : (
              <div className="text-muted-foreground">No songs found</div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
