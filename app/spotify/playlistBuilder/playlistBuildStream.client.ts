import {
  DefaultChatTransport,
  readUIMessageStream,
  type ChatTransport,
  type UIMessageChunk,
} from "ai";
import type {
  PlaylistBuildCompletionData,
  PlaylistBuildFailureData,
  PlaylistBuildProgressData,
  PlaylistBuildUIMessage,
} from "./playlistBuildProgress";

export type PlaylistBuildStreamTerminal =
  | { type: "completion"; data: PlaylistBuildCompletionData }
  | { type: "failure"; data: PlaylistBuildFailureData };

export type PlaylistBuildTransport = Pick<
  ChatTransport<PlaylistBuildUIMessage>,
  "sendMessages" | "reconnectToStream"
>;

export function createPlaylistBuildTransport(): PlaylistBuildTransport {
  return new DefaultChatTransport<PlaylistBuildUIMessage>({
    api: "/api/build-playlist",
    credentials: "same-origin",
    prepareReconnectToStreamRequest: ({ id, headers }) => ({
      api: `/api/build-playlist?jobId=${encodeURIComponent(id)}`,
      credentials: "same-origin",
      headers,
    }),
  });
}

export async function readPlaylistBuildStream(
  stream: ReadableStream<UIMessageChunk>,
  onProgress: (progress: PlaylistBuildProgressData) => void
): Promise<PlaylistBuildStreamTerminal | null> {
  let terminal: PlaylistBuildStreamTerminal | null = null;

  for await (const message of readUIMessageStream<PlaylistBuildUIMessage>({
    stream,
    terminateOnError: true,
  })) {
    for (const part of message.parts) {
      if (part.type === "data-progress") {
        onProgress(part.data);
      } else if (part.type === "data-completion") {
        terminal = { type: "completion", data: part.data };
      } else if (part.type === "data-failure") {
        terminal = { type: "failure", data: part.data };
      }
    }
  }

  return terminal;
}
