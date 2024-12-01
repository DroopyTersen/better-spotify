import { OAuth2Strategy } from "remix-auth-oauth2";

export type OAuth2StrategyOptions = OAuth2Strategy.ConstructorOptions;

interface SpotifyProfile {
  id: string;
  provider: string;
  displayName: string;
  emails: Array<{ value: string }>;
  photos: Array<{ value: string }>;
}

export const createSpotifyStrategy = <TUser>(
  options: Omit<
    OAuth2StrategyOptions,
    "authorizationEndpoint" | "tokenEndpoint"
  >,
  verify: (
    verifyOptions: OAuth2Strategy.VerifyOptions,
    profile: SpotifyProfile
  ) => Promise<TUser>
) => {
  return new OAuth2Strategy<TUser>(
    {
      authorizationEndpoint: `https://accounts.spotify.com/authorize`,
      tokenEndpoint: `https://accounts.spotify.com/api/token`,
      ...options,
    },
    async ({ tokens, request }) => {
      let accessToken = tokens.accessToken();
      if (!accessToken) throw new Error("No access token");
      let response = await fetch(`https://api.spotify.com/v1/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      let data = await response.json();
      console.log("🚀 | data:", data);

      let profile: SpotifyProfile = {
        provider: "spotify",
        id: data.id,
        displayName: data.display_name,
        emails: [{ value: data.email }],
        photos: [{ value: data.images[0]?.url }],
      };
      return verify({ tokens, request }, profile);
    }
  );
};
