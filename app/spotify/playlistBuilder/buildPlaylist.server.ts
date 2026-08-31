import dayjs from "dayjs";
import { SpotifySdk } from "../createSpotifySdk";
import { generatePlaylist } from "./generatePlaylist.server";

import {
  BuildPlaylistInput,
  BuildPlaylistTrack,
} from "./playlistBuilder.types";
import { getAllArtistTracks } from "../api/getAllArtistTracks";
import { spotifyWebApi } from "../api/spotifyWebApi";
import { mapWithConcurrency } from "../api/mapWithConcurrency";
import {
  CREATING_PLAYLIST_PROGRESS,
  CURATING_PLAYLIST_PROGRESS,
  FINDING_TRACKS_PROGRESS,
  getCurationProgress,
  PLAYLIST_COMPLETE_PROGRESS,
  type PlaylistBuildProgress,
  VERIFYING_TRACKS_PROGRESS,
} from "./playlistBuildProgress";

const ARTIST_CATALOG_CONCURRENCY = 3;
const TRACK_SEARCH_CONCURRENCY = 5;
const MAX_NEW_TRACKS_PER_ARTIST = 20;
const NEW_TRACK_CANDIDATE_MULTIPLIER = 3;

export class PlaylistCreationResidualError extends Error {
  constructor() {
    super(
      "Spotify created a playlist but could not finish or remove it. A partial playlist may remain in your library."
    );
    this.name = "PlaylistCreationResidualError";
  }
}

export type CanonicalPlaylistTrack = {
  id: string;
  name: string;
  artists: Array<{ id: string; name: string }>;
  popularity?: number;
};

type GetCanonicalPlaylistTracks = (
  sdk: SpotifySdk,
  trackIds: string[]
) => Promise<CanonicalPlaylistTrack[]>;

export type PlaylistCreationDependencies = {
  getTracks: GetCanonicalPlaylistTracks;
  createPlaylist: typeof spotifyWebApi.createPlaylist;
  addPlaylistItems: typeof spotifyWebApi.addPlaylistItems;
  removePlaylistFromLibrary: typeof spotifyWebApi.removePlaylistFromLibrary;
};

const playlistCreationDependencies: PlaylistCreationDependencies = {
  getTracks: spotifyWebApi.getTracks,
  createPlaylist: spotifyWebApi.createPlaylist,
  addPlaylistItems: spotifyWebApi.addPlaylistItems,
  removePlaylistFromLibrary: spotifyWebApi.removePlaylistFromLibrary,
};

export async function buildPlaylist(
  input: BuildPlaylistInput,
  sdk: SpotifySdk,
  options: {
    onProgress?: (progress: PlaylistBuildProgress) => void;
  } = {}
) {
  const reportProgress = options.onProgress ?? (() => undefined);

  // 5. Fetch new songs from recommended artists
  reportProgress(FINDING_TRACKS_PROGRESS);
  const newSongCatalogs = await mapWithConcurrency(
    input.data.recommendedArtists,
    ARTIST_CATALOG_CONCURRENCY,
    async (artist) => {
      const catalogTracks = await getAllArtistTracks(
        sdk,
        artist.artist_id,
        MAX_NEW_TRACKS_PER_ARTIST
      );
      return catalogTracks.map((t) => ({
        id: t.id,
        name: t.name,
        artist_name: t.artist_name,
        artist_id: t.artist_id,
        popularity: t.popularity,
      }));
    }
  );
  const newSongs = selectNewSongCandidates(
    newSongCatalogs,
    input.formData.songCount
  );

  // 6. Generate final playlist
  reportProgress(CURATING_PLAYLIST_PROGRESS);
  const generatedPlaylist = await generatePlaylist(
    {
      ...input,
      newSongs,
    },
    undefined,
    (partialOutput) => {
      const draftedSongs =
        partialOutput.playlist?.tracks?.filter(Boolean).length ?? 0;
      reportProgress(
        getCurationProgress(draftedSongs, input.formData.songCount)
      );
    }
  );

  const selectedTracks = input.data.selectedTracks.flatMap((track) =>
    track.track_name
      ? [
          {
            id: track.track_id,
            name: track.track_name,
            artist_name: track.artist_name,
            artist_id: track.artist_id,
          } satisfies BuildPlaylistTrack,
        ]
      : []
  );
  const verifiedTracks = new Map<string, BuildPlaylistTrack>(
    [
      ...selectedTracks,
      ...(input.data.familiarSongsPool?.specifiedTracks ?? []),
      ...(input.data.familiarSongsPool?.topTracks ?? []),
      ...(input.data.familiarSongsPool?.likedTracks ?? []),
      ...(input.data.familiarSongsPool?.artistCatalogs ?? []).flatMap(
        (catalog) => catalog.tracks
      ),
      ...newSongs,
    ].map((track) => [track.id, track])
  );

  reportProgress(VERIFYING_TRACKS_PROGRESS);
  const resolvedPlaylistTracks = await resolvePlaylistTracks(
    generatedPlaylist.playlist.tracks,
    verifiedTracks,
    sdk
  );

  if (!resolvedPlaylistTracks) {
    throw new Error(
      "The generated playlist contains a track Spotify could not resolve"
    );
  }
  if (resolvedPlaylistTracks.length > 100) {
    throw new RangeError(
      "Spotify playlists can add at most 100 items per request"
    );
  }

  // 7. Re-read every final ID from Spotify before creating anything. Client
  // pools and model output are candidates, never mutation authority.
  reportProgress(CREATING_PLAYLIST_PROGRESS);
  const finalPlaylist = await createVerifiedPlaylist(
    sdk,
    {
      name: dayjs().format("YYYY-MM-DD") + " " + generatedPlaylist.playlist.name,
      description: generatedPlaylist.playlist.description,
    },
    resolvedPlaylistTracks
  );

  reportProgress(PLAYLIST_COMPLETE_PROGRESS);
  return {
    playlist: finalPlaylist,
  };
}
export type BuildPlaylistOutput = Awaited<ReturnType<typeof buildPlaylist>>;

