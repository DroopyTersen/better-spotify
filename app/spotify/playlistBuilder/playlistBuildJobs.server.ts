import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type InferUIMessageChunk,
  type UIMessageStreamWriter,
} from "ai";
import { createSingleton } from "~/toolkit/utils/createSingleton";
import {
  STARTING_BUILD_PROGRESS,
  type PlaylistBuildCompletionData,
  type PlaylistBuildFailureData,
  type PlaylistBuildProgress,
  type PlaylistBuildProgressData,
  type PlaylistBuildUIMessage,
} from "./playlistBuildProgress";

const TERMINAL_JOB_TTL_MS = 60 * 60 * 1000;
const STREAM_HEARTBEAT_MS = 10_000;

type PlaylistBuildTerminalState =
  | { type: "completion"; data: PlaylistBuildCompletionData }
  | { type: "failure"; data: PlaylistBuildFailureData };

export type PlaylistBuildJobSnapshot = {
  progress: PlaylistBuildProgressData;
  terminal: PlaylistBuildTerminalState | null;
};

type PlaylistBuildJob = {
  id: string;
  accountId: string;
  updatedAt: number;
  snapshot: PlaylistBuildJobSnapshot;
  listeners: Set<(snapshot: PlaylistBuildJobSnapshot) => void>;
};

export type StartPlaylistBuildJobResult =
  | { status: "started" | "existing"; job: PlaylistBuildJobSnapshot }
  | { status: "conflict" | "forbidden" };

export class PlaylistBuildJobStore {
  private readonly jobs = new Map<string, PlaylistBuildJob>();
  private readonly activeJobByAccount = new Map<string, string>();

  constructor(private readonly now: () => number = Date.now) {}

  start({
    jobId,
    accountId,
    run,
    mapError,
  }: {
    jobId: string;
    accountId: string;
    run: (
      reportProgress: (progress: PlaylistBuildProgress) => void
    ) => Promise<{ playlistId: string }>;
    mapError: (
      error: unknown
    ) => Omit<PlaylistBuildFailureData, "jobId">;
  }): StartPlaylistBuildJobResult {
    this.prune();

    const existing = this.jobs.get(jobId);
    if (existing) {
      if (existing.accountId !== accountId) return { status: "forbidden" };
      return { status: "existing", job: existing.snapshot };
    }

    const activeJobId = this.activeJobByAccount.get(accountId);
    if (activeJobId && this.jobs.get(activeJobId)?.snapshot.terminal === null) {
      return { status: "conflict" };
    }

    const timestamp = this.now();
    const job: PlaylistBuildJob = {
      id: jobId,
      accountId,
      updatedAt: timestamp,
      snapshot: {
        progress: {
          jobId,
          progress: STARTING_BUILD_PROGRESS,
        },
        terminal: null,
      },
      listeners: new Set(),
    };
    this.jobs.set(jobId, job);
    this.activeJobByAccount.set(accountId, jobId);

    void (async () => {
      try {
        const result = await run((progress) => {
          this.updateProgress(job, progress);
        });
        this.finish(job, {
          type: "completion",
          data: { jobId, playlistId: result.playlistId },
        });
      } catch (error) {
        this.finish(job, {
          type: "failure",
          data: { jobId, ...mapError(error) },
        });
      }
    })();

    return { status: "started", job: job.snapshot };
  }

  get(jobId: string, accountId: string): PlaylistBuildJobSnapshot | null {
    this.prune();
    const job = this.jobs.get(jobId);
    return job?.accountId === accountId ? job.snapshot : null;
  }

  subscribe(
    jobId: string,
    accountId: string,
    listener: (snapshot: PlaylistBuildJobSnapshot) => void
  ): (() => void) | null {
    const job = this.jobs.get(jobId);
    if (!job || job.accountId !== accountId) return null;

    listener(job.snapshot);
    if (job.snapshot.terminal) return () => undefined;

    job.listeners.add(listener);
    return () => {
      job.listeners.delete(listener);
    };
  }

