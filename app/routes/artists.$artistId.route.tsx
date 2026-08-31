import { Suspense } from "react";
import {
  Await,
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
import { createSpotifySdk } from "~/spotify/createSpotifySdk";
import { usePlaylistBuildingService } from "~/spotify/playlistBuilder/usePlaylistBuildingService";
import { requireSpotifyId } from "~/spotify/spotifyId";
import type { Artist } from "@spotify/web-api-ts-sdk";
import type { Route } from "./+types/artists.$artistId.route";

export const loader = async ({ request, params }: Route.LoaderArgs) => {
  let user = await requireAuth(request);
  const artistId = requireSpotifyId(params.artistId);

  const sdk = createSpotifySdk(user.tokens);
  return { artist: sdk.artists.get(artistId) };
};

export default function ArtistRouteLayout({
  loaderData,
}: Route.ComponentProps) {
  return (
    <Suspense fallback={<ArtistRouteSkeleton />}>
      <Await
        resolve={loaderData.artist}
        errorElement={
          <p
            role="alert"
            className="mx-auto max-w-5xl text-sm text-destructive"
          >
            This artist could not be loaded. Please try again.
          </p>
        }
      >
        {(artist) => <ArtistRouteContent artist={artist} />}
      </Await>
    </Suspense>
  );
}

function ArtistRouteContent({ artist }: { artist: Artist }) {
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
            <Outlet />
          </div>
        </Tabs>
      </div>
    </div>
  );
}

function ArtistRouteSkeleton() {
  return (
    <div>
      <PageHeader>Artist</PageHeader>
      <div
        className="mx-auto max-w-5xl space-y-6"
        role="status"
        aria-label="Loading artist"
      >
        <div className="flex items-center gap-4">
          <div className="h-24 w-24 animate-pulse rounded-full bg-muted" />
          <div className="flex-1 space-y-3">
            <div className="h-7 w-1/2 animate-pulse rounded bg-muted" />
            <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
          </div>
        </div>
      </div>
    </div>
  );
}
