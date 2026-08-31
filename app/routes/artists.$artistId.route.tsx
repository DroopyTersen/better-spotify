import {
  Outlet,
  Link,
  useLocation,
  useNavigate,
} from "react-router";
import { requireAuth } from "~/auth/auth.server";
import { PageHeader } from "~/layout/PageHeader";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "~/shadcn/components/ui/tabs";
import { ArtistHeader } from "~/spotify/components/ArtistHeader";
import { spotifyWebApi } from "~/spotify/api/spotifyWebApi";
import { createSpotifySdk } from "~/spotify/createSpotifySdk";
import { usePlaylistBuildingService } from "~/spotify/playlistBuilder/usePlaylistBuildingService";
import { requireSpotifyId } from "~/spotify/spotifyId";
import type { Route } from "./+types/artists.$artistId.route";

export const loader = async ({ request, params }: Route.LoaderArgs) => {
  let user = await requireAuth(request);
  const artistId = requireSpotifyId(params.artistId);

  const sdk = createSpotifySdk(user.tokens);
  const [artist, catalogTracks, albums] = await Promise.all([
    sdk.artists.get(artistId),
    spotifyWebApi.getArtistCatalogTracks(sdk, artistId),
    spotifyWebApi.getArtistAlbums(sdk, artistId),
  ]);

  return {
    artist,
    catalogTracks,
    albums,
  };
};

// Define an ID for this route loader so child routes can access its data
export const id = "artist-detail";

export default function ArtistRouteLayout({
  loaderData,
}: Route.ComponentProps) {
  const { artist } = loaderData;
  const { selectedArtistIds, toggleArtistSelection } =
    usePlaylistBuildingService();
  const location = useLocation();
  const navigate = useNavigate();

  // Determine which tab is active based on the URL path
  const activeTab = location.pathname.endsWith("/albums")
    ? "albums"
    : "popular";

  // Handle tab change to navigate to the correct URL
  const handleTabChange = (value: string) => {
    if (artist) {
      navigate(`/artists/${artist.id}/${value}`);
    }
  };

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

        {/* Use Tabs but connected to routing */}
        <Tabs
          value={activeTab}
          onValueChange={handleTabChange}
          className="w-full"
        >
          <TabsList>
            <TabsTrigger value="popular" asChild>
              <Link to="popular">Catalog</Link>
            </TabsTrigger>
            <TabsTrigger value="albums" asChild>
              <Link to="albums">Albums</Link>
            </TabsTrigger>
          </TabsList>

          {/* Container for the Outlet */}
          <div className="mt-2">
            <Outlet context={loaderData} />
          </div>
        </Tabs>
      </div>
    </div>
  );
}
