import { OAuth2Strategy } from "remix-auth-oauth2";
import { Strategy } from "remix-auth/strategy";

import {
  Spotify as SpotifyAuth,
  generateState,
  OAuth2RequestError,
  ArcticFetchError,
} from "arctic";
import { redirect } from "react-router";
import { jsonRequest } from "~/toolkit/utils/fetch.utils";

export type SpotifyAuthStrategyOptions = {
  clientId: string;
  clientSecret: string;
  redirectURI: string;
  scopes: string[];
};

export interface SpotifyProfile {
  country: string;
  display_name: string;
  email: string;
  explicit_content: {
    filter_enabled: boolean;
    filter_locked: boolean;
  };
  external_urls: {
    spotify: string;
  };
  followers: {
    href: string;
    total: number;
  };
  href: string;
  id: string;
  images: {
    url: string;
    height: number;
    width: number;
  }[];
  product: string;
  type: string;
  uri: string;
}

export class SpotifyAuthStrategy<User> extends Strategy<
  User,
  OAuth2Strategy.VerifyOptions & { profile: SpotifyProfile }
> {
  override name = "spotify";
  protected client: SpotifyAuth;
  options: SpotifyAuthStrategyOptions;

  constructor(
    options: SpotifyAuthStrategyOptions,
    verify: Strategy.VerifyFunction<
      User,
      OAuth2Strategy.VerifyOptions & { profile: SpotifyProfile }
    >
  ) {
    super(verify);
    this.options = options;
    this.client = new SpotifyAuth(
      options.clientId,
      options.clientSecret,
      options.redirectURI
    );
  }

  async authenticate(request: Request) {
    let url = new URL(request.url);

    let stateUrl = url.searchParams.get("state");
    let error = url.searchParams.get("error");

    if (error) {
      let description = url.searchParams.get("error_description");
      let uri = url.searchParams.get("error_uri");
      throw new OAuth2RequestError(error, description, uri, stateUrl);
    }

    if (!stateUrl) {
      let state = generateState();
      let authorizationUrl = this.client.createAuthorizationURL(
        state,
        this.options.scopes
      );

      throw redirect(authorizationUrl.toString());
    }

    let code = url.searchParams.get("code");

    if (!code) throw new ReferenceError("Missing code in the URL");
    try {
      const tokens = await this.client.validateAuthorizationCode(code);
      let accessToken = tokens.accessToken();
      if (!accessToken) throw new Error("No access token");
      let data = await jsonRequest<SpotifyProfile>(
        `https://api.spotify.com/v1/me`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      let user = await this.verify({ request, tokens, profile: data });
      return user;
    } catch (e) {
      if (e instanceof OAuth2RequestError) {
        // Invalid authorization code, credentials, or redirect URI
        console.error("OAuth2RequestError", e);
        throw e;
        // ...
      }
      if (e instanceof ArcticFetchError) {
        console.error("Auth failed to call `fetch()`", e);
        // Failed to call `fetch()`
        throw e;
        // ...
      }
      throw e;
    }
  }
  async refreshAccessToken(refreshToken: string) {
    console.log("🚀 | refreshAccessToken | refreshToken:", refreshToken);
    let tokens = await this.client.refreshAccessToken(refreshToken);
    console.log("🚀 | SpotifyAuthStrategy | tokens:", tokens);
    tokens.data = {
      ...tokens.data,
      refresh_token: refreshToken,
    };
    return tokens;
  }
}
