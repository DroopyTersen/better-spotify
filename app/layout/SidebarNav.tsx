import { Link, useFetcher } from "react-router";
import {
  Music2,
  Play,
  Mic2,
  Plus,
  User,
  LogOut,
  Settings,
  History as HistoryIcon,
} from "lucide-react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "~/shadcn/components/ui/avatar";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  SidebarRail,
} from "~/shadcn/components/ui/sidebar";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/shadcn/components/ui/dropdown-menu";
import { useCurrentUser } from "~/auth/useCurrentUser";
import { SpotifyPlaylist } from "~/spotify/spotify.db";
import { Button } from "~/shadcn/components/ui/button";
import { useAsyncData } from "~/toolkit/hooks/useAsyncData";
import { createSpotifySdk } from "~/spotify/createSpotifySdk";

export const SidebarNav = ({ playlists }: { playlists: SpotifyPlaylist[] }) => {
  let currentUser = useCurrentUser();
  let fetcher = useFetcher();
  let syncPlayHistory = () => {
    console.log("🚀 | syncPlayHistory | user:", currentUser);
    if (!currentUser?.tokens) return;
    fetcher.submit(
      { user: currentUser },
      {
        method: "POST",
        encType: "application/json",
      }
    );
  };
  let { data: devices } = useAsyncData(
    async () => {
      let sdk = createSpotifySdk(currentUser?.tokens!);
      let devicesResult = await sdk.player.getAvailableDevices();
      return devicesResult.devices;
    },
    [],
    []
  );
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
                <SidebarMenuButton asChild className="font-medium">
                  <Link to="/now-playing">
                    <Play className="h-5 w-5" />
                    <span>Now Playing</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild className="font-medium">
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
            Your Top
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild className="font-medium">
                  <Link to="/top/tracks">
                    <Music2 className="h-5 w-5" />
                    <span>Songs</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild className="font-medium">
                  <Link to="/top/artists">
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
              {playlists?.slice(0, 10).map?.((playlist) => (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <Link to={`/playlists/${playlist.playlist_id}`}>
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
          Sync Play History
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
                        {currentUser?.name
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
                    <DropdownMenuItem>{device.name}</DropdownMenuItem>
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