export async function resolvePlaylistTracks(
  tracks: BuildPlaylistTrack[],
  verifiedTracks: ReadonlyMap<string, BuildPlaylistTrack>,
  sdk: SpotifySdk
): Promise<BuildPlaylistTrack[] | null> {
  if (hasDuplicatePlaylistCandidates(tracks, verifiedTracks)) return null;

  const resolvedTracks = await mapWithConcurrency(
    tracks,
    TRACK_SEARCH_CONCURRENCY,
    (track) => ensurePlaylistTrack(track, verifiedTracks, sdk)
  );
  return resolvedTracks.some((track) => !track.id) || hasDuplicateTrackIds(resolvedTracks)
    ? null
    : resolvedTracks;
}

export async function createVerifiedPlaylist(
  sdk: SpotifySdk,
  details: {
    name: string;
    description: string;
  },
  candidateTracks: BuildPlaylistTrack[],
  dependencies: PlaylistCreationDependencies = playlistCreationDependencies
) {
  const canonicalTracks = await canonicalizePlaylistTracks(
    candidateTracks,
    sdk,
    dependencies.getTracks
  );
  const playlist = await dependencies.createPlaylist(sdk, details);

  try {
    await dependencies.addPlaylistItems(
      sdk,
      playlist.id,
      canonicalTracks.map((track) => `spotify:track:${track.id}`)
    );
    return playlist;
  } catch (operationError) {
    try {
      await dependencies.removePlaylistFromLibrary(sdk, playlist.id);
    } catch {
      throw new PlaylistCreationResidualError();
    }
    throw operationError;
  }
}

export async function canonicalizePlaylistTracks(
  tracks: BuildPlaylistTrack[],
  sdk: SpotifySdk,
  getTracks: GetCanonicalPlaylistTracks = spotifyWebApi.getTracks
): Promise<BuildPlaylistTrack[]> {
  const distinctIds = Array.from(new Set(tracks.map(({ id }) => id)));
  const canonicalTracks = await getTracks(sdk, distinctIds);
  const canonicalById = new Map(
    canonicalTracks.map((track) => [track.id, track])
  );

  if (
    canonicalById.size !== distinctIds.length ||
    distinctIds.some((id) => !canonicalById.has(id))
  ) {
    throw new Error("Spotify did not resolve every final playlist track");
  }

  const resolvedTracks = tracks.map(({ id }) => {
    const track = canonicalById.get(id);
    if (!track) {
      throw new Error("Spotify did not resolve every final playlist track");
    }
    return {
      id: track.id,
      name: track.name,
      artist_name: track.artists.map(({ name }) => name).join(", "),
      artist_id: track.artists[0]?.id ?? null,
      popularity: track.popularity ?? null,
    };
  });

  if (hasDuplicateTrackIds(resolvedTracks)) {
    throw new Error("The final playlist contains duplicate Spotify tracks");
  }
  return resolvedTracks;
}

