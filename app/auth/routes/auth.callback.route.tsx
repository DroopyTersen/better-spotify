import type { LoaderFunctionArgs } from "react-router";
import { finishSpotifyLogin } from "../spotifyAuth.server";

export const loader = ({ request }: LoaderFunctionArgs) =>
  finishSpotifyLogin(request);
