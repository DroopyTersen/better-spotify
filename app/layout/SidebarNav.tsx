import {
  History as HistoryIcon,
  LogOut,
  Mic2,
  Music2,
  Play,
  Settings,
} from "lucide-react";
import { Link, useFetcher, useLocation, useNavigation } from "react-router";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "~/shadcn/components/ui/avatar";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "~/shadcn/components/ui/sidebar";

import { Device } from "@spotify/web-api-ts-sdk";
import { useCurrentUser } from "~/auth/useCurrentUser";
import { Button } from "~/shadcn/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/shadcn/components/ui/dropdown-menu";
import { cn } from "~/shadcn/lib/utils";
import { SpotifyPlaylist } from "~/spotify/spotify.db";
import { useEffect } from "react";
import { useUpdateEffect } from "~/toolkit/hooks/useUpdateEffect";

export const SidebarNav = ({
  playlists,
  devices,
}: {
  playlists: SpotifyPlaylist[];
  devices: Device[];
}) => {
  let currentUser = useCurrentUser();
  let fetcher = useFetcher();
  let location = useLocation();
  let navigation = useNavigation();
  let pathname = navigation?.location?.pathname || location.pathname;
  let syncPlayHistory = () => {
    console.log("🚀 | syncPlayHistory | user:", currentUser);
    if (!currentUser?.tokens) return;
    fetcher.submit({ user: currentUser } as any, {
      method: "POST",
      action: "/spotify/sync",
      encType: "application/json",
    });
  };
  let sidebar = useSidebar();
  useUpdateEffect(() => {
    if (sidebar.isMobile && sidebar.openMobile) {
      sidebar.setOpenMobile(false);
    }
  }, [location.pathname]);
  return (
    <Sidebar className="bg-white border-r">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg">
              <Music2 className="h-6 w-6" />
              <span className="font-bold text-xl">Better Spotify</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-base font-bold">
            Playing
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  className="font-medium text-gray-400"
                  disabled={true}
                  title="Coming soon"
                >
                  <span>
                    <Play className="h-5 w-5" />
                    <span>Now Playing</span>
                  </span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  className={cn(
                    "font-medium",
                    pathname?.startsWith("/play-history") &&
                      "bg-sidebar-accent text-sidebar-foreground border-r-4 border-r-primary rounded-r-sm"
                  )}
                >
                  <Link to="/play-history">
                    <HistoryIcon className="h-5 w-5" />
                    <span>Play History</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-base font-bold">
            Your Favorites
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  className={cn(
                    "font-medium",
                    pathname?.startsWith("/songs") &&
                      "bg-sidebar-accent text-sidebar-foreground border-r-4 border-r-primary rounded-r-sm"
                  )}
                >
                  <Link to="/songs">
                    <Music2 className="h-5 w-5" />
                    <span>Songs</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  className={cn(
                    "font-medium",
                    pathname?.startsWith("/artists") &&
                      "bg-sidebar-accent text-sidebar-foreground border-r-4 border-r-primary rounded-r-sm"
                  )}
                >
                  <Link to="/artists">
                    <Mic2 className="h-5 w-5" />
                    <span>Artists</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-base font-bold">
            Playlists
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {playlists.slice(0, 10).map?.((playlist) => (
                <SidebarMenuItem key={playlist.playlist_id}>
                  <SidebarMenuButton asChild>
                    <Link to={`/playlist/${playlist.playlist_id}`}>
                      {playlist.playlist_name}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t">
        <Button
          type="button"
          disabled={fetcher.state !== "idle"}
          onClick={syncPlayHistory}
        >
          Sync Spotify Data
        </Button>
        <SidebarMenu>
          {currentUser && (
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton className="font-medium">
                    <Avatar className="h-6 w-6">
                      {currentUser?.photo && (
                        <AvatarImage
                          src={currentUser.photo}
                          alt={currentUser.name}
                        />
                      )}
                      <AvatarFallback>
                        {(currentUser?.name || currentUser.id)
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span>{currentUser.name}</span>
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  <DropdownMenuLabel>Devices</DropdownMenuLabel>
                  {devices?.map((device) => (
                    <DropdownMenuItem key={device.id}>
                      {device.name}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>My Account</DropdownMenuLabel>
                  <DropdownMenuItem asChild>
                    <a
                      href={`https://open.spotify.com/user/${currentUser.id}`}
                      target="_blank"
                    >
                      <Settings className="mr-2 h-4 w-4" />
                      <span>Profile</span>
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-red-600" asChild>
                    <Link to="/logout">
                      <LogOut className="mr-2 h-4 w-4" />
                      <span>Log out</span>
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
};
