import {
  DefaultChatTransport,
  type ChatTransport,
} from "ai";
import {
  LocalStorageCache,
  type CacheManager,
} from "~/toolkit/utils/cache.client";
import type { PlaylistModificationInput } from "./playlistBuilder.types";
import {
  getModificationReconnectingProgress,
  STARTING_MODIFICATION_PROGRESS,
  type PlaylistBuildProgress,
  type PlaylistBuildUIMessage,
} from "./playlistBuildProgress";
import {
  readPlaylistBuildStream,
  type PlaylistBuildStreamTerminal,
} from "./playlistBuildStream.client";

export type PersistedPlaylistModification = {
  jobId: string;
  playlistId: string;
  startedAt: string;
};

export type PlaylistModificationTransport = Pick<
  ChatTransport<PlaylistBuildUIMessage>,
  "sendMessages" | "reconnectToStream"
>;

type RunPlaylistModificationOptions = {
  signal: AbortSignal;
  onProgress: (progress: PlaylistBuildProgress) => void;
  transport?: PlaylistModificationTransport;
  cache?: CacheManager;
};

export function createPlaylistModificationTransport(): PlaylistModificationTransport {
  return new DefaultChatTransport<PlaylistBuildUIMessage>({
    api: "/api/modify-playlist",
    credentials: "same-origin",
    prepareReconnectToStreamRequest: ({ id, headers }) => ({
      api: `/api/modify-playlist?jobId=${encodeURIComponent(id)}`,
      credentials: "same-origin",
      headers,
    }),
  });
}

export async function startPlaylistModification(
  input: PlaylistModificationInput,
  options: RunPlaylistModificationOptions
): Promise<{ playlistId: string }> {
  const cache = options.cache ?? new LocalStorageCache();
  const existing = await readPersistedPlaylistModification(
    input.playlistId,
    cache
  );
  if (existing) {
    return runPlaylistModification(existing, null, { ...options, cache });
  }

  const job: PersistedPlaylistModification = {
    jobId: crypto.randomUUID(),
    playlistId: input.playlistId,
    startedAt: new Date().toISOString(),
  };
  await cache.setItem(getPlaylistModificationCacheKey(input.playlistId), job);
  options.onProgress(STARTING_MODIFICATION_PROGRESS);
  return runPlaylistModification(job, input, { ...options, cache });
}

export async function resumePlaylistModification(
  playlistId: string,
  options: RunPlaylistModificationOptions
): Promise<{ playlistId: string } | null> {
  const cache = options.cache ?? new LocalStorageCache();
  const job = await readPersistedPlaylistModification(playlistId, cache);
  if (!job) return null;

  options.onProgress(getModificationReconnectingProgress(null));
  return runPlaylistModification(job, null, { ...options, cache });
}

export async function hasPersistedPlaylistModification(
  playlistId: string,
  cache: CacheManager = new LocalStorageCache()
): Promise<boolean> {
  return Boolean(await readPersistedPlaylistModification(playlistId, cache));
}

export async function readPersistedPlaylistModification(
  playlistId: string,
  cache: CacheManager = new LocalStorageCache()
): Promise<PersistedPlaylistModification | null> {
  const cacheKey = getPlaylistModificationCacheKey(playlistId);
  const value = await cache.getItem<unknown>(cacheKey);
  if (
    value &&
    typeof value === "object" &&
    "jobId" in value &&
    typeof value.jobId === "string" &&
    isUuid(value.jobId) &&
    "playlistId" in value &&
    value.playlistId === playlistId &&
    "startedAt" in value &&
    typeof value.startedAt === "string"
  ) {
    return value as PersistedPlaylistModification;
  }

  if (value !== null) await cache.removeItem(cacheKey);
  return null;
}

export function getPlaylistModificationCacheKey(playlistId: string): string {
  const normalizedPlaylistId = playlistId.trim();
  if (!normalizedPlaylistId) {
    throw new Error("A Spotify playlist ID is required for playlist tweaks");
  }
  return `playlist-modification-job:${encodeURIComponent(normalizedPlaylistId)}`;
}

async function runPlaylistModification(
  job: PersistedPlaylistModification,
  input: PlaylistModificationInput | null,
  options: RunPlaylistModificationOptions & { cache: CacheManager }
): Promise<{ playlistId: string }> {
  const transport =
    options.transport ?? createPlaylistModificationTransport();
  let lastProgress: PlaylistBuildProgress | null = null;
  let stream: Awaited<
    ReturnType<PlaylistModificationTransport["reconnectToStream"]>
  > = null;
  let firstError: unknown;

  if (input) {
    try {
      stream = await transport.sendMessages({
        trigger: "submit-message",
        chatId: job.jobId,
        messageId: undefined,
        messages: [],
        abortSignal: options.signal,
        body: { jobId: job.jobId, input },
      });
    } catch (error) {
      if (options.signal.aborted) throw error;
      firstError = error;
    }
  }

  let retryCount = 0;
  while (!options.signal.aborted) {
    if (stream) {
      try {
        const terminal = await readPlaylistBuildStream(stream, (data) => {
          if (data.jobId !== job.jobId) return;
          lastProgress = data.progress;
          options.onProgress(data.progress);
        });
        if (terminal) {
          return finishPlaylistModification(job, terminal, options.cache);
        }
      } catch (error) {
        if (options.signal.aborted) throw error;
        firstError ??= error;
      }
    }

    const reconnecting = getModificationReconnectingProgress(lastProgress);
    options.onProgress(reconnecting);
    await waitForReconnect(retryCount, options.signal);

    let reconnectCompleted = false;
    try {
      stream = await transport.reconnectToStream({
        chatId: job.jobId,
        abortSignal: options.signal,
      });
      reconnectCompleted = true;
    } catch (error) {
      if (options.signal.aborted) throw error;
      firstError ??= error;
      stream = null;
      retryCount += 1;
    }
    if (reconnectCompleted && !stream) {
      await options.cache.removeItem(
        getPlaylistModificationCacheKey(job.playlistId)
      );
      throw firstError instanceof Error
        ? firstError
        : new Error("The playlist tweak is no longer available");
    }
  }

  throw options.signal.reason ?? new DOMException("Aborted", "AbortError");
}

async function finishPlaylistModification(
  job: PersistedPlaylistModification,
  terminal: PlaylistBuildStreamTerminal,
  cache: CacheManager
): Promise<{ playlistId: string }> {
  if (
    terminal.data.jobId !== job.jobId ||
    (terminal.type === "completion" &&
      terminal.data.playlistId !== job.playlistId)
  ) {
    await cache.removeItem(getPlaylistModificationCacheKey(job.playlistId));
    throw new Error("Playlist tweak response did not match the active job");
  }

  await cache.removeItem(getPlaylistModificationCacheKey(job.playlistId));
  if (terminal.type === "failure") {
    throw new Error(terminal.data.message);
  }
  return { playlistId: terminal.data.playlistId };
}

function waitForReconnect(retryCount: number, signal: AbortSignal) {
  const delayMs = Math.min(500 * 2 ** Math.min(retryCount, 5), 10_000);
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      return;
    }

    const timeout = setTimeout(() => {
      signal.removeEventListener("abort", handleAbort);
      resolve();
    }, delayMs);
    const handleAbort = () => {
      clearTimeout(timeout);
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", handleAbort, { once: true });
  });
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}
