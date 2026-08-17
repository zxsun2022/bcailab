/// <reference types="@cloudflare/workers-types" />

import type { Db, GoogleProfile, LoginCode, User } from "./types";

const mapUser = (row: Record<string, unknown>): User => ({
  id: String(row.id),
  google_sub: row.google_sub ? String(row.google_sub) : null,
  email: row.email ? String(row.email) : null,
  name: row.name ? String(row.name) : null,
  avatar_url: row.avatar_url ? String(row.avatar_url) : null,
  created_at: String(row.created_at),
  updated_at: String(row.updated_at)
});

const mapLoginCode = (row: Record<string, unknown>): LoginCode => ({
  id: String(row.id),
  email: String(row.email),
  code_hash: String(row.code_hash),
  ip: row.ip ? String(row.ip) : null,
  expires_at: Number(row.expires_at),
  attempts: Number(row.attempts ?? 0),
  consumed_at: row.consumed_at ? String(row.consumed_at) : null,
  created_at: String(row.created_at)
});

export async function getUserByEmail(db: Db, email: string): Promise<User | null> {
  const result = await db
    .prepare("SELECT * FROM users WHERE email = ? LIMIT 1")
    .bind(email)
    .first();
  return result ? mapUser(result) : null;
}

export async function createUserWithEmail(db: Db, email: string): Promise<User> {
  const id = crypto.randomUUID();
  await db.prepare("INSERT INTO users (id, email) VALUES (?, ?)").bind(id, email).run();
  const created = await getUserById(db, id);
  if (!created) {
    throw new Error("Failed to create user.");
  }
  return created;
}

export async function createLoginCode(
  db: Db,
  input: { email: string; codeHash: string; ip: string | null; expiresAt: number }
): Promise<string> {
  const id = crypto.randomUUID();
  await db
    .prepare(
      "INSERT INTO login_codes (id, email, code_hash, ip, expires_at) VALUES (?, ?, ?, ?, ?)"
    )
    .bind(id, input.email, input.codeHash, input.ip, input.expiresAt)
    .run();
  return id;
}

export async function getActiveLoginCode(db: Db, email: string): Promise<LoginCode | null> {
  const result = await db
    .prepare(
      "SELECT * FROM login_codes WHERE email = ? AND consumed_at IS NULL ORDER BY created_at DESC, id DESC LIMIT 1"
    )
    .bind(email)
    .first();
  return result ? mapLoginCode(result) : null;
}

export async function incrementLoginCodeAttempts(db: Db, id: string): Promise<void> {
  await db.prepare("UPDATE login_codes SET attempts = attempts + 1 WHERE id = ?").bind(id).run();
}

export async function consumeLoginCode(db: Db, id: string): Promise<void> {
  await db
    .prepare("UPDATE login_codes SET consumed_at = datetime('now') WHERE id = ?")
    .bind(id)
    .run();
}

export async function countRecentLoginCodes(
  db: Db,
  input: { email?: string; ip?: string; sinceIso: string }
): Promise<number> {
  if (input.email) {
    const row = await db
      .prepare("SELECT COUNT(*) AS n FROM login_codes WHERE email = ? AND created_at >= ?")
      .bind(input.email, input.sinceIso)
      .first();
    return Number(row?.n ?? 0);
  }
  if (input.ip) {
    const row = await db
      .prepare("SELECT COUNT(*) AS n FROM login_codes WHERE ip = ? AND created_at >= ?")
      .bind(input.ip, input.sinceIso)
      .first();
    return Number(row?.n ?? 0);
  }
  return 0;
}


export async function getUserById(db: Db, id: string): Promise<User | null> {
  const result = await db.prepare("SELECT * FROM users WHERE id = ? LIMIT 1").bind(id).first();
  return result ? mapUser(result) : null;
}

export async function getUserByGoogleSub(db: Db, sub: string): Promise<User | null> {
  const result = await db
    .prepare("SELECT * FROM users WHERE google_sub = ? LIMIT 1")
    .bind(sub)
    .first();
  return result ? mapUser(result) : null;
}

export async function upsertUserFromGoogleProfile(db: Db, profile: GoogleProfile): Promise<User> {
  const existing = await getUserByGoogleSub(db, profile.sub);
  if (existing) {
    await db
      .prepare(
        "UPDATE users SET email = ?, name = ?, avatar_url = ?, updated_at = datetime('now') WHERE id = ?"
      )
      .bind(profile.email ?? null, profile.name ?? null, profile.picture ?? null, existing.id)
      .run();
    const updated = await getUserById(db, existing.id);
    if (!updated) {
      throw new Error("Failed to load updated user.");
    }
    return updated;
  }

  // Merge with an existing email-login account so both methods share one user.
  if (profile.email) {
    const byEmail = await getUserByEmail(db, profile.email);
    if (byEmail) {
      await db
        .prepare(
          "UPDATE users SET google_sub = ?, name = COALESCE(?, name), avatar_url = COALESCE(?, avatar_url), updated_at = datetime('now') WHERE id = ?"
        )
        .bind(profile.sub, profile.name ?? null, profile.picture ?? null, byEmail.id)
        .run();
      const merged = await getUserById(db, byEmail.id);
      if (!merged) {
        throw new Error("Failed to load merged user.");
      }
      return merged;
    }
  }

  const id = crypto.randomUUID();
  await db
    .prepare(
      "INSERT INTO users (id, google_sub, email, name, avatar_url) VALUES (?, ?, ?, ?, ?)"
    )
    .bind(id, profile.sub, profile.email ?? null, profile.name ?? null, profile.picture ?? null)
    .run();

  const created = await getUserById(db, id);
  if (!created) {
    throw new Error("Failed to create user.");
  }
  return created;
}
