import { createCookieSessionStorage } from "react-router";
import type { StoredSessionUser } from "./auth.shared";

export type AuthSessionData = {
  user: StoredSessionUser;
  spotifyOAuthState: string;
};

export const MIN_PRODUCTION_SESSION_SECRET_BYTES = 32;

export function requireValidSessionSecret(
  value: string | undefined,
  environment = process.env.NODE_ENV
) {
  const secret = value?.trim();
  if (!secret) {
    throw new Error("SESSION_SECRET must be set");
  }
  if (
    environment === "production" &&
    new TextEncoder().encode(secret).byteLength <
      MIN_PRODUCTION_SESSION_SECRET_BYTES
  ) {
    throw new Error(
      `SESSION_SECRET must be at least ${MIN_PRODUCTION_SESSION_SECRET_BYTES} bytes in production`
    );
  }
  return secret;
}

const sessionSecret = requireValidSessionSecret(process.env.SESSION_SECRET);

export const authSessionStorage = createCookieSessionStorage<AuthSessionData>({
  cookie: {
    name: "_session",
    sameSite: "lax",
    path: "/",
    httpOnly: true,
    secrets: [sessionSecret],
    secure: process.env.NODE_ENV === "production",
  },
});

export const { getSession, commitSession, destroySession } = authSessionStorage;
