import { ShoppingCart } from "lucide-react";
import { CartPanel } from "~/spotify/playlistBuilder/CartPanel";
import { Separator } from "~/shadcn/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "~/shadcn/components/ui/sheet";
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
        <div className="flex-1 flex flex-col w-full">
          <header className="flex h-16 items-center gap-4 border-b px-6 w-full">
            <SidebarTrigger />
            <Separator orientation="vertical" className="h-6" />
            <h1 className="text-lg font-bold" id="page-title"></h1>
            <div className="flex-1" />
            <SearchInput />
            <Sheet>
              <SheetTrigger asChild>
                <button className="relative p-2 rounded-full hover:bg-gray-100">
                  <ShoppingCart className="w-6 h-6" />
                  {totalSelectedCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-5 h-5 flex items-center justify-center rounded-full">
                      {totalSelectedCount}
                    </span>
                  )}
                </button>
              </SheetTrigger>
              <SheetContent side="right" className="w-96">
                <CartPanel />
              </SheetContent>
            </Sheet>
          </header>
          <main className="flex-1 overflow-y-auto p-6 w-full">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
};
