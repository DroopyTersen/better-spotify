import { Suspense } from "react";
import { Await } from "react-router";
import { requireAuth } from "~/auth/auth.server";
import { spotifyWebApi } from "~/spotify/api/spotifyWebApi";
import { AlbumItem } from "~/spotify/components/AlbumItem";
import { createSpotifySdk } from "~/spotify/createSpotifySdk";
import { requireSpotifyId } from "~/spotify/spotifyId";
import type { SimplifiedAlbum } from "@spotify/web-api-ts-sdk";
import type { Route } from "./+types/artists.$artistId.albums.route";

export const loader = async ({ request, params }: Route.LoaderArgs) => {
  const user = await requireAuth(request);
  const artistId = requireSpotifyId(params.artistId);
  const sdk = createSpotifySdk(user.tokens);
  return { albums: spotifyWebApi.getArtistAlbums(sdk, artistId) };
};

function AlbumsSkeleton() {
  return (
    <div
      className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4"
      role="status"
      aria-label="Loading albums"
    >
      {Array.from({ length: 8 }, (_, index) => (
        <div key={index} className="space-y-2">
          <div className="aspect-square animate-pulse rounded bg-muted" />
          <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

function Albums({ albums }: { albums: SimplifiedAlbum[] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {albums.map((album) => (
        <AlbumItem key={album.id} album={album} />
      ))}
      {albums.length === 0 && (
        <p className="text-muted-foreground col-span-full">
          No albums found for this artist.
        </p>
      )}
    </div>
  );
}

export default function ArtistAlbumsRoute({ loaderData }: Route.ComponentProps) {
  return (
    <Suspense fallback={<AlbumsSkeleton />}>
      <Await
        resolve={loaderData.albums}
        errorElement={
          <p role="alert" className="text-sm text-destructive">
            Albums could not be loaded. Please try again.
          </p>
        }
      >
        {(resolvedAlbums) => <Albums albums={resolvedAlbums} />}
      </Await>
    </Suspense>
  );
}
