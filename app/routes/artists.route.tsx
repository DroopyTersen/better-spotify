import { requireAuth } from "~/auth/auth.server";
import { initAccountDatabase } from "~/db/db.client";
import { PageHeader } from "~/layout/PageHeader";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "~/shadcn/components/ui/tabs";
import { ArtistItem } from "~/spotify/components/ArtistItem";
import { usePlaylistBuildingService } from "~/spotify/playlistBuilder/usePlaylistBuildingService";
import { spotifyDb } from "~/spotify/spotify.db";
import type { Route } from "./+types/artists.route";
import dayjs from "dayjs";
import { withOptionalLibraryDeadline } from "~/spotify/sync/librarySnapshot.client";

export const loader = async ({ request }: Route.LoaderArgs) => {
  const user = await requireAuth(request);
  return { accountId: user.id };
};

export const clientLoader = async ({ serverLoader }: Route.ClientLoaderArgs) => {
  const { accountId } = await serverLoader();
  try {
    return await withOptionalLibraryDeadline(async () => {
      const { db } = await initAccountDatabase(accountId);
      const [topArtists, recentArtists] = await Promise.all([
        spotifyDb.getTopArtists(db, { limit: 50 }),
        spotifyDb.getRecentArtists(db, { limit: 50 }),
      ]);
      return { topArtists, recentArtists };
    });
  } catch {
    return { topArtists: [], recentArtists: [] };
  }
};
clientLoader.hydrate = true as const;

export const HydrateFallback = () => null;

export default function ArtistsRoute({ loaderData }: Route.ComponentProps) {
  const { topArtists, recentArtists } = loaderData;
  const { selectedArtistIds, toggleArtistSelection } =
    usePlaylistBuildingService();

  return (
    <>
      <PageHeader>Artists</PageHeader>
      <div className="max-w-4xl mx-auto">
        <Tabs defaultValue="top" className="w-full max-w-5xl mx-auto">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="top">Top</TabsTrigger>
            <TabsTrigger value="recent">Recent</TabsTrigger>
          </TabsList>
          <TabsContent value="top">
            <div className="flex flex-col">
              {topArtists.map((artist) => (
                <ArtistItem
                  key={artist.artist_id}
                  artist={artist}
                  isSelected={
                    artist.artist_id
                      ? selectedArtistIds.includes(artist.artist_id)
                      : false
                  }
                  toggleSelection={toggleArtistSelection}
                />
              ))}
            </div>
          </TabsContent>
          <TabsContent value="recent">
            <div className="flex flex-col">
              {recentArtists.map((artist) => (
                <ArtistItem
                  key={artist.artist_id}
                  artist={artist}
                  isSelected={
                    artist.artist_id
                      ? selectedArtistIds.includes(artist.artist_id)
                      : false
                  }
                  toggleSelection={toggleArtistSelection}
                  metadata={
                    <>
                      <p>{dayjs(artist.last_played).format("MM/DD/YYYY")}</p>
                      <p>{dayjs(artist.last_played).format("h:mm A")}</p>
                    </>
                  }
                />
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
