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
        <PageHeader title="Search" />
        <div className="text-center text-muted-foreground mt-8">
          Search for artists, songs, or albums to get started
        </div>
      </>
    );
  }

  const { artists, tracks } = loaderData.results;

  return (
    <>
      <PageHeader title={`Search: "${loaderData.query}"`} />
      <Tabs defaultValue="artists" className="w-full">
        <TabsList className="">
          <TabsTrigger value="artists">Artists</TabsTrigger>
          <TabsTrigger value="tracks">Songs</TabsTrigger>
        </TabsList>

        <TabsContent value="artists">
          {artists.length > 0 ? (
            <div className="flex flex-col">
              {artists.map((artist) => (
                <div
                  key={artist.artist_id}
                  className="flex items-center space-x-4 py-4 border-b last:border-b-0 relative group"
                >
                  <SpotifyImage
                    src={artist.images?.[0]?.url}
                    alt={artist.artist_name}
                    uri={`spotify:artist:${artist.artist_id}`}
                    canPlay={currentUser?.product === "premium"}
                  />
                  <div className="flex-grow">
                    <h3 className="font-semibold">{artist.artist_name}</h3>
                    <div className="mt-1 flex items-center space-x-2">
                      {artist.genres?.slice(0, 3).map((genre) => (
                        <Badge key={genre} variant="secondary">
                          {genre}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <Button
                    size="icon"
                    onClick={() => toggleArtistSelection(artist.artist_id)}
                    className={`rounded-full transition-opacity ${
                      selectedArtistIds.includes(artist.artist_id)
                        ? "opacity-80 bg-teal-500"
                        : "opacity-0 group-hover:opacity-100"
                    }`}
                  >
                    {selectedArtistIds.includes(artist.artist_id) ? (
                      <CheckIcon className="w-6 h-6 text-white" />
                    ) : (
                      <Plus className="w-12 h-12 text-white" />
                    )}
                  </Button>
                </div>
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
    </>
  );
}
