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

/**
 * Atomically consumes a login code. Guarded by `consumed_at IS NULL` and reports whether this
 * call was the one that consumed it, so concurrent verifications of the same code cannot both
 * succeed: D1 serializes the writes, so exactly one caller sees a changed row.
 */
export async function consumeLoginCode(db: Db, id: string): Promise<boolean> {
  const result = await db
    .prepare("UPDATE login_codes SET consumed_at = datetime('now') WHERE id = ? AND consumed_at IS NULL")
    .bind(id)
    .run();
  return (result.meta?.changes ?? 0) > 0;
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
    // Email is identity and always refreshed from Google. So is the avatar: it is not
    // user-editable, so Google is its only source and must stay current — COALESCE here would
    // freeze a stale picture forever. The name uses COALESCE(name, ?) so it is only *filled*
    // when empty and a Google login never clobbers a display name set on /profile. (Clearing
    // the name on /profile sets it NULL, which lets the next Google login re-populate it.)
    await db
      .prepare(
        "UPDATE users SET email = ?, name = COALESCE(name, ?), avatar_url = ?, updated_at = datetime('now') WHERE id = ?"
      )
      .bind(profile.email ?? null, profile.name ?? null, profile.picture ?? null, existing.id)
      .run();
    const updated = await getUserById(db, existing.id);
    if (!updated) {
      throw new Error("Failed to load updated user.");
    }
    return updated;
  }

  // Merge with an existing email-login account so both methods share one user. Keep any display
  // name the email user already set (COALESCE(name, ?)); the avatar is not user-editable, so
  // Google supplies it outright.
  if (profile.email) {
    const byEmail = await getUserByEmail(db, profile.email);
    if (byEmail) {
      await db
        .prepare(
          "UPDATE users SET google_sub = ?, name = COALESCE(name, ?), avatar_url = ?, updated_at = datetime('now') WHERE id = ?"
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

/**
 * Reads the stored password credential for a user. Kept off the public `User` type on
 * purpose: `User` is handed to the client via the root loader, so the hash never travels
 * with it. Only server-side auth code reads this. `null` means no password is set.
 */
export async function getUserPasswordHash(db: Db, userId: string): Promise<string | null> {
  const row = await db
    .prepare("SELECT password_hash FROM users WHERE id = ? LIMIT 1")
    .bind(userId)
    .first();
  const hash = row?.password_hash;
  return hash ? String(hash) : null;
}

/** Same as {@link getUserPasswordHash} but keyed by email, for password sign-in. */
export async function getUserCredentialByEmail(
  db: Db,
  email: string
): Promise<{ userId: string; passwordHash: string | null } | null> {
  const row = await db
    .prepare("SELECT id, password_hash FROM users WHERE email = ? LIMIT 1")
    .bind(email)
    .first();
  if (!row) return null;
  return {
    userId: String(row.id),
    passwordHash: row.password_hash ? String(row.password_hash) : null
  };
}

/** Sets or clears (pass `null`) a user's password credential. */
export async function setUserPassword(
  db: Db,
  userId: string,
  passwordHash: string | null
): Promise<void> {
  await db
    .prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(passwordHash, userId)
    .run();
}

/**
 * Sets the editable profile fields to exactly the given values. `null` clears a field, so a
 * blank input genuinely empties the stored value rather than silently keeping the old one.
 *
 * Only the display name is user-editable. The avatar is not: it comes from Google or falls
 * back to a default placeholder, so it is deliberately absent here and never written by the
 * profile form.
 */
export async function updateUserProfile(
  db: Db,
  userId: string,
  input: { name: string | null }
): Promise<User> {
  await db
    .prepare("UPDATE users SET name = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(input.name, userId)
    .run();
  const updated = await getUserById(db, userId);
  if (!updated) {
    throw new Error("Failed to load updated user.");
  }
  return updated;
}
