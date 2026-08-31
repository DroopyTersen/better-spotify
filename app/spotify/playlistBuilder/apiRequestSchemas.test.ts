import { describe, expect, test } from "bun:test";
import {
  ArtistRecommendationRequestSchema,
  BuildPlaylistRequestSchema,
  PlaylistModificationRequestSchema,
} from "./apiRequestSchemas";

describe("playlist API request schemas", () => {
  test("caps playlist generation work and normalizes duplicated form data", () => {
    const request = minimalBuildRequest();
    request.data.formData.songCount = 99;

    const parsed = BuildPlaylistRequestSchema.parse(request);
    expect(parsed.data.formData).toEqual(parsed.formData);

    request.formData.songCount = 101;
    expect(BuildPlaylistRequestSchema.safeParse(request).success).toBeFalse();
  });

  test("rejects more than 25 selected artists at the server boundary", () => {
    const baseRequest = minimalBuildRequest();
    const request = {
      ...baseRequest,
      data: {
        ...baseRequest.data,
        selectedArtists: Array.from({ length: 26 }, (_, index) => ({
          artist_id: `artist${index}`,
        })),
      },
    };

    expect(BuildPlaylistRequestSchema.safeParse(request).success).toBeFalse();
  });

  test("rejects invalid Spotify ids and playlists over the replace limit", () => {
    const request = {
      playlistId: "validPlaylistId123",
      snapshotId: "snapshot-id==",
      instructions: "Make it upbeat",
      currentTracks: Array.from({ length: 101 }, (_, index) => ({
        id: `track${index}`,
        name: `Track ${index}`,
        artist_name: "Artist",
      })),
    };

    expect(PlaylistModificationRequestSchema.safeParse(request).success).toBeFalse();
    request.currentTracks = request.currentTracks.slice(0, 1);
    request.playlistId = "../not-a-spotify-id";
    expect(PlaylistModificationRequestSchema.safeParse(request).success).toBeFalse();
  });

  test("caps artist recommendation fan-out", () => {
    expect(
      ArtistRecommendationRequestSchema.safeParse({
        artistsToMatch: ["Spoon"],
        artistsToExclude: [],
        desiredArtistCount: 21,
      }).success
    ).toBeFalse();
  });
});

function minimalBuildRequest() {
  const formData = {
    customInstructions: "Warm road-trip songs",
    newStuffAmount: "half" as const,
    songCount: 20,
  };
  return {
    formData: { ...formData },
    data: {
      selectedTracks: [],
      selectedArtists: [],
      familiarSongsPool: {
        specifiedTracks: [],
        topTracks: [],
        artistCatalogs: [],
        likedTracks: [],
        recentlyPlayedTracks: [],
      },
      recommendedArtists: [],
      formData: { ...formData },
    },
  };
}
