import { Authenticator } from "remix-auth";
import { authSessionStorage } from "./authSession.server";
import { createSpotifyStrategy } from "./createSpotifyStrategy";
import { redirect } from "react-router";

export type User = {
  id: string;
  email?: string;
  name: string;
  photo?: string;
  accessToken: string;
  refreshToken: string;
};
export let authenticator = new Authenticator<User>();

const CLIENT_ID = process.env?.SPOTIFY_CLIENT_ID!;
const CLIENT_SECRET = process.env?.SPOTIFY_CLIENT_SECRET!;
const APP_URL = process.env?.APP_URL!;

const SPOTIFY_CONFIG = {
  scopes: [
    "user-read-recently-played",
    "playlist-modify-private",
    "playlist-modify-public",
    "playlist-read-collaborative",
    "playlist-read-private",
    "user-follow-read",
    "user-library-modify",
    "user-library-read",
    "user-modify-playback-state",
    "user-read-currently-playing",
    "user-read-playback-state",
    "user-read-private",
    "user-top-read",
  ],
};
let strategy = createSpotifyStrategy<User>(
  {
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    redirectURI: `${APP_URL}/auth/callback`,
    scopes: SPOTIFY_CONFIG.scopes,
  },
  async ({ tokens }, profile) => {
    // here you can use the params above to get the user and return it
    // what you do inside this and how you find the user is up to you
    return {
      id: profile.id,
      email: profile.emails?.[0]?.value,
      name: profile.displayName,
      photo: profile.photos?.[0]?.value,
      accessToken: tokens.accessToken(),
      refreshToken: tokens.refreshToken(),
    };
  }
);
authenticator.use(strategy, "spotify");

export async function requireAuth(request: Request, returnTo?: string) {
  let session = await authSessionStorage.getSession(
    request.headers.get("cookie")
  );
  let user = session.get("user");
  if (user) return user as User;
  if (returnTo) session.set("returnTo", returnTo);
  throw redirect("/login", {
    headers: { "Set-Cookie": await authSessionStorage.commitSession(session) },
  });
}

export async function tryAuth(request: Request) {
  let session = await authSessionStorage.getSession(
    request.headers.get("cookie")
  );
  return (session.get("user") as User) || null;
}
