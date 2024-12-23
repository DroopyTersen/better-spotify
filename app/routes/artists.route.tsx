import { LoaderFunctionArgs } from "react-router";
import { getDb } from "~/db/db.client";
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
import { Route } from "./+types/artists.route";
import dayjs from "dayjs";

export const clientLoader = async ({ request }: LoaderFunctionArgs) => {
  let db = getDb();
  let [topArtists, recentArtists] = await Promise.all([
    spotifyDb.getTopArtists(db, { limit: 50 }),
    spotifyDb.getRecentArtists(db, { limit: 50 }),
  ]);
  return { topArtists, recentArtists };
};

export default function ArtistsRoute({ loaderData }: Route.ComponentProps) {
  const { topArtists, recentArtists } = loaderData;
  const { selectedArtistIds, toggleArtistSelection } =
    usePlaylistBuildingService();

  return (
    <>
      <PageHeader title="Artists" />
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
                  isSelected={selectedArtistIds.includes(artist.artist_id!)}
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
                  isSelected={selectedArtistIds.includes(artist.artist_id!)}
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
