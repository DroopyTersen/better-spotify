type PlaybackDevice = {
  id?: string | null;
  is_active?: boolean;
};

export type SpotifyPlayer = {
  getAvailableDevices: () => Promise<{ devices: PlaybackDevice[] }>;
  startResumePlayback: (
    deviceId: string,
    contextUri?: string,
    uris?: string[]
  ) => Promise<unknown>;
};

type PlaySpotifyItemOptions = {
  uri: string;
  player: SpotifyPlayer;
  openFallback: (uri: string) => void;
};

export async function playSpotifyItem({
  uri,
  player,
  openFallback,
}: PlaySpotifyItemOptions): Promise<"played" | "fallback"> {
  try {
    const { devices } = await player.getAvailableDevices();
    const device = devices.find(({ is_active }) => is_active) ?? devices[0];
    if (!device?.id) {
      openFallback(uri);
      return "fallback";
    }

    const isTrack = uri.startsWith("spotify:track:");
    await player.startResumePlayback(
      device.id,
      isTrack ? undefined : uri,
      isTrack ? [uri] : undefined
    );
    return "played";
  } catch {
    openFallback(uri);
    return "fallback";
  }
}
