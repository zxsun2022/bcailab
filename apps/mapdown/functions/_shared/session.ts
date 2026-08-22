import { ApiError } from "./http";
import { randomToken, sha256 } from "./crypto";
import { SESSION_TTL_MS } from "./limits";

const COOKIE_NAME = "mapdown_session";

export interface MapdownUser {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}

function cookieValue(request: Request, name: string): string | null {
  for (const part of (request.headers.get("Cookie") ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=") || null;
  }
  return null;
}

function isSecureRequest(request: Request): boolean {
  const hostname = new URL(request.url).hostname;
  return hostname !== "localhost" && hostname !== "127.0.0.1" && !hostname.endsWith(".localhost");
}

export function serializeMapdownSessionCookie(request: Request, value: string, maxAge: number): string {
  return [
    `${COOKIE_NAME}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
    ...(isSecureRequest(request) ? ["Secure"] : [])
  ].join("; ");
}

export async function createMapdownSession(
  db: D1Database,
  request: Request,
  userId: string,
  now = Date.now()
): Promise<string> {
  const token = randomToken();
  await db.prepare(
    "INSERT INTO mapdown_sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)"
  ).bind(await sha256(token), userId, now, now + SESSION_TTL_MS).run();
  return serializeMapdownSessionCookie(request, token, Math.floor(SESSION_TTL_MS / 1000));
}

export async function optionalMapdownUser(
  db: D1Database,
  request: Request,
  now = Date.now()
): Promise<MapdownUser | null> {
  const token = cookieValue(request, COOKIE_NAME);
  if (!token) return null;
  const row = await db.prepare(`
    SELECT u.id, u.email, u.name, u.avatar_url, s.expires_at
    FROM mapdown_sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?
    LIMIT 1
  `).bind(await sha256(token)).first<{
    id: string;
    email: string;
    name: string | null;
    avatar_url: string | null;
    expires_at: number;
  }>();
  if (!row) return null;
  if (Number(row.expires_at) <= now) {
    await db.prepare("DELETE FROM mapdown_sessions WHERE token_hash = ?").bind(await sha256(token)).run();
    return null;
  }
  return { id: row.id, email: row.email, name: row.name, avatarUrl: row.avatar_url };
}

export async function requireMapdownUser(db: D1Database, request: Request): Promise<MapdownUser> {
  const user = await optionalMapdownUser(db, request);
  if (!user) throw new ApiError(401, "signed_out", "Sign in to continue.");
  return user;
}

export async function clearMapdownSession(db: D1Database, request: Request): Promise<string> {
  const token = cookieValue(request, COOKIE_NAME);
  if (token) {
    await db.prepare("DELETE FROM mapdown_sessions WHERE token_hash = ?").bind(await sha256(token)).run();
  }
  return serializeMapdownSessionCookie(request, "", 0);
}