export function selectNewSongCandidates(
  artistCatalogs: readonly (readonly BuildPlaylistTrack[])[],
  songCount: number
): BuildPlaylistTrack[] {
  if (!Number.isInteger(songCount) || songCount < 1) {
    throw new RangeError("Song count must be a positive integer");
  }

  const globalLimit = songCount * NEW_TRACK_CANDIDATE_MULTIPLIER;
  const boundedCatalogs = artistCatalogs.map((catalog) =>
    catalog.slice(0, MAX_NEW_TRACKS_PER_ARTIST)
  );
  const selected: BuildPlaylistTrack[] = [];
  const seenTrackIds = new Set<string>();

  for (let trackIndex = 0; selected.length < globalLimit; trackIndex += 1) {
    let foundCandidate = false;
    for (const catalog of boundedCatalogs) {
      const track = catalog[trackIndex];
      if (!track) continue;
      foundCandidate = true;
      if (seenTrackIds.has(track.id)) continue;
      seenTrackIds.add(track.id);
      selected.push(track);
      if (selected.length >= globalLimit) break;
    }
    if (!foundCandidate) break;
  }

  return selected;
}

export async function ensurePlaylistTrack(
  track: BuildPlaylistTrack,
  verifiedTracks: ReadonlyMap<string, BuildPlaylistTrack>,
  sdk: SpotifySdk
): Promise<BuildPlaylistTrack> {
  // Never trust model-authored metadata for a retained Spotify ID. Returning
  // the canonical input record also prevents an ID/name mismatch in the UI.
  const verifiedTrack = verifiedTracks.get(track.id);
  if (verifiedTrack) {
    return verifiedTrack;
  }

  // Search for the track if no ID or invalid ID
  const searchQuery = [
    `track:${JSON.stringify(track.name)}`,
    track.artist_name
      ? `artist:${JSON.stringify(track.artist_name)}`
      : undefined,
  ]
    .filter(Boolean)
    .join(" ");
  const searchResult = await sdk.search(
    searchQuery.slice(0, 249),
    ["track"],
    "US",
    10
  );

  const expectedName = normalizeSpotifySearchText(track.name);
  const expectedArtist = normalizeSpotifySearchText(track.artist_name ?? "");
  const foundTrack = searchResult.tracks.items.find((candidate) => {
    if (normalizeSpotifySearchText(candidate.name) !== expectedName) {
      return false;
    }
    if (!expectedArtist) return true;

    return candidate.artists.some(
      (artist) =>
        normalizeSpotifySearchText(artist.name) === expectedArtist
    );
  });

  if (foundTrack) {
    return {
      id: foundTrack.id,
      name: foundTrack.name,
      artist_name: foundTrack.artists[0]?.name ?? track.artist_name,
      artist_id: foundTrack.artists[0]?.id ?? null,
      popularity: foundTrack.popularity,
    };
  }

  // An unverified model-provided ID must never reach a Spotify mutation.
  return { ...track, id: "" };
}

function normalizeSpotifySearchText(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function hasDuplicatePlaylistCandidates(
  tracks: BuildPlaylistTrack[],
  verifiedTracks: ReadonlyMap<string, BuildPlaylistTrack>
): boolean {
  const seenCandidates = new Set<string>();
  return tracks.some((track) => {
    const verifiedTrack = verifiedTracks.get(track.id);
    const key = verifiedTrack
      ? `id:${verifiedTrack.id}`
      : `search:${normalizeSpotifySearchText(track.name)}|${normalizeSpotifySearchText(
          track.artist_name ?? ""
        )}`;
    if (seenCandidates.has(key)) return true;
    seenCandidates.add(key);
    return false;
  });
}

export function hasDuplicateTrackIds(tracks: BuildPlaylistTrack[]): boolean {
  const seenIds = new Set<string>();
  return tracks.some(({ id }) => {
    if (seenIds.has(id)) return true;
    seenIds.add(id);
    return false;
  });
}
