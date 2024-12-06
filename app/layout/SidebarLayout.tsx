import { Outlet } from "react-router";
import { SidebarNav } from "./SidebarNav";
import {
  Sidebar,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "~/shadcn/components/ui/sidebar";
import { Separator } from "~/shadcn/components/ui/separator";
import { SpotifyPlaylist } from "~/spotify/spotify.db";

export const SidebarLayout = ({
  children,
  playlists,
}: {
  children: React.ReactNode;
  playlists: SpotifyPlaylist[];
}) => {
  return (
    <SidebarProvider>
      <SidebarNav playlists={playlists} />
      <SidebarInset>
        <header className="flex h-16 items-center gap-4 border-b bg-white px-6 sticky top-0 z-10">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-6" />
          <h1 className="text-lg font-bold" id="page-title"></h1>
          <div className="flex-1" />
        </header>
        <main className="flex-1 p-8">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
};
