export const OPTIONAL_SPOTIFY_BOOT_TIMEOUT_MS = 5_000;

type OptionalSpotifyBootTasks<Playlists, Devices> = {
  playlists: Promise<Playlists>;
  devices: Promise<Devices>;
};

type OptionalSpotifyBootOptions<Playlists, Devices> = {
  createTasks: (
    signal: AbortSignal
  ) => OptionalSpotifyBootTasks<Playlists, Devices>;
  timeoutMs?: number;
};

type SettledValue<Value> = {
  failed: boolean;
  settled: boolean;
  value: Value | null;
};

const pendingValue = <Value>(): SettledValue<Value> => ({
  failed: false,
  settled: false,
  value: null,
});

/**
 * Gives non-essential Spotify data one shared, abortable boot window. A valid
 * account session must still render when either provider request is slow or
 * unavailable; any result that did finish before the deadline is retained.
 */
export async function loadOptionalSpotifyBootData<Playlists, Devices>({
  createTasks,
  timeoutMs = OPTIONAL_SPOTIFY_BOOT_TIMEOUT_MS,
}: OptionalSpotifyBootOptions<Playlists, Devices>) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
    throw new RangeError("Spotify boot timeout must be a positive safe integer");
  }

  const controller = new AbortController();
  const playlists = pendingValue<Playlists>();
  const devices = pendingValue<Devices>();
  let tasks: OptionalSpotifyBootTasks<Playlists, Devices>;

  try {
    tasks = createTasks(controller.signal);
  } catch {
    return { playlists: null, devices: null, unavailable: true };
  }

  const settle = async <Value>(
    promise: Promise<Value>,
    state: SettledValue<Value>
  ) => {
    try {
      state.value = await promise;
    } catch {
      state.failed = true;
    } finally {
      state.settled = true;
    }
  };

  const providerTasks = Promise.all([
    settle(tasks.playlists, playlists),
    settle(tasks.devices, devices),
  ]);
  let timedOut = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort(new Error("Optional Spotify boot data timed out"));
      resolve();
    }, timeoutMs);
    if (typeof timeoutId === "object" && "unref" in timeoutId) {
      timeoutId.unref();
    }
  });

  await Promise.race([providerTasks, timeout]);
  if (timeoutId) clearTimeout(timeoutId);

  return {
    playlists: playlists.settled && !playlists.failed ? playlists.value : null,
    devices: devices.settled && !devices.failed ? devices.value : null,
    unavailable:
      timedOut ||
      playlists.failed ||
      devices.failed ||
      !playlists.settled ||
      !devices.settled,
  };
}
