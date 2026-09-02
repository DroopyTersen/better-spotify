import type { AccountDatabase } from "~/db/db.client";
import { EventEmitter } from "~/toolkit/utils/EventEmitter";
import { CacheManager, LocalStorageCache } from "~/toolkit/utils/cache.client";
import { createHash } from "~/toolkit/utils/createHash.client";
import { SpotifySdk } from "../createSpotifySdk";
import { SpotifyData, spotifyDb } from "../spotify.db";
import { syncNewArtists, syncNewTracks } from "../sync/syncNewItems";
import type { SpotifySyncContext } from "../sync/syncContext";
import { spotifyWebApi } from "../api/spotifyWebApi";
import {
  buildFamiliarSongsPool,
  createFamiliarSongPoolDependencies,
  getBuildFamiliarSongPoolInput,
} from "./buildFamiliarSongPool";
import {
  BuildPlaylistFormData,
  BuildPlaylistInput,
  FamiliarSongsPool,
  PlaylistBuilderData,
  SelectedPlaylistArtist,
  SelectedPlaylistTrack,
} from "./playlistBuilder.types";
import {
  readPersistedPlaylistBuild,
  readPlaylistBuilderCacheState,
  type PersistedPlaylistBuild,
} from "./playlistBuilderCache.client";
import {
  getReconnectingProgress,
  PREPARING_PLAYLIST_PROGRESS,
  type PlaylistBuildProgress,
} from "./playlistBuildProgress";
import {
  createPlaylistBuildTransport,
  readPlaylistBuildStream,
  type PlaylistBuildStreamTerminal,
  type PlaylistBuildTransport,
} from "./playlistBuildStream.client";

export type BuildPlaylistResult = {
  playlist: { id: string };
};

export class PlaylistBuildResidualClientError extends Error {
  constructor() {
    super(
      "Spotify may have left a partial playlist in your library. Check Spotify before retrying."
    );
    this.name = "PlaylistBuildResidualClientError";
  }
}

export class PlaylistBuildingService extends EventEmitter<void> {
  private static LEGACY_CACHE_KEY = "playlist-builder-state";
  private cacheKey: string;
  private buildCacheKey: string;
  private cache: CacheManager;
  private accountId: string;
  private database: AccountDatabase | null;
  private syncController = new AbortController();
  private buildClientController = new AbortController();
  private buildTransport: PlaylistBuildTransport;
  private hydrationPromise: Promise<void>;
  private activeBuildPromise: Promise<BuildPlaylistResult> | null = null;
  private activeBuild: PersistedPlaylistBuild | null = null;
  private isBuilding = false;
  private buildProgress: PlaylistBuildProgress | null = null;
  private disposed = false;
  sdk: SpotifySdk;
  spotifyData: SpotifyData;
  familiarSongsPool: FamiliarSongsPool | null = null;

  private _formData: BuildPlaylistFormData = {
    newStuffAmount: "sprinkle",
    songCount: 32,
    customInstructions: "",
  };
  private _selectedTracks: SelectedPlaylistTrack[] = [];
  private _selectedArtists: SelectedPlaylistArtist[] = [];

  private lastWarmUp: {
    hash: string;
    promise: Promise<void>;
  } | null = null;

  constructor(
    sdk: SpotifySdk,
    spotifyData: SpotifyData,
    accountId: string,
    database: AccountDatabase | null,
    buildTransport: PlaylistBuildTransport = createPlaylistBuildTransport(),
    cache: CacheManager = new LocalStorageCache()
  ) {
    super();
    this.cacheKey = getPlaylistBuilderCacheKey(accountId);
    this.buildCacheKey = getPlaylistBuildCacheKey(accountId);
    this.accountId = accountId;
    this.database = database;
    this.sdk = sdk;
    this.spotifyData = spotifyData;
    this.cache = cache;
    this.buildTransport = buildTransport;
    // Hydrate state from localStorage
    this.hydrationPromise = this.hydrateFromCache();
  }

