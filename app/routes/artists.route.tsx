import { LoaderFunctionArgs } from "react-router";
import { PageHeader } from "~/layout/PageHeader";
import { requireAuth } from "~/auth/auth.server";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "~/shadcn/components/ui/tabs";
import { useRouteData } from "~/toolkit/remix/useRouteData";
import { ArtistList } from "~/spotify/components/ArtistList";
import { RecentArtistItem } from "~/spotify/components/RecentArtistItem";
import type {
  SpotifyTopArtist,
  SpotifyRecentArtist,
} from "~/spotify/spotify.db";
import { getDb } from "~/db/db.client";
import { spotifyDb } from "~/spotify/spotify.db";
import { Route } from "./+types/artists.route";
import { usePlaylistSelection } from "~/spotify/playlistBuilder/PlaylistSelectionContext";

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
  const { selectedArtistIds, toggleArtistSelection } = usePlaylistSelection();

  return (
    <>
      <PageHeader title="Artists" />
      <Tabs defaultValue="top" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="top">Top</TabsTrigger>
          <TabsTrigger value="recent">Recent</TabsTrigger>
        </TabsList>
        <TabsContent value="top">
          <ArtistList
            artists={topArtists}
            isSelected={(id) => selectedArtistIds.includes(id)}
            toggleSelection={toggleArtistSelection}
          />
        </TabsContent>
        <TabsContent value="recent">
          <div className="flex flex-col">
            {recentArtists.map((artist) => (
              <RecentArtistItem
                key={artist.artist_id}
                artist={artist}
                isSelected={selectedArtistIds.includes(artist.artist_id!)}
                toggleSelection={toggleArtistSelection}
              />
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}
