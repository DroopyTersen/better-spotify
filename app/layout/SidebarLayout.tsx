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
import { TooltipWrapper } from "~/toolkit/components/TooltipWrapper";

const PlaylistIcon = ({ className }: { className?: string }) => (
  <svg
    stroke="currentColor"
    fill="currentColor"
    strokeWidth="0"
    viewBox="0 0 16 16"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <path d="M12 13c0 1.105-1.12 2-2.5 2S7 14.105 7 13s1.12-2 2.5-2 2.5.895 2.5 2" />
    <path fillRule="evenodd" d="M12 3v10h-1V3z" />
    <path d="M11 2.82a1 1 0 0 1 .804-.98l3-.6A1 1 0 0 1 16 2.22V4l-5 1z" />
    <path
      fillRule="evenodd"
      d="M0 11.5a.5.5 0 0 1 .5-.5H4a.5.5 0 0 1 0 1H.5a.5.5 0 0 1-.5-.5m0-4A.5.5 0 0 1 .5 7H8a.5.5 0 0 1 0 1H.5a.5.5 0 0 1-.5-.5m0-4A.5.5 0 0 1 .5 3H8a.5.5 0 0 1 0 1H.5a.5.5 0 0 1-.5-.5"
    />
  </svg>
);

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
            <SearchInput className="hidden md:block bg-secondary" />
            <TooltipWrapper tooltip="Build a new Playlist">
              <Link
                to="/builder"
                className="relative p-2 rounded-full hover:bg-primary"
              >
                <PlaylistIcon className="w-6 h-6" />
                {totalSelectedCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-5 h-5 flex items-center justify-center rounded-full">
                    {totalSelectedCount}
                  </span>
                )}
              </Link>
            </TooltipWrapper>
          </header>
          <main className="flex-1 p-6 w-full h-[calc(100vh-64px)]">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};
