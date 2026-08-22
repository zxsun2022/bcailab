import { base64UrlDecode } from "./crypto";

const DOMAIN = "bcailab:mapdown-signin:v1";
const VERSION = 1;
const TTL_SECONDS = 60;
const CLOCK_SKEW_SECONDS = 30;
const encoder = new TextEncoder();

export interface VerifiedHandoff {
  userId: string;
  nonce: string;
  audience: string;
  expiresAt: number;
}

function isPayload(value: unknown): value is {
  v: number;
  iat: number;
  exp: number;
  nonce: string;
  sub: string;
  aud: string;
  iss: string;
} {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  return payload.v === VERSION &&
    Number.isInteger(payload.iat) &&
    Number.isInteger(payload.exp) &&
    Number(payload.exp) - Number(payload.iat) === TTL_SECONDS &&
    typeof payload.nonce === "string" && /^[0-9a-f-]{36}$/i.test(payload.nonce) &&
    typeof payload.sub === "string" && payload.sub.length > 0 &&
    typeof payload.aud === "string" &&
    payload.iss === "https://bcailab.com";
}

export async function verifyMapdownHandoff(input: {
  secret: string;
  token: string;
  audience: string;
  nowMs?: number;
}): Promise<VerifiedHandoff> {
  const [payloadSegment, signatureSegment, extra] = input.token.split(".");
  if (!payloadSegment || !signatureSegment || extra || !input.secret) throw new Error("invalid handoff");
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(input.secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    base64UrlDecode(signatureSegment),
    encoder.encode(`${DOMAIN}.${payloadSegment}`)
  );
  if (!valid) throw new Error("invalid handoff");
  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadSegment)));
  } catch {
    throw new Error("invalid handoff");
  }
  if (!isPayload(payload) || payload.aud !== input.audience) throw new Error("invalid handoff");
  const now = Math.floor((input.nowMs ?? Date.now()) / 1000);
  if (payload.iat > now + CLOCK_SKEW_SECONDS || payload.exp < now) throw new Error("expired handoff");
  return {
    userId: payload.sub,
    nonce: payload.nonce,
    audience: payload.aud,
    expiresAt: payload.exp * 1000
  };
}
