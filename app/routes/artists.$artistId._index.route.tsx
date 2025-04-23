import { redirect, type LoaderFunctionArgs } from "react-router";

export const loader = async ({ params }: LoaderFunctionArgs) => {
  // Redirect /artists/:artistId to /artists/:artistId/popular
  return redirect(`/artists/${params.artistId}/popular`);
};

// Optional: Add a minimal component if the router requires one,
// although the redirect in the loader should handle it.
export default function ArtistIndexRoute() {
  return null; // Or a loading indicator if preferred
}