  private updateProgress(
    job: PlaylistBuildJob,
    progress: PlaylistBuildProgress
  ) {
    if (job.snapshot.terminal) return;
    const previousPercent = job.snapshot.progress.progress.percent;
    const nextProgress = {
      ...progress,
      percent: Math.max(
        previousPercent,
        Math.min(100, Math.max(0, progress.percent))
      ),
    };
    job.updatedAt = this.now();
    job.snapshot = {
      ...job.snapshot,
      progress: { jobId: job.id, progress: nextProgress },
    };
    this.publish(job);
  }

  private finish(job: PlaylistBuildJob, terminal: PlaylistBuildTerminalState) {
    if (job.snapshot.terminal) return;
    job.updatedAt = this.now();
    job.snapshot = { ...job.snapshot, terminal };
    if (this.activeJobByAccount.get(job.accountId) === job.id) {
      this.activeJobByAccount.delete(job.accountId);
    }
    this.publish(job);
    job.listeners.clear();
  }

  private publish(job: PlaylistBuildJob) {
    for (const listener of job.listeners) {
      try {
        listener(job.snapshot);
      } catch {
        // A browser closing its stream must never be able to abort the job.
        job.listeners.delete(listener);
      }
    }
  }

  private prune() {
    const oldestTerminalJob = this.now() - TERMINAL_JOB_TTL_MS;
    for (const [jobId, job] of this.jobs) {
      if (job.snapshot.terminal && job.updatedAt < oldestTerminalJob) {
        this.jobs.delete(jobId);
      }
    }
  }
}

export const playlistBuildJobs = createSingleton(
  "better-spotify-playlist-build-jobs",
  () => new PlaylistBuildJobStore()
);

export function createPlaylistBuildUIMessageStream(
  jobId: string,
  accountId: string,
  store: PlaylistBuildJobStore = playlistBuildJobs
): ReadableStream<InferUIMessageChunk<PlaylistBuildUIMessage>> | null {
  if (!store.get(jobId, accountId)) return null;

  return createUIMessageStream<PlaylistBuildUIMessage>({
    execute: async ({ writer }) => {
      let latestSnapshot: PlaylistBuildJobSnapshot | null = null;
      const subscription: { unsubscribe: (() => void) | null } = {
        unsubscribe: null,
      };
      let heartbeat: ReturnType<typeof setInterval> | null = null;

      try {
        await new Promise<void>((resolve) => {
          subscription.unsubscribe = store.subscribe(
            jobId,
            accountId,
            (snapshot) => {
              latestSnapshot = snapshot;
              writeSnapshot(writer, snapshot);
              if (snapshot.terminal) resolve();
            }
          );

          if (!subscription.unsubscribe) {
            resolve();
            return;
          }

          heartbeat = setInterval(() => {
            if (latestSnapshot && !latestSnapshot.terminal) {
              writer.write({
                type: "data-progress",
                id: "progress",
                data: latestSnapshot.progress,
              });
            }
          }, STREAM_HEARTBEAT_MS);
        });
      } finally {
        if (heartbeat) clearInterval(heartbeat);
        subscription.unsubscribe?.();
      }
    },
    onError: () => "The playlist progress stream was interrupted.",
  });
}

export function createPlaylistBuildUIMessageResponse(
  jobId: string,
  accountId: string,
  store: PlaylistBuildJobStore = playlistBuildJobs
): Response | null {
  const stream = createPlaylistBuildUIMessageStream(jobId, accountId, store);
  return stream
    ? createUIMessageStreamResponse({
        stream,
        headers: { "Cache-Control": "private, no-cache, no-transform" },
      })
    : null;
}

function writeSnapshot(
  writer: UIMessageStreamWriter<PlaylistBuildUIMessage>,
  snapshot: PlaylistBuildJobSnapshot
) {
  writer.write({
    type: "data-progress",
    id: "progress",
    data: snapshot.progress,
  });

  if (snapshot.terminal?.type === "completion") {
    writer.write({
      type: "data-completion",
      id: "completion",
      data: snapshot.terminal.data,
    });
  } else if (snapshot.terminal?.type === "failure") {
    writer.write({
      type: "data-failure",
      id: "failure",
      data: snapshot.terminal.data,
    });
  }
}
