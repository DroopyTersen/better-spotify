import { DB, getDb } from "~/db/db.client";
import { EventEmitter } from "~/toolkit/utils/EventEmitter";
import { CacheManager, LocalStorageCache } from "~/toolkit/utils/cache.client";
import { createHash } from "~/toolkit/utils/createHash.client";
import { jsonRequest } from "~/toolkit/utils/fetch.utils";
import { SpotifySdk } from "../createSpotifySdk";
import { SpotifyData, spotifyDb } from "../spotify.db";
import { syncNewArtists, syncNewTracks } from "../sync/syncNewItems";
import type { BuildPlaylistResult } from "./api.buildPlaylist.route";
import {
  buildFamiliarSongsPool,
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

export class PlaylistBuildingService extends EventEmitter<void> {
  private static CACHE_KEY = "playlist-builder-state";
  private cache: CacheManager;
  sdk: SpotifySdk;
  db: DB;
  spotifyData: SpotifyData;
  familiarSongsPool: FamiliarSongsPool | null = null;
  newArtists: Array<SelectedPlaylistArtist> = [];

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

  constructor(sdk: SpotifySdk, spotifyData: SpotifyData) {
    super();
    this.sdk = sdk;
    this.db = getDb();
    this.spotifyData = spotifyData;
    this.cache = new LocalStorageCache();
    // Hydrate state from localStorage
    this.hydrateFromCache();
  }

  private hydrateFromCache = async () => {
    const state = await this.cache.getItem<PlaylistBuilderData>(
      PlaylistBuildingService.CACHE_KEY
    );
    console.log("🚀 | hydrateFromCache | state:", state);
    if (state) {
      this._selectedTracks = state.selectedTracks;
      this._selectedArtists = state.selectedArtists;
      this.familiarSongsPool = state.familiarSongsPool;
      this.newArtists = state.recommendedArtists;
      if (state.formData) {
        this._formData = state.formData;
      }
      setTimeout(() => {
        this.emit();
      }, 750);

      setTimeout(() => {
        this.emit();
      }, 3000);
    }
  };
  private triggerChange = async () => {
    this.familiarSongsPool = null;
    this.newArtists = [];
    await this.saveSelectionToCache();
    this.emit();
  };

  public clearSelections = async () => {
    this._selectedArtists = [];
    this._selectedTracks = [];
    this._formData = {
      newStuffAmount: "sprinkle",
      songCount: 32,
      customInstructions: "",
    };
    this.lastWarmUp = null;
    await this.cache.removeItem(PlaylistBuildingService.CACHE_KEY);
    this.triggerChange();
  };

  getSelectedTracks = () => {
    return this._selectedTracks;
  };
  getSelectedArtists = () => {
    return this._selectedArtists;
  };

  private loadArtists = async () => {
    const artists = await spotifyDb.getArtistsByIds(
      this.db,
      this._selectedArtists.map((a) => a.artist_id)
    );
    this._selectedArtists = artists;
  };

  private loadTracks = async () => {
    const tracks = await spotifyDb.getTracksByIds(
      this.db,
      this._selectedTracks.map((t) => t.track_id)
    );
    this._selectedTracks = tracks;
  };
  private loadRecommendedNewArtists = async () => {
    if (!this.familiarSongsPool) return;
    let artistsToMatch = Array.from(
      new Set([
        ...this.familiarSongsPool.artistCatalogs.map(
          (a) => a.artist_name || ""
        ),
        ...this.familiarSongsPool.specifiedTracks.map(
          (t) => t.artist_name || ""
        ),
        ...this.familiarSongsPool.topTracks.map((t) => t.artist_name || ""),
        ...this.familiarSongsPool.likedTracks.map((t) => t.artist_name || ""),
      ])
    ).filter(Boolean);
    let artistsToExclude = Array.from(
      new Set([
        ...this.spotifyData.likedTracks.map((t) => t.artist_name || ""),
        ...this.spotifyData.topTracks.map((t) => t.artist_name || ""),
        ...this.spotifyData.topArtists.map((t) => t.artist_name || ""),
        ...this.spotifyData.playHistory.map((t) => t.artist_name || ""),
      ])
    ).filter(Boolean);
    if (artistsToMatch.length < 1) {
      this.newArtists = [];
      return;
    }

    this.newArtists = await jsonRequest("/api/new-artist-recommendations", {
      method: "POST",
      body: JSON.stringify({
        artistsToMatch,
        artistsToExclude,
        desiredArtistCount: 5,
      }),
    }).catch((err) => {
      console.error("Error getting new artist recommendations", err);
      return [];
    });
    console.log(
      "🚀 | loadRecommendedNewArtists= | this.newArtists:",
      this.newArtists
    );
  };

  private buildFamiliarSongsPool = async () => {
    let input = await getBuildFamiliarSongPoolInput(this.spotifyData, {
      selectedArtistIds: this._selectedArtists.map((a) => a.artist_id),
      selectedTrackIds: this._selectedTracks.map((t) => t.track_id),
    });
    this.familiarSongsPool = await buildFamiliarSongsPool(input, this.sdk);
    console.log(
      "🚀 | rebuildFamiliarSongsPool= | this.familiarSongsPool:",
      this.familiarSongsPool
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
        recommendedArtists: [],
        formData: this._formData,
      };
      await this.cache.setItem(PlaylistBuildingService.CACHE_KEY, cacheData);
    } catch (err) {
      console.error("Failed to save selection state:", err);
    }
  }

  private async saveComputedResults() {
    try {
      const currentCache = await this.cache.getItem<PlaylistBuilderData>(
        PlaylistBuildingService.CACHE_KEY
      );
      if (!currentCache) return;

      await this.cache.setItem(PlaylistBuildingService.CACHE_KEY, {
        ...currentCache,
        familiarSongsPool: this.familiarSongsPool,
        recommendedArtists: this.newArtists,
      });
    } catch (err) {
      console.error("Failed to save computed results:", err);
    }
  }

  warmUpPlaylist = async () => {
    const currentHash = await this.getSelectionsHash();
    console.log("🚀 | warmUpPlaylist= | ", currentHash, this.lastWarmUp, {
      familiarSongsPool: this.familiarSongsPool,
      newArtists: this.newArtists,
    });

    // If there's an ongoing warm-up operation for the same hash, return its promise
    if (
      this.lastWarmUp &&
      this.lastWarmUp.promise &&
      currentHash === this.lastWarmUp.hash
    ) {
      return this.lastWarmUp.promise;
    }
    // Check if we have valid cached results
    const cachedState = await this.cache.getItem<PlaylistBuilderData>(
      PlaylistBuildingService.CACHE_KEY
    );
    if (cachedState?.hashedSelection === currentHash) {
      if (cachedState.familiarSongsPool && cachedState.recommendedArtists) {
        this.familiarSongsPool = cachedState.familiarSongsPool;
        this.newArtists = cachedState.recommendedArtists;
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
          await this.buildFamiliarSongsPool();
          await this.loadRecommendedNewArtists();
          await this.saveComputedResults();
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
      totalSelectedCount:
        this._selectedArtists.length + this._selectedTracks.length,
    };
  };

  public toggleArtistSelection = async (artistId: string) => {
    if (this._selectedArtists.some((a) => a.artist_id === artistId)) {
      this._selectedArtists = this._selectedArtists.filter(
        (a) => a.artist_id !== artistId
      );
    } else {
      this._selectedArtists.push({ artist_id: artistId });
      this.triggerChange();
      await syncNewArtists(this.sdk, [artistId]);
      await this.loadArtists();
    }
    this.lastWarmUp = null;
    this.triggerChange();
  };

  public toggleTrackSelection = async (trackId: string) => {
    if (this._selectedTracks.some((t) => t.track_id === trackId)) {
      this._selectedTracks = this._selectedTracks.filter(
        (t) => t.track_id !== trackId
      );
    } else {
      this._selectedTracks.push({ track_id: trackId });
      this.triggerChange();
      await syncNewTracks(this.sdk, [trackId]);
      await this.loadTracks();
    }
    this.lastWarmUp = null;
    this.triggerChange();
  };

  public updateFormData = <TKey extends keyof BuildPlaylistFormData>(
    key: TKey,
    value: BuildPlaylistFormData[TKey]
  ) => {
    this._formData[key] = value;
    this.saveSelectionToCache();
    this.emit();
  };

  public buildPlaylist = async () => {
    await this.warmUpPlaylist();
    console.log("🚀 | buildPlaylist= | this.newArtists:", {
      familiarSongsPool: this.familiarSongsPool,
      newArtists: this.newArtists,
    });
    let state = this.getState();
    // if (!state.selectedArtists.length && !state.selectedTracks.length) {
    //   throw new Error("No selection to build playlist from");
    // }
    if (!this.familiarSongsPool) {
      throw new Error("No familiar songs pool to build playlist from");
    }
    // if (!this.newArtists.length) {
    //   throw new Error("No new artists to build playlist from");
    // }
    let data = (await jsonRequest)<BuildPlaylistResult>("/api/build-playlist", {
      method: "POST",
      body: JSON.stringify({
        formData: this._formData,
        data: {
          selectedTracks: state.selectedTracks || [],
          selectedArtists: state.selectedArtists || [],
          familiarSongsPool: this.familiarSongsPool,
          recommendedArtists: this.newArtists || [],
          formData: this._formData,
        },
      } satisfies BuildPlaylistInput),
    });
    return data;
  };
}
