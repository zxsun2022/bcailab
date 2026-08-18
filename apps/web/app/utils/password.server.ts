/// <reference types="@cloudflare/workers-types" />

// Password credentials for accounts that opt into a password (email OTP + Google remain the
// primary, passwordless paths). Hashing uses PBKDF2-HMAC-SHA256 via WebCrypto, which the
// Cloudflare Workers runtime supports natively — no Node `bcrypt`/`scrypt` binary is available
// on this platform. Each hash carries its own random salt and iteration count, encoded as a
// single self-describing string so the parameters can be raised later without a migration.

const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const DERIVED_BYTES = 32;

const encoder = new TextEncoder();

const toBase64Url = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const fromBase64Url = (value: string): Uint8Array => {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

const derive = async (
  password: string,
  salt: Uint8Array,
  iterations: number
): Promise<Uint8Array> => {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    keyMaterial,
    DERIVED_BYTES * 8
  );
  return new Uint8Array(bits);
};

/** Constant-time comparison to avoid leaking match progress through timing. */
const timingSafeEqual = (a: Uint8Array, b: Uint8Array): boolean => {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a[i]! ^ b[i]!;
  return mismatch === 0;
};

/** Produces a self-describing hash string: `pbkdf2$<iterations>$<saltB64url>$<hashB64url>`. */
export const hashPassword = async (password: string): Promise<string> => {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const derived = await derive(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(derived)}`;
};

/** Verifies a plaintext password against a stored hash. Never throws on malformed input. */
export const verifyPassword = async (password: string, stored: string): Promise<boolean> => {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations <= 0) return false;
  let salt: Uint8Array;
  let expected: Uint8Array;
  try {
    salt = fromBase64Url(parts[2]!);
    expected = fromBase64Url(parts[3]!);
  } catch {
    return false;
  }
  const derived = await derive(password, salt, iterations);
  return timingSafeEqual(derived, expected);
};
