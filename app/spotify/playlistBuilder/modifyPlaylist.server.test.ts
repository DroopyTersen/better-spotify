import { describe, expect, test } from "bun:test";
import type { SpotifySdk } from "../createSpotifySdk";
import {
  modifyPlaylist,
  PlaylistModificationConflictError,
  type ModifyPlaylistDependencies,
  type PlaylistModificationSource,
} from "./modifyPlaylist.server";
import type { PlaylistModificationInput } from "./playlistBuilder.types";

const sdk = {} as SpotifySdk;
const originalTracks = [
  { id: "track-1", name: "One", artist_name: "Artist" },
  { id: "track-2", name: "Two", artist_name: "Artist" },
];

describe("stale playlist modification protection", () => {
  test("rejects a stale client snapshot before AI work or mutation", async () => {
    let generateCalls = 0;
    let replaceCalls = 0;
    const dependencies = fakes(
      [source("current-snapshot", originalTracks)],
      () => {
        generateCalls += 1;
      },
      () => {
        replaceCalls += 1;
      }
    );

    await expect(
      modifyPlaylist(input("stale-snapshot", originalTracks), sdk, dependencies)
    ).rejects.toBeInstanceOf(PlaylistModificationConflictError);
    expect(generateCalls).toBe(0);
    expect(replaceCalls).toBe(0);
  });

  test("rejects source-track drift before AI work or mutation", async () => {
    let generateCalls = 0;
    let replaceCalls = 0;
    const reorderedTracks = [originalTracks[1]!, originalTracks[0]!];
    const dependencies = fakes(
      [source("snapshot-1", reorderedTracks)],
      () => {
        generateCalls += 1;
      },
      () => {
        replaceCalls += 1;
      }
    );

    await expect(
      modifyPlaylist(input("snapshot-1", originalTracks), sdk, dependencies)
    ).rejects.toBeInstanceOf(PlaylistModificationConflictError);
    expect(generateCalls).toBe(0);
    expect(replaceCalls).toBe(0);
  });

  test("rechecks after AI work and never writes over a newer snapshot", async () => {
    let replaceCalls = 0;
    const dependencies = fakes(
      [
        source("snapshot-1", originalTracks),
        source("snapshot-2", originalTracks),
      ],
      () => undefined,
      () => {
        replaceCalls += 1;
      }
    );

    await expect(
      modifyPlaylist(input("snapshot-1", originalTracks), sdk, dependencies)
    ).rejects.toBeInstanceOf(PlaylistModificationConflictError);
    expect(replaceCalls).toBe(0);
  });

  test("replaces only after both source checks and full resolution succeed", async () => {
    const replacedUris: string[][] = [];
    const dependencies = fakes(
      [
        source("snapshot-1", originalTracks),
        source("snapshot-1", originalTracks),
      ],
      () => undefined,
      (uris) => replacedUris.push(uris)
    );

    const result = await modifyPlaylist(
      input("snapshot-1", originalTracks),
      sdk,
      dependencies
    );

    expect(replacedUris).toEqual([
      ["spotify:track:track-1", "spotify:track:track-2"],
    ]);
    expect(result.snapshotId).toBe("snapshot-after-write");
  });

  test("rejects duplicate resolved tracks without mutating Spotify", async () => {
    let replaceCalls = 0;
    const dependencies = fakes(
      [source("snapshot-1", originalTracks)],
      () => undefined,
      () => {
        replaceCalls += 1;
      }
    );
    dependencies.resolveTracks = async () => [
      originalTracks[0]!,
      originalTracks[0]!,
    ];

    await expect(
      modifyPlaylist(
        input("snapshot-1", originalTracks),
        sdk,
        dependencies
      )
    ).rejects.toThrow("could not be found");
    expect(replaceCalls).toBe(0);
  });
});

function source(
  snapshotId: string,
  tracks: PlaylistModificationInput["currentTracks"]
): PlaylistModificationSource {
  return { snapshotId, tracks };
}

function input(
  snapshotId: string,
  currentTracks: PlaylistModificationInput["currentTracks"]
): PlaylistModificationInput {
  return {
    playlistId: "playlist-1",
    snapshotId,
    instructions: "Keep the playlist exactly as it is",
    currentTracks,
  };
}

function fakes(
  sources: PlaylistModificationSource[],
  onGenerate: () => void,
  onReplace: (uris: string[]) => void
): ModifyPlaylistDependencies {
  return {
    async loadSource() {
      const next = sources.shift();
      if (!next) throw new Error("Unexpected source load");
      return next;
    },
    async generateModification(input) {
      onGenerate();
      return {
        modifiedPlaylist: {
          name: "Unchanged",
          tracks: input.currentTracks,
        },
      };
    },
    async resolveTracks(tracks) {
      return tracks;
    },
    async replaceItems(_sdk, _playlistId, uris) {
      onReplace(uris);
      return { snapshot_id: "snapshot-after-write" };
    },
  };
}
