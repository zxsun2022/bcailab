/// <reference types="@cloudflare/workers-types" />

import { createCookieSessionStorage } from "@remix-run/cloudflare";
import { getUserById, upsertUserFromGoogleProfile, type GoogleProfile, type User } from "@bcailab/db";

type Db = D1Database;

export type AuthEnv = {
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  OAUTH_REDIRECT_URL: string;
  SESSION_SECRET: string;
};

const SESSION_COOKIE_NAME = "bcailab_session";
const SESSION_DAYS = 30;

const textEncoder = new TextEncoder();

const base64UrlEncode = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  const base64 = btoa(binary);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const sha256 = async (value: string): Promise<Uint8Array> => {
  const data = textEncoder.encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(digest);
};

const generateCodeVerifier = (): string => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
};

const generateCodeChallenge = async (verifier: string): Promise<string> => {
  const digest = await sha256(verifier);
  return base64UrlEncode(digest);
};

const isSecureHost = (hostname: string): boolean => {
  if (hostname === "localhost" || hostname.endsWith(".localhost")) return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) return false;
  return true;
};

const getCookieDomain = (hostname: string): string | undefined => {
  return hostname.endsWith("bcailab.com") ? "bcailab.com" : undefined;
};

const getSessionStorage = (env: AuthEnv, request: Request) => {
  const hostname = new URL(request.url).hostname;
  return createCookieSessionStorage({
    cookie: {
      name: SESSION_COOKIE_NAME,
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: isSecureHost(hostname),
      domain: getCookieDomain(hostname),
      secrets: [env.SESSION_SECRET]
    }
  });
};

/**
 * Commits a DB session id into the signed session cookie. Used by login flows
 * that are not the Google OAuth callback (e.g. email OTP).
 */
export const createSessionCookie = async (
  request: Request,
  env: AuthEnv,
  sessionId: string
): Promise<string> => {
  const storage = getSessionStorage(env, request);
  const session = await storage.getSession(request.headers.get("Cookie"));
  session.set("session_id", sessionId);
  return storage.commitSession(session, { maxAge: SESSION_DAYS * 24 * 60 * 60 });
};

export const clearSessionCookie = async (request: Request, env: AuthEnv) => {
  const storage = getSessionStorage(env, request);
  const session = await storage.getSession(request.headers.get("Cookie"));
  return storage.destroySession(session);
};

export const getSessionId = async (request: Request, env: AuthEnv): Promise<string | null> => {
  const storage = getSessionStorage(env, request);
  const session = await storage.getSession(request.headers.get("Cookie"));
  const sessionId = session.get("session_id");
  return sessionId ? String(sessionId) : null;
};

export const getSessionUser = async (
  request: Request,
  env: AuthEnv,
  db: Db
): Promise<User | null> => {
  const sessionId = await getSessionId(request, env);
  if (!sessionId) return null;

  const sessionRow = await db
    .prepare("SELECT user_id, expires_at FROM sessions WHERE id = ? LIMIT 1")
    .bind(sessionId)
    .first();

  if (!sessionRow) return null;

  const expiresAt = Number(sessionRow.expires_at);
  if (Number.isFinite(expiresAt) && expiresAt < Date.now()) {
    await db.prepare("DELETE FROM sessions WHERE id = ?").bind(sessionId).run();
    return null;
  }

  return getUserById(db, String(sessionRow.user_id));
};

export const createSession = async (db: Db, userId: string): Promise<{ id: string; expiresAt: number }> => {
  const id = crypto.randomUUID();
  const expiresAt = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  await db
    .prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(id, userId, expiresAt)
    .run();
  return { id, expiresAt };
};

export const destroySession = async (db: Db, sessionId: string | null) => {
  if (!sessionId) return;
  await db.prepare("DELETE FROM sessions WHERE id = ?").bind(sessionId).run();
};

export const startGoogleOAuth = async (request: Request, env: AuthEnv) => {
  const state = crypto.randomUUID();
  const verifier = generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);

  const storage = getSessionStorage(env, request);
  const session = await storage.getSession(request.headers.get("Cookie"));
  session.set("oauth_state", state);
  session.set("oauth_verifier", verifier);

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", env.OAUTH_REDIRECT_URL);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("prompt", "select_account");

  const headers = new Headers({
    "Set-Cookie": await storage.commitSession(session)
  });

  return { redirectUrl: authUrl.toString(), headers };
};

export const handleOAuthCallback = async (request: Request, env: AuthEnv, db: Db) => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const storage = getSessionStorage(env, request);
  const session = await storage.getSession(request.headers.get("Cookie"));
  const expectedState = session.get("oauth_state");
  const verifier = session.get("oauth_verifier");
  session.unset("oauth_state");
  session.unset("oauth_verifier");

  if (!code || !state || !expectedState || !verifier || state !== expectedState) {
    return {
      ok: false,
      error: "Invalid OAuth state. Please try again.",
      headers: new Headers({
        "Set-Cookie": await storage.commitSession(session)
      })
    };
  }

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: env.OAUTH_REDIRECT_URL,
      grant_type: "authorization_code",
      code_verifier: String(verifier)
    })
  });

  if (!tokenResponse.ok) {
    const detail = await tokenResponse.text();
    return {
      ok: false,
      error: `Token exchange failed: ${detail}`,
      headers: new Headers({
        "Set-Cookie": await storage.commitSession(session)
      })
    };
  }

  const tokenPayload = (await tokenResponse.json()) as {
    access_token: string;
    id_token?: string;
  };

  const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: {
      Authorization: `Bearer ${tokenPayload.access_token}`
    }
  });

  if (!profileResponse.ok) {
    const detail = await profileResponse.text();
    return {
      ok: false,
      error: `Failed to fetch profile: ${detail}`,
      headers: new Headers({
        "Set-Cookie": await storage.commitSession(session)
      })
    };
  }

  const profile = (await profileResponse.json()) as GoogleProfile;
  if (!profile.sub) {
    return {
      ok: false,
      error: "Missing Google profile identifier.",
      headers: new Headers({
        "Set-Cookie": await storage.commitSession(session)
      })
    };
  }

  const user = await upsertUserFromGoogleProfile(db, profile);
  const createdSession = await createSession(db, user.id);

  session.set("session_id", createdSession.id);

  const headers = new Headers({
    "Set-Cookie": await storage.commitSession(session, {
      maxAge: SESSION_DAYS * 24 * 60 * 60
    })
  });

  return { ok: true, user, headers };
};
