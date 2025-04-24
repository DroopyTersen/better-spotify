import { Authenticator } from "remix-auth";
import { authSessionStorage } from "./authSession.server";
import { redirect } from "react-router";
import { SpotifyAuthStrategy } from "./SpotifyAuthStrategy";
import dayjs from "dayjs";
import { LooseAutocomplete } from "~/toolkit/utils/typescript.utils";
import { SPOTIFY_AUTH_CONFIG } from "./spotifyAuth.config";
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

let strategy = new SpotifyAuthStrategy<User>(
  {
    clientId: SPOTIFY_AUTH_CONFIG.clientId,
    clientSecret: SPOTIFY_AUTH_CONFIG.clientSecret,
    redirectURI: SPOTIFY_AUTH_CONFIG.redirectURI,
    scopes: SPOTIFY_AUTH_CONFIG.scopes,
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
      dayjs(user.tokens.expiresAt).diff(dayjs(), "minutes") < 30
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
