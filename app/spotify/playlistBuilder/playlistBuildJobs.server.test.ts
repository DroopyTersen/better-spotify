import { describe, expect, test } from "bun:test";
import { readUIMessageStream } from "ai";
import {
  createPlaylistBuildUIMessageResponse,
  createPlaylistBuildUIMessageStream,
  PlaylistBuildJobStore,
} from "./playlistBuildJobs.server";
import {
  CURATING_PLAYLIST_PROGRESS,
  FINDING_TRACKS_PROGRESS,
  type PlaylistBuildUIMessage,
} from "./playlistBuildProgress";

const FIRST_JOB_ID = "11111111-1111-4111-8111-111111111111";
const SECOND_JOB_ID = "22222222-2222-4222-8222-222222222222";

describe("resumable playlist build jobs", () => {
  test("streams typed progress and replays completion to reconnecting clients", async () => {
    const store = new PlaylistBuildJobStore();
    const gate = deferred<void>();

    expect(
      store.start({
        jobId: FIRST_JOB_ID,
        accountId: "listener-a",
        run: async (reportProgress) => {
          reportProgress(FINDING_TRACKS_PROGRESS);
          await gate.promise;
          reportProgress(CURATING_PLAYLIST_PROGRESS);
          return { playlistId: "spotify-playlist" };
        },
        mapError: () => ({ kind: "failed", message: "Build failed" }),
      }).status
    ).toBe("started");

    const stream = createPlaylistBuildUIMessageStream(
      FIRST_JOB_ID,
      "listener-a",
      store
    );
    expect(stream).not.toBeNull();
    const messagesPromise = collectMessages(stream!);
    gate.resolve();

    const messages = await messagesPromise;
    const finalMessage = messages.at(-1);
    expect(finalMessage?.parts).toContainEqual({
      type: "data-progress",
      id: "progress",
      data: {
        jobId: FIRST_JOB_ID,
        progress: CURATING_PLAYLIST_PROGRESS,
      },
    });
    expect(finalMessage?.parts).toContainEqual({
      type: "data-completion",
      id: "completion",
      data: { jobId: FIRST_JOB_ID, playlistId: "spotify-playlist" },
    });

    const replayStream = createPlaylistBuildUIMessageStream(
      FIRST_JOB_ID,
      "listener-a",
      store
    );
    const replay = await collectMessages(replayStream!);
    expect(replay.at(-1)?.parts).toContainEqual({
      type: "data-completion",
      id: "completion",
      data: { jobId: FIRST_JOB_ID, playlistId: "spotify-playlist" },
    });
  });

  test("makes a job idempotent and permits only one active build per account", async () => {
    const store = new PlaylistBuildJobStore();
    const gate = deferred<void>();
    let runs = 0;
    const start = (jobId: string, accountId = "listener-a") =>
      store.start({
        jobId,
        accountId,
        run: async () => {
          runs += 1;
          await gate.promise;
          return { playlistId: "playlist" };
        },
        mapError: () => ({ kind: "failed", message: "Build failed" }),
      });

    expect(start(FIRST_JOB_ID).status).toBe("started");
    expect(start(FIRST_JOB_ID).status).toBe("existing");
    expect(start(SECOND_JOB_ID).status).toBe("conflict");
    expect(start(FIRST_JOB_ID, "listener-b").status).toBe("forbidden");
    expect(runs).toBe(1);

    gate.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(start(SECOND_JOB_ID).status).toBe("started");
  });

  test("uses the AI SDK UI-message SSE protocol and hides other accounts", () => {
    const store = new PlaylistBuildJobStore();
    store.start({
      jobId: FIRST_JOB_ID,
      accountId: "listener-a",
      run: async () => ({ playlistId: "playlist" }),
      mapError: () => ({ kind: "failed", message: "Build failed" }),
    });

    const response = createPlaylistBuildUIMessageResponse(
      FIRST_JOB_ID,
      "listener-a",
      store
    );
    expect(response?.headers.get("content-type")).toBe("text/event-stream");
    expect(response?.headers.get("x-vercel-ai-ui-message-stream")).toBe("v1");
    expect(
      createPlaylistBuildUIMessageResponse(
        FIRST_JOB_ID,
        "listener-b",
        store
      )
    ).toBeNull();
  });

  test("keeps building when a disconnected stream listener throws", async () => {
    const store = new PlaylistBuildJobStore();
    const gate = deferred<void>();
    const runFinished = deferred<void>();
    let reportError: unknown;

    store.start({
      jobId: FIRST_JOB_ID,
      accountId: "listener-a",
      run: async (reportProgress) => {
        await gate.promise;
        try {
          reportProgress(FINDING_TRACKS_PROGRESS);
        } catch (error) {
          reportError = error;
        }
        runFinished.resolve();
        return { playlistId: "spotify-playlist" };
      },
      mapError: () => ({ kind: "failed", message: "Build failed" }),
    });

    let calls = 0;
    store.subscribe(FIRST_JOB_ID, "listener-a", () => {
      calls += 1;
      if (calls > 1) throw new Error("client disconnected");
    });
    gate.resolve();
    await runFinished.promise;
    await Promise.resolve();

    expect(reportError).toBeUndefined();
    expect(store.get(FIRST_JOB_ID, "listener-a")?.terminal).toEqual({
      type: "completion",
      data: { jobId: FIRST_JOB_ID, playlistId: "spotify-playlist" },
    });
  });
});

async function collectMessages(
  stream: NonNullable<ReturnType<typeof createPlaylistBuildUIMessageStream>>
) {
  const messages: PlaylistBuildUIMessage[] = [];
  for await (const message of readUIMessageStream<PlaylistBuildUIMessage>({
    stream,
    terminateOnError: true,
  })) {
    messages.push(message);
  }
  return messages;
}

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
