import { SpotifyApi } from "@spotify/web-api-ts-sdk";
import { type AuthTokens } from "~/auth/auth.server";
export type SpotifySdk = SpotifyApi;
export const createSpotifySdk = (tokens: AuthTokens) => {
  let sdk = SpotifyApi.withAccessToken("11f154591caa4027a3c46231eced3723", {
    access_token: tokens.accessToken,
    token_type: tokens.tokenType,
    expires_in: Math.floor(
      (new Date(tokens.expiresAt).getTime() - Date.now()) / 1000
    ),
    refresh_token: tokens.refreshToken,
  });
  return sdk;
};
