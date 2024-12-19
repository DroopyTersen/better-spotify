import { requireAuth } from "~/auth/auth.server";
import { createSpotifySdk } from "../createSpotifySdk";
import type { Route } from "./+types/api.buildPlaylist.route";
import {
  GenerateArtistRecommendationInput,
  generateArtistRecommendations,
} from "./generateArtistRecommendations.server";

export const action = async ({ request }: Route.ActionArgs) => {
  const startTime = performance.now();

  let user = await requireAuth(request);
  let sdk = await createSpotifySdk(user.tokens);
  let body = await request.json();
  let input = GenerateArtistRecommendationInput.parse(body);
  let recommendedNewArtists = await generateArtistRecommendations(input);
  let artists = await Promise.all(
    recommendedNewArtists.map(async (artistName) => {
      let artistResults = await sdk.search(artistName, ["artist"], "US", 1);
      if (!artistResults.artists.items[0]) return null;
      let fullArtist = artistResults.artists.items[0];
      return {
        artist_id: fullArtist.id,
        artist_name: fullArtist.name,
        images: fullArtist.images,
      };
    })
  );

  const endTime = performance.now();
  console.log(`Artist recommendations took ${endTime - startTime}ms`);

  return Response.json(
    artists.filter(
      (a) => a?.artist_id && !input.artistsToExclude.includes(a.artist_name)
    )
  );
};