  private hydrateFromCache = async () => {
    await this.cache.removeItem(PlaylistBuildingService.LEGACY_CACHE_KEY);
    const [state, activeBuild] = await Promise.all([
      readPlaylistBuilderCacheState(this.cache, this.cacheKey),
      readPersistedPlaylistBuild(this.cache, this.buildCacheKey),
    ]);
    if (state) {
      this._selectedTracks = state.selectedTracks;
      this._selectedArtists = state.selectedArtists;
      this.familiarSongsPool = state.familiarSongsPool;
      if (state.formData) {
        this._formData = state.formData;
      }
    }

    if (activeBuild) {
      this.activeBuild = activeBuild;
      this.isBuilding = true;
      this.buildProgress = getReconnectingProgress(null);
    }

    if (state || activeBuild) {
      setTimeout(() => this.emit(), 0);
      setTimeout(() => this.emit(), 750);
    }
  };
  private triggerChange = async () => {
    this.familiarSongsPool = null;
    await this.saveSelectionToCache();
    this.emit();
  };

  public clearSelections = async (): Promise<void> => {
    this._selectedArtists = [];
    this._selectedTracks = [];
    this._formData = {
      newStuffAmount: "sprinkle",
      songCount: 32,
      customInstructions: "",
    };
    this.lastWarmUp = null;
    await this.cache.removeItem(this.cacheKey);
    await this.triggerChange();
  };

  getSelectedTracks = () => {
    return this._selectedTracks;
  };
  getSelectedArtists = () => {
    return this._selectedArtists;
  };

  updateSdk = (sdk: SpotifySdk) => {
    this.sdk = sdk;
  };

  updateSpotifyData = (spotifyData: SpotifyData) => {
    this.spotifyData = spotifyData;
  };

  updateDatabase = (database: AccountDatabase | null) => {
    if (database && database.accountId !== this.accountId) {
      throw new Error("Playlist builder database belongs to another account");
    }
    this.database = database;
  };

  dispose = () => {
    this.disposed = true;
    this.syncController.abort();
    this.buildClientController.abort();
  };

  private getSyncContext = (): SpotifySyncContext | null => {
    if (!this.database) return null;
    const signal = this.syncController.signal;
    return {
      accountId: this.accountId,
      database: this.database,
      signal,
      isCurrent: () => !signal.aborted,
    };
  };

  private loadArtists = async (artistIds: string[]) => {
    if (!this.database) return;
    const artists = await spotifyDb.getArtistsByIds(
      this.database.db,
      artistIds
    );
    this._selectedArtists = mergeCanonicalSelections(
      this._selectedArtists,
      artists,
      ({ artist_id }) => artist_id
    );
  };

  private loadTracks = async (trackIds: string[]) => {
    if (!this.database) return;
    const tracks = await spotifyDb.getTracksByIds(
      this.database.db,
      trackIds
    );
    this._selectedTracks = mergeCanonicalSelections(
      this._selectedTracks,
      tracks,
      ({ track_id }) => track_id
    );
  };
  private buildFamiliarSongsPool = async (): Promise<FamiliarSongsPool> => {
    let input = await getBuildFamiliarSongPoolInput(this.spotifyData, {
      selectedArtistIds: this._selectedArtists.map((a) => a.artist_id),
      selectedTrackIds: this._selectedTracks.map((t) => t.track_id),
    });
    return buildFamiliarSongsPool(
      input,
      createFamiliarSongPoolDependencies(this.sdk)
    );
  };

  private async getSelectionsHash(): Promise<string> {
    const selectionsString = JSON.stringify({
      artists: this._selectedArtists.map((a) => a.artist_id).sort(),
      tracks: this._selectedTracks.map((t) => t.track_id).sort(),
      formData: this._formData,
    });
    return createHash(selectionsString);
  }

  private async saveSelectionToCache() {
    try {
      const cacheData: PlaylistBuilderData = {
        hashedSelection: await this.getSelectionsHash(),
        selectedTracks: this._selectedTracks,
        selectedArtists: this._selectedArtists,
        // Clear computed results when selection changes
        familiarSongsPool: null,
        formData: this._formData,
      };
      await this.cache.setItem(this.cacheKey, cacheData);
    } catch {
      console.error("Failed to save playlist-builder selection state");
    }
  }

  private async saveComputedResults(
    expectedHash: string,
    familiarSongsPool: FamiliarSongsPool
  ) {
    try {
      const currentCache = await readPlaylistBuilderCacheState(
        this.cache,
        this.cacheKey
      );
      if (!currentCache || currentCache.hashedSelection !== expectedHash) return;

      await this.cache.setItem(this.cacheKey, {
        ...currentCache,
        familiarSongsPool,
      });
    } catch {
      console.error("Failed to save playlist-builder computed results");
    }
  }

