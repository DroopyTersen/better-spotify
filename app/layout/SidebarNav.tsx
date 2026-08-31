import {
  History as HistoryIcon,
  LogOut,
  Mic2,
  Music2,
  Play,
  Settings,
} from "lucide-react";
import {
  Form,
  Link,
  useLocation,
  useNavigation,
  useRevalidator,
} from "react-router";
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

import type { Device } from "@spotify/web-api-ts-sdk";
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
import type { SpotifyPlaylist } from "~/spotify/spotify.db";
import { useState } from "react";
import { useUpdateEffect } from "~/toolkit/hooks/useUpdateEffect";
import { SearchInput } from "~/spotify/components/SearchInput";
import { createSpotifySdk } from "~/spotify/createSpotifySdk";
import { getOptionalAccountDatabase } from "~/db/db.client";
import {
  cancelSpotifySynchronization,
  synchronizeSpotifyLibrary,
} from "~/spotify/sync/spotifySync.client";

export const SidebarNav = ({
  playlists,
  devices,
}: {
  playlists: SpotifyPlaylist[];
  devices: Device[];
}) => {
  let currentUser = useCurrentUser();
  const revalidator = useRevalidator();
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncFailed, setSyncFailed] = useState(false);
  let location = useLocation();
  let navigation = useNavigation();
  let pathname = navigation?.location?.pathname || location.pathname;
  const syncLibrary = async () => {
    if (!currentUser?.tokens) return;
    const database = getOptionalAccountDatabase(currentUser.id);
    if (!database) {
      setSyncFailed(true);
      return;
    }
    setIsSyncing(true);
    setSyncFailed(false);
    try {
      await synchronizeSpotifyLibrary({
        accountId: currentUser.id,
        database,
        sdk: createSpotifySdk(currentUser.tokens),
        mode: "full",
      });
      revalidator.revalidate();
    } catch {
      setSyncFailed(true);
    } finally {
      setIsSyncing(false);
    }
  };
  let sidebar = useSidebar();
  useUpdateEffect(() => {
    if (sidebar.isMobile && sidebar.openMobile) {
      sidebar.setOpenMobile(false);
    }
  }, [location.pathname]);
  return (
    <Sidebar className="border-r border-sidebar-border bg-sidebar">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg">
              <Music2 className="h-6 w-6" />
              <span className="font-bold text-xl">Better Spotify</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <div className="md:hidden">
          <SearchInput />
        </div>
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
                    <span>Now Playing (coming soon)</span>
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
              {playlists.map((playlist) => (
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
          disabled={isSyncing || !currentUser}
          onClick={() => void syncLibrary()}
          aria-describedby={syncFailed ? "spotify-sync-error" : undefined}
        >
          {isSyncing ? "Syncing Spotify…" : "Sync Spotify Data"}
        </Button>
        {syncFailed && (
          <p
            id="spotify-sync-error"
            className="px-2 text-xs text-destructive"
            role="status"
          >
            Sync failed. Your existing library is still available.
          </p>
        )}
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
                      href={`https://open.spotify.com/user/${currentUser.spotifyId}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Settings className="mr-2 h-4 w-4" />
                      <span>Profile</span>
                    </a>
                  </DropdownMenuItem>
                  <Form
                    method="post"
                    action="/logout"
                    onSubmit={() =>
                      cancelSpotifySynchronization(currentUser.id)
                    }
                  >
                    <DropdownMenuItem className="text-red-600" asChild>
                      <button type="submit" className="w-full">
                        <LogOut className="mr-2 h-4 w-4" />
                        <span>Log out</span>
                      </button>
                    </DropdownMenuItem>
                  </Form>
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
