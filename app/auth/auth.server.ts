import { Authenticator } from "remix-auth";
import { authSessionStorage } from "./authSession.server";
import { redirect } from "react-router";
import { SpotifyAuthStrategy } from "./SpotifyAuthStrategy";
import dayjs from "dayjs";
import { LooseAutocomplete } from "~/toolkit/utils/typescript.utils";
export type User = {
  id: string;
  email?: string;
  name: string;
  photo?: string;
  tokens: AuthTokens;
  product: LooseAutocomplete<"free" | "premium" | "open">;
};
export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresAt: string;
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
let strategy = new SpotifyAuthStrategy<User>(
  {
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    redirectURI: `${APP_URL}/auth/callback`,
    scopes: SPOTIFY_CONFIG.scopes,
  },
  async ({ tokens, profile }) => {
    return {
      id: profile.id,
      email: profile.email,
      name: profile.display_name || profile.email || profile.id,
      photo: profile.images?.[0]?.url,
      product: profile.product,
      tokens: {
        accessToken: tokens.accessToken(),
        refreshToken: tokens.refreshToken(),
        tokenType: tokens.tokenType(),
        expiresAt: tokens.accessTokenExpiresAt().toISOString(),
      },
    };
  }
);
authenticator.use(strategy, "spotify");

export async function requireAuth(request: Request) {
  let session = await authSessionStorage.getSession(
    request.headers.get("cookie")
  );
  let user = session.get("user") as User;

  if (user) {
    console.log(
      "🚀 | requireAuth | time until token expires:",
      dayjs(user.tokens.expiresAt).diff(dayjs(), "minutes"),
      "minutes"
    );
    if (
      request.method === "GET" &&
      user?.tokens.refreshToken &&
      dayjs(user.tokens.expiresAt).diff(dayjs(), "minutes") < 20
    ) {
      let newTokens = await strategy.refreshAccessToken(
        user.tokens.refreshToken
      );
      user.tokens = {
        accessToken: newTokens.accessToken(),
        refreshToken: newTokens.refreshToken(),
        tokenType: newTokens.tokenType(),
        expiresAt: newTokens.accessTokenExpiresAt().toISOString(),
      };
      session.set("user", user);
      let newUrl = new URL(request.url);
      newUrl.searchParams.set("refreshToken", "true");
      throw redirect(newUrl.toString(), {
        headers: {
          "Set-Cookie": await authSessionStorage.commitSession(session),
        },
      });
    }
    return user as User;
  }

  throw redirect("/login", {
    headers: { "Set-Cookie": await authSessionStorage.commitSession(session) },
  });
}

export async function tryAuth(request: Request) {
  let session = await authSessionStorage.getSession(
    request.headers.get("cookie")
  );
  let user = session.get("user") as User;
  return user || null;
}