  warmUpPlaylist = async (
    reportProgress?: (progress: PlaylistBuildProgress) => void
  ) => {
    const currentHash = await this.getSelectionsHash();

    // If there's an ongoing warm-up operation for the same hash, return its promise
    if (
      this.lastWarmUp &&
      this.lastWarmUp.promise &&
      currentHash === this.lastWarmUp.hash
    ) {
      return this.lastWarmUp.promise;
    }
    // Check if we have valid cached results
    const cachedState = await readPlaylistBuilderCacheState(
      this.cache,
      this.cacheKey
    );
    if (cachedState?.hashedSelection === currentHash) {
      if (cachedState.familiarSongsPool) {
        this.familiarSongsPool = cachedState.familiarSongsPool;
        this.lastWarmUp = {
          hash: currentHash,
          promise: Promise.resolve(),
        };
        return this.lastWarmUp.promise;
      }
    }

    // Create and store the promise for this warm-up operation
    this.lastWarmUp = {
      hash: currentHash,
      promise: (async () => {
        try {
          reportProgress?.(PREPARING_PLAYLIST_PROGRESS);
          const familiarSongsPool = await this.buildFamiliarSongsPool();

          if ((await this.getSelectionsHash()) !== currentHash) return;

          this.familiarSongsPool = familiarSongsPool;
          await this.saveComputedResults(currentHash, familiarSongsPool);
        } finally {
          if (this.lastWarmUp?.hash === currentHash) {
            this.lastWarmUp = null;
          }
        }
      })(),
    };

    return this.lastWarmUp.promise;
  };

  public getState = () => {
    return {
      selectedArtists: this._selectedArtists,
      selectedTracks: this._selectedTracks,
      selectedTrackIds: this._selectedTracks.map((t) => t.track_id),
      selectedArtistIds: this._selectedArtists.map((a) => a.artist_id),
      formData: this._formData,
      isBuilding: this.isBuilding,
      buildProgress: this.buildProgress,
      totalSelectedCount:
        this._selectedArtists.length + this._selectedTracks.length,
    };
  };

  public toggleArtistSelection = async (artistId: string): Promise<void> => {
    if (this._selectedArtists.some((a) => a.artist_id === artistId)) {
      this._selectedArtists = this._selectedArtists.filter(
        (a) => a.artist_id !== artistId
      );
      this.lastWarmUp = null;
      await this.triggerChange();
      return;
    } else {
      const optimisticSelection: SelectedPlaylistArtist = {
        artist_id: artistId,
      };
      this.lastWarmUp = null;
      await enrichOptimisticSelection({
        optimisticSelection,
        getSelections: () => this._selectedArtists,
        setSelections: (selections) => {
          this._selectedArtists = selections;
        },
        publish: this.triggerChange,
        enrich: async () => {
          const context = this.getSyncContext();
          if (context) {
            await syncNewArtists(this.sdk, [artistId], context);
            await this.loadArtists([artistId]);
          } else {
            const artists = await spotifyWebApi.getArtists(this.sdk, [artistId]);
            this._selectedArtists = mergeCanonicalSelections(
              this._selectedArtists,
              artists.map((artist) => ({
                artist_id: artist.id,
                artist_name: artist.name,
                images: artist.images,
              })),
              ({ artist_id }) => artist_id
            );
          }

          if (this._selectedArtists.includes(optimisticSelection)) {
            throw new Error("Spotify did not return the selected artist");
          }
        },
      });
    }
  };

  public toggleTrackSelection = async (trackId: string): Promise<void> => {
    if (this._selectedTracks.some((t) => t.track_id === trackId)) {
      this._selectedTracks = this._selectedTracks.filter(
        (t) => t.track_id !== trackId
      );
      this.lastWarmUp = null;
      await this.triggerChange();
      return;
    } else {
      const optimisticSelection: SelectedPlaylistTrack = { track_id: trackId };
      this.lastWarmUp = null;
      await enrichOptimisticSelection({
        optimisticSelection,
        getSelections: () => this._selectedTracks,
        setSelections: (selections) => {
          this._selectedTracks = selections;
        },
        publish: this.triggerChange,
        enrich: async () => {
          const context = this.getSyncContext();
          if (context) {
            await syncNewTracks(this.sdk, [trackId], context);
            await this.loadTracks([trackId]);
          } else {
            const tracks = await spotifyWebApi.getTracks(this.sdk, [trackId]);
            this._selectedTracks = mergeCanonicalSelections(
              this._selectedTracks,
              tracks.map((track) => ({
                track_id: track.id,
                track_name: track.name,
                artist_id: track.artists[0]?.id,
                artist_name: track.artists[0]?.name,
                images: track.album.images,
              })),
              ({ track_id }) => track_id
            );
          }

          if (this._selectedTracks.includes(optimisticSelection)) {
            throw new Error("Spotify did not return the selected track");
          }
        },
      });
    }
  };

