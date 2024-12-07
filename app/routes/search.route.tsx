import { PageHeader } from "~/layout/PageHeader";
import { requireAuth } from "~/auth/auth.server";
import { createSpotifySdk } from "~/spotify/createSpotifySdk";
import { ArtistList } from "~/spotify/components/ArtistList";
import { TrackItem } from "~/spotify/components/TrackItem";
import { usePlaylistSelection } from "~/spotify/playlistBuilder/PlaylistSelectionContext";
import { Button } from "~/shadcn/components/ui/button";
import { useNavigation, useLoaderData } from "react-router";
import { useState } from "react";
import { LoaderFunctionArgs } from "react-router";
import { AlbumItem } from "~/spotify/components/AlbumItem";
import { Route } from "./+types/search.route";
import { CheckIcon, Plus } from "lucide-react";
import { Badge } from "~/shadcn/components/ui/badge";
import { SpotifyImage } from "~/spotify/components/SpotifyImage";
import { useCurrentUser } from "~/auth/useCurrentUser";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "~/shadcn/components/ui/tabs";

export const loader = async ({ request }: Route.LoaderArgs) => {
  const user = await requireAuth(request);
  const sdk = createSpotifySdk(user.tokens);
  const url = new URL(request.url);
  const query = url.searchParams.get("query");

  if (!query) {
    return { query: "", results: null };
  }

  const [artists, tracks, albums] = await Promise.all([
    sdk.search(query, ["artist"], "US", 20),
    sdk.search(query, ["track"], "US", 20),
    sdk.search(query, ["album"], "US", 20),
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
      albums: albums.albums.items,
    },
  };
};

export default function SearchRoute({ loaderData }: Route.ComponentProps) {
  const navigation = useNavigation();
  const {
    selectedArtistIds,
    selectedTrackIds,
    toggleArtistSelection,
    toggleTrackSelection,
  } = usePlaylistSelection();
  const [expandedSections, setExpandedSections] = useState<
    Record<string, boolean>
  >({
    artists: false,
    tracks: false,
    albums: false,
  });
  const currentUser = useCurrentUser();

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

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

  const { artists, tracks, albums } = loaderData.results;

  return (
    <>
      <PageHeader title={`Search results for "${loaderData.query}"`} />
      <Tabs defaultValue="artists" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="artists">Artists</TabsTrigger>
          <TabsTrigger value="tracks">Songs</TabsTrigger>
          <TabsTrigger value="albums">Albums</TabsTrigger>
        </TabsList>

        <TabsContent value="artists">
          {artists.length > 0 ? (
            <>
              <div className="flex flex-col">
                {artists
                  .slice(0, expandedSections.artists ? undefined : 5)
                  .map((artist) => (
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
              {artists.length > 5 && (
                <div className="mt-4 text-center">
                  <Button
                    variant="ghost"
                    onClick={() => toggleSection("artists")}
                  >
                    {expandedSections.artists ? "Show less" : "Show more"}
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="text-muted-foreground">No artists found</div>
          )}
        </TabsContent>

        <TabsContent value="tracks">
          {tracks.length > 0 ? (
            <>
              <div className="flex flex-col">
                {tracks
                  .slice(0, expandedSections.tracks ? undefined : 5)
                  .map((track) => (
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
              {tracks.length > 5 && (
                <div className="mt-4 text-center">
                  <Button
                    variant="ghost"
                    onClick={() => toggleSection("tracks")}
                  >
                    {expandedSections.tracks ? "Show less" : "Show more"}
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="text-muted-foreground">No songs found</div>
          )}
        </TabsContent>

        <TabsContent value="albums">
          {albums.length > 0 ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {albums
                  .slice(0, expandedSections.albums ? undefined : 5)
                  .map((album) => (
                    <AlbumItem key={album.id} album={album} />
                  ))}
              </div>
              {albums.length > 5 && (
                <div className="mt-4 text-center">
                  <Button
                    variant="ghost"
                    onClick={() => toggleSection("albums")}
                  >
                    {expandedSections.albums ? "Show less" : "Show more"}
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="text-muted-foreground">No albums found</div>
          )}
        </TabsContent>
      </Tabs>
    </>
  );
}
