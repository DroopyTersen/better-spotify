import { OAuth2Strategy } from "remix-auth-oauth2";
import { Strategy } from "remix-auth/strategy";

import {
  Spotify as SpotifyAuth,
  generateState,
  OAuth2RequestError,
  ArcticFetchError,
} from "arctic";
import { redirect } from "react-router";

export type SpotifyAuthStrategyOptions = {
  clientId: string;
  clientSecret: string;
  redirectURI: string;
  scopes: string[];
};

interface SpotifyProfile {
  id: string;
  provider: string;
  displayName: string;
  emails: Array<{ value: string }>;
  photos: Array<{ value: string }>;
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

  private get cookieName() {
    return `${this.name}.auth.session`;
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
      let response = await fetch(`https://api.spotify.com/v1/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      let data = await response.json();
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
