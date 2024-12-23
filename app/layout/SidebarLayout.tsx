import { ShoppingCart } from "lucide-react";
import { Separator } from "~/shadcn/components/ui/separator";
import {
  Sidebar,
  SidebarProvider,
  SidebarTrigger,
} from "~/shadcn/components/ui/sidebar";
import { SpotifyPlaylist } from "~/spotify/spotify.db";
import { SidebarNav } from "./SidebarNav";
import { Device } from "@spotify/web-api-ts-sdk";
import { SearchInput } from "~/spotify/components/SearchInput";
import { usePlaylistBuildingService } from "~/spotify/playlistBuilder/usePlaylistBuildingService";
import { Link } from "react-router";

export const SidebarLayout = ({
  children,
  playlists,
  devices,
}: {
  children: React.ReactNode;
  playlists: SpotifyPlaylist[];
  devices: Device[];
}) => {
  let { totalSelectedCount } = usePlaylistBuildingService();

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full">
        <Sidebar>
          <SidebarNav playlists={playlists} devices={devices} />
        </Sidebar>
        <div className="grid grid-rows-[auto_1fr] w-full relative">
          <header className="flex h-16 items-center gap-4 border-b px-6 w-full sticky top-0 bg-background z-10">
            <SidebarTrigger />
            <Separator orientation="vertical" className="h-6" />
            <h1 className="text-lg font-bold" id="page-title"></h1>
            <div className="flex-1" />
            <SearchInput />
            <Link
              to="/builder"
              className="relative p-2 rounded-full hover:bg-primary"
            >
              <ShoppingCart className="w-6 h-6" />
              {totalSelectedCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-5 h-5 flex items-center justify-center rounded-full">
                  {totalSelectedCount}
                </span>
              )}
            </Link>
          </header>
          <main className="flex-1 p-6 w-full h-[calc(100vh-64px)]">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};
