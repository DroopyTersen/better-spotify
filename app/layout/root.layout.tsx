import { AlertTriangle, LoaderCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Outlet, useRevalidator } from "react-router";
import { requireAuth } from "~/auth/auth.server";
import { getAuthRevalidationDelay } from "~/auth/authRevalidation";
import { useCurrentUser } from "~/auth/useCurrentUser";
import { getOptionalAccountDatabase } from "~/db/db.client";
import { SidebarLayout } from "~/layout/SidebarLayout";
import { loadOptionalSpotifyBootData } from "~/layout/optionalSpotifyBoot.server";
import { spotifyWebApi } from "~/spotify/api/spotifyWebApi";
import { createSpotifySdk } from "~/spotify/createSpotifySdk";
import type { SpotifyPlaylist } from "~/spotify/spotify.db";
import { loadAccountLibrarySnapshot } from "~/spotify/sync/librarySnapshot.client";
import {
  cancelSpotifySynchronization,
  synchronizeSpotifyLibrary,
} from "~/spotify/sync/spotifySync.client";
import { isAbortError } from "~/spotify/sync/syncContext";
import type { Route } from "./+types/root.layout";

export function meta() {
  return [
    { title: "Better Spotify" },
    { name: "description", content: "A Spotify client for the modern age" },
  ];
}

export const loader = async ({ request }: Route.LoaderArgs) => {
  const user = await requireAuth(request);
  const optionalData = await loadOptionalSpotifyBootData({
    createTasks(signal) {
      const sdk = createSpotifySdk(user.tokens, { signal });
      return {
        playlists: spotifyWebApi.getCurrentUserPlaylists(sdk),
        devices: sdk.player.getAvailableDevices(),
      };
    },
  });

  const playlists: SpotifyPlaylist[] =
    optionalData.playlists
      ? optionalData.playlists.items
          .filter((playlist) => Boolean(playlist?.id))
          .map((playlist) => ({
            playlist_id: playlist.id,
            playlist_name: playlist.name,
            description: playlist.description,
            images: playlist.images,
            external_urls: playlist.external_urls,
            track_count: playlist.tracks?.total ?? null,
          }))
      : [];

  const devices = optionalData.devices?.devices ?? [];
  const spotifyWarning = optionalData.unavailable
    ? "Spotify signed you in, but some live library data is temporarily unavailable."
    : null;

  return { user, playlists, devices, spotifyWarning };
};

export const clientLoader = async ({
  serverLoader,
}: Route.ClientLoaderArgs) => {
  const serverData = await serverLoader();
  const localLibrary = await loadAccountLibrarySnapshot(serverData.user.id);

  return {
    ...serverData,
    ...localLibrary,
  };
};
clientLoader.hydrate = true as const;

export function HydrateFallback() {
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-6 text-foreground">
      <div className="flex items-center gap-3 rounded-xl border bg-card px-5 py-4 shadow-sm">
        <LoaderCircle className="size-5 animate-spin text-primary" />
        <div>
          <p className="font-medium">Opening your music library</p>
          <p className="text-sm text-muted-foreground">
            Preparing your local listening history…
          </p>
        </div>
      </div>
    </main>
  );
}

export default function RootLayout({ loaderData }: Route.ComponentProps) {
  const currentUser = useCurrentUser();
  // `useRevalidator()` returns a new wrapper whenever its state changes. Keep
  // only the stable callback in effect dependencies so a revalidation cannot
  // tear down and immediately restart the background Spotify sync.
  const { revalidate } = useRevalidator();
  const [syncWarning, setSyncWarning] = useState<string | null>(null);
  const needsInitialSync = loaderData.needsInitialSync;
  const accountId = currentUser?.id;
  const database =
    accountId && loaderData.libraryAvailable
      ? getOptionalAccountDatabase(accountId)
      : null;

  const sdk = useMemo(
    () => (currentUser?.tokens ? createSpotifySdk(currentUser.tokens) : null),
    [
      currentUser?.tokens.accessToken,
      currentUser?.tokens.clientId,
      currentUser?.tokens.expiresAt,
      currentUser?.tokens.tokenType,
    ]
  );

  useEffect(() => {
    const expiresAt = currentUser?.tokens.expiresAt;
    if (!expiresAt) return;

    const timeoutId = window.setTimeout(
      () => revalidate(),
      getAuthRevalidationDelay(expiresAt)
    );
    return () => window.clearTimeout(timeoutId);
  }, [currentUser?.tokens.expiresAt, revalidate]);

  useEffect(() => {
    if (!sdk || !accountId || !database) return;
    let active = true;
    const accountController = new AbortController();

    const synchronize = async (full: boolean) => {
      try {
        await synchronizeSpotifyLibrary({
          accountId,
          database,
          sdk,
          mode: full ? "full" : "incremental",
          signal: accountController.signal,
        });
        if (active) {
          setSyncWarning(null);
          revalidate();
        }
      } catch (error) {
        if (isAbortError(error)) return;
        if (active) {
          setSyncWarning(
            "Your saved library is available, but background Spotify sync failed."
          );
          // Protected server loaders refresh an expired browser access token.
          revalidate();
        }
      }
    };

    void synchronize(needsInitialSync);
    const intervalId = window.setInterval(
      () => void synchronize(needsInitialSync),
      60 * 1000
    );

    return () => {
      active = false;
      accountController.abort();
      cancelSpotifySynchronization(accountId);
      window.clearInterval(intervalId);
    };
  }, [accountId, database, needsInitialSync, revalidate, sdk]);

  useEffect(() => {
    if (!accountId) return;
    const refreshAuthOnWake = () => {
      if (document.visibilityState === "visible") revalidate();
    };
    document.addEventListener("visibilitychange", refreshAuthOnWake);
    window.addEventListener("pageshow", refreshAuthOnWake);
    return () => {
      document.removeEventListener("visibilitychange", refreshAuthOnWake);
      window.removeEventListener("pageshow", refreshAuthOnWake);
    };
  }, [accountId, revalidate]);

  const warning =
    syncWarning || loaderData.localLibraryWarning || loaderData.spotifyWarning;

  return (
    <SidebarLayout playlists={loaderData.playlists} devices={loaderData.devices}>
      {warning && (
        <div
          className="mb-4 flex items-start gap-2 rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm text-amber-100"
          role="status"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{warning}</span>
        </div>
      )}
      <Outlet />
    </SidebarLayout>
  );
}