  public addAlbumToSelection = async (albumId: string): Promise<void> => {
    try {
      // Load the complete album before mutating the selection. The adapter
      // rejects inconsistent pagination instead of silently adding a prefix.
      const albumTracks = await spotifyWebApi.getAlbumTracks(
        this.sdk,
        albumId
      );

      // Get full track details for each track
      const trackIds = albumTracks.map((track) => track.id);
      const fullTracks = await spotifyWebApi.getTracks(this.sdk, trackIds);

      // Transform tracks to our format and add them
      const tracksToAdd = fullTracks.map((track) => ({
        track_id: track.id,
        track_name: track.name,
        artist_id: track.artists[0]?.id,
        artist_name: track.artists[0]?.name,
        images: track.album.images,
      }));

      const context = this.getSyncContext();
      if (context) {
        await syncNewTracks(
          this.sdk,
          tracksToAdd.map((t) => t.track_id),
          context
        );
      }

      // Filter against the latest state after all fallible enrichment work.
      const newTracks = tracksToAdd.filter(
        (track) =>
          !this._selectedTracks.some((t) => t.track_id === track.track_id)
      );
      this._selectedTracks = [...this._selectedTracks, ...newTracks];
      this.lastWarmUp = null;
      await this.triggerChange();
    } catch (error) {
      console.error("Failed to add album tracks");
      throw error;
    }
  };

  public updateFormData = <TKey extends keyof BuildPlaylistFormData>(
    key: TKey,
    value: BuildPlaylistFormData[TKey]
  ) => {
    this._formData[key] = value;
    this.saveSelectionToCache();
    this.emit();
  };

  public buildPlaylist = async (): Promise<BuildPlaylistResult> => {
    await this.hydrationPromise;
    if (this.activeBuild) {
      const resumed = await this.resumePlaylistBuild();
      if (resumed) return resumed;
    }

    return this.runBuildOperation(async () => {
      this.setBuildProgress(PREPARING_PLAYLIST_PROGRESS);
      await this.warmUpPlaylist((progress) => this.setBuildProgress(progress));
      const state = this.getState();
      if (!this.familiarSongsPool) {
        throw new Error("No familiar songs pool to build playlist from");
      }

      const input = {
        formData: this._formData,
        data: {
          selectedTracks: state.selectedTracks || [],
          selectedArtists: state.selectedArtists || [],
          familiarSongsPool: this.familiarSongsPool,
          formData: this._formData,
        },
      } satisfies BuildPlaylistInput;
      const jobId = crypto.randomUUID();
      this.activeBuild = {
        jobId,
        selectionHash: await this.getSelectionsHash(),
        startedAt: new Date().toISOString(),
      };
      await this.cache.setItem(this.buildCacheKey, this.activeBuild);
      this.emit();

      try {
        const stream = await this.buildTransport.sendMessages({
          trigger: "submit-message",
          chatId: jobId,
          messageId: undefined,
          messages: [],
          abortSignal: this.buildClientController.signal,
          body: { jobId, input },
        });
        return this.followBuildStream(jobId, stream);
      } catch (error) {
        if (
          this.buildClientController.signal.aborted ||
          this.activeBuild?.jobId !== jobId
        ) {
          throw error;
        }
        return this.reconnectToBuild(jobId);
      }
    });
  };

  public resumePlaylistBuild = async (): Promise<BuildPlaylistResult | null> => {
    await this.hydrationPromise;
    const jobId = this.activeBuild?.jobId;
    if (!jobId) return null;

    return this.runBuildOperation(() => this.reconnectToBuild(jobId));
  };

  private runBuildOperation(
    operation: () => Promise<BuildPlaylistResult>
  ): Promise<BuildPlaylistResult> {
    if (this.activeBuildPromise) return this.activeBuildPromise;

    this.isBuilding = true;
    this.emit();
    const promise = operation().finally(() => {
      if (this.activeBuildPromise !== promise) return;
      this.activeBuildPromise = null;
      if (!this.activeBuild) {
        this.isBuilding = false;
        this.buildProgress = null;
      }
      this.emit();
    });
    this.activeBuildPromise = promise;
    return promise;
  }

