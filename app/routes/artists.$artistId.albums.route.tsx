import { useOutletContext } from "react-router";
import { AlbumItem } from "~/spotify/components/AlbumItem";
import type { loader as artistLoader } from "./artists.$artistId.route"; // Import type for parent loader

export default function ArtistAlbumsRoute() {
  // Access data loaded by the parent '$artistId' route using its exported ID
  const { albums } = useOutletContext() as Awaited<
    ReturnType<typeof artistLoader>
  >;

  if (!albums) return <div>Loading albums...</div>; // Or handle loading/error state

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
