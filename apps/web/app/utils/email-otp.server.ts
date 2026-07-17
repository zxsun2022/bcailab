import {
  consumeLoginCode,
  countRecentLoginCodes,
  createLoginCode,
  createUserWithEmail,
  getActiveLoginCode,
  getUserByEmail,
  incrementLoginCodeAttempts,
  type Db,
  type User
} from "@bcailab/db";
import type { Env } from "~/types/env";

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_VERIFY_ATTEMPTS = 5;
const MAX_CODES_PER_EMAIL_PER_HOUR = 5;
const MAX_CODES_PER_IP_PER_HOUR = 20;

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_FROM = "bcailab <login@bcailab.com>";

export const normalizeEmail = (raw: string): string | null => {
  const email = raw.trim().toLowerCase();
  // Pragmatic shape check; real validation is receiving the code.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) return null;
  return email;
};

const generateCode = (): string => {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return String(bytes[0]! % 1_000_000).padStart(6, "0");
};

const hashCode = async (env: Env, email: string, code: string): Promise<string> => {
  const data = new TextEncoder().encode(`${code}:${email}:${env.SESSION_SECRET}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

const sendLoginCodeEmail = async (
  env: Env,
  email: string,
  code: string
): Promise<{ sent: boolean }> => {
  const apiKey = env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    // Dev fallback: no email provider configured — surface the code in server logs.
    console.log(`[email-otp] RESEND_API_KEY not set; login code for ${email}: ${code}`);
    return { sent: false };
  }

  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: env.RESEND_FROM?.trim() || DEFAULT_FROM,
      to: [email],
      subject: `${code} is your bcailab sign-in code`,
      text: [
        `Your bcailab sign-in code is: ${code}`,
        "",
        "It expires in 10 minutes. If you didn't request this, you can ignore this email."
      ].join("\n")
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Resend request failed (${response.status}): ${detail.slice(0, 300)}`);
  }
  return { sent: true };
};

export type RequestCodeResult =
  | { ok: true; devCode?: string }
  | { ok: false; error: string };

export const requestLoginCode = async (input: {
  db: Db;
  env: Env;
  email: string;
  ip: string;
}): Promise<RequestCodeResult> => {
  const oneHourAgoIso = new Date(Date.now() - 60 * 60 * 1000)
    .toISOString()
    .replace("T", " ")
    .slice(0, 19);

  const [byEmail, byIp] = await Promise.all([
    countRecentLoginCodes(input.db, { email: input.email, sinceIso: oneHourAgoIso }),
    countRecentLoginCodes(input.db, { ip: input.ip, sinceIso: oneHourAgoIso })
  ]);
  if (byEmail >= MAX_CODES_PER_EMAIL_PER_HOUR || byIp >= MAX_CODES_PER_IP_PER_HOUR) {
    return { ok: false, error: "Too many codes requested. Please try again later." };
  }

  const code = generateCode();
  const codeHash = await hashCode(input.env, input.email, code);
  await createLoginCode(input.db, {
    email: input.email,
    codeHash,
    ip: input.ip,
    expiresAt: Date.now() + CODE_TTL_MS
  });

  try {
    const { sent } = await sendLoginCodeEmail(input.env, input.email, code);
    // Without an email provider (local dev), let the route expose the code so
    // the flow stays testable end-to-end.
    return sent ? { ok: true } : { ok: true, devCode: code };
  } catch (error) {
    console.error("send login code failed", error);
    return { ok: false, error: "Could not send the email. Please try again." };
  }
};

export type VerifyCodeResult =
  | { ok: true; user: User }
  | { ok: false; error: string };

export const verifyLoginCode = async (input: {
  db: Db;
  env: Env;
  email: string;
  code: string;
}): Promise<VerifyCodeResult> => {
  const record = await getActiveLoginCode(input.db, input.email);
  if (!record || record.expires_at < Date.now()) {
    return { ok: false, error: "Code expired or not found. Request a new one." };
  }
  if (record.attempts >= MAX_VERIFY_ATTEMPTS) {
    return { ok: false, error: "Too many attempts. Request a new code." };
  }

  await incrementLoginCodeAttempts(input.db, record.id);

  const expectedHash = await hashCode(input.env, input.email, input.code.trim());
  if (expectedHash !== record.code_hash) {
    return { ok: false, error: "Incorrect code. Please check and try again." };
  }

  await consumeLoginCode(input.db, record.id);

  const existing = await getUserByEmail(input.db, input.email);
  const user = existing ?? (await createUserWithEmail(input.db, input.email));
  return { ok: true, user };
};