  private async reconnectToBuild(jobId: string): Promise<BuildPlaylistResult> {
    let retryCount = 0;

    while (!this.disposed && this.activeBuild?.jobId === jobId) {
      this.setBuildProgress(getReconnectingProgress(this.buildProgress));
      await waitForReconnect(retryCount, this.buildClientController.signal);

      try {
        const stream = await this.buildTransport.reconnectToStream({
          chatId: jobId,
          abortSignal: this.buildClientController.signal,
        });
        if (!stream) {
          await this.clearActiveBuild(jobId);
          throw new Error("The playlist build is no longer available");
        }
        return await this.followBuildStream(jobId, stream);
      } catch (error) {
        if (this.buildClientController.signal.aborted) throw error;
        if (!this.activeBuild || this.activeBuild.jobId !== jobId) throw error;
        retryCount += 1;
      }
    }

    throw new Error("The playlist build was interrupted");
  }

  private async followBuildStream(
    jobId: string,
    stream: Parameters<typeof readPlaylistBuildStream>[0]
  ): Promise<BuildPlaylistResult> {
    const terminal = await readPlaylistBuildStream(stream, (data) => {
      if (data.jobId === jobId && this.activeBuild?.jobId === jobId) {
        this.setBuildProgress(data.progress);
      }
    });

    if (!terminal) return this.reconnectToBuild(jobId);
    return this.finishBuildFromStream(jobId, terminal);
  }

  private async finishBuildFromStream(
    jobId: string,
    terminal: PlaylistBuildStreamTerminal
  ): Promise<BuildPlaylistResult> {
    if (terminal.data.jobId !== jobId) {
      throw new Error("Playlist build response did not match the active job");
    }

    await this.clearActiveBuild(jobId);
    if (terminal.type === "failure") {
      if (terminal.data.kind === "residual") {
        throw new PlaylistBuildResidualClientError();
      }
      throw new Error(terminal.data.message);
    }

    return { playlist: { id: terminal.data.playlistId } };
  }

  private setBuildProgress(progress: PlaylistBuildProgress) {
    this.isBuilding = true;
    this.buildProgress = progress;
    this.emit();
  }

  private async clearActiveBuild(jobId: string) {
    if (this.activeBuild?.jobId !== jobId) return;
    this.activeBuild = null;
    await this.cache.removeItem(this.buildCacheKey);
  }
}

export function mergeCanonicalSelections<Selection>(
  current: Selection[],
  canonical: Selection[],
  getId: (selection: Selection) => string | null | undefined
): Selection[] {
  const canonicalById = new Map(
    canonical.flatMap((selection) => {
      const id = getId(selection);
      return id ? [[id, selection] as const] : [];
    })
  );
  return current.map((selection) => {
    const id = getId(selection);
    return (id && canonicalById.get(id)) || selection;
  });
}

export async function enrichOptimisticSelection<Selection>({
  optimisticSelection,
  getSelections,
  setSelections,
  enrich,
  publish,
}: {
  optimisticSelection: Selection;
  getSelections: () => Selection[];
  setSelections: (selections: Selection[]) => void;
  enrich: () => Promise<void>;
  publish: () => Promise<void>;
}): Promise<void> {
  setSelections([...getSelections(), optimisticSelection]);
  await publish();

  try {
    await enrich();
  } catch (error) {
    setSelections(
      getSelections().filter(
        (selection) => selection !== optimisticSelection
      )
    );
    await publish();
    throw error;
  }

  await publish();
}

export function getPlaylistBuilderCacheKey(accountId: string): string {
  const normalizedAccountId = accountId.trim();
  if (!normalizedAccountId) {
    throw new Error(
      "A Spotify account ID is required for playlist-builder state"
    );
  }
  return `playlist-builder-state:${encodeURIComponent(normalizedAccountId)}`;
}

export function getPlaylistBuildCacheKey(accountId: string): string {
  const normalizedAccountId = accountId.trim();
  if (!normalizedAccountId) {
    throw new Error("A Spotify account ID is required for playlist builds");
  }
  return `playlist-builder-build:${encodeURIComponent(normalizedAccountId)}`;
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
