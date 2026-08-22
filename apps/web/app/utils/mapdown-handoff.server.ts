const DOMAIN = "bcailab:mapdown-signin:v1";
const VERSION = 1 as const;
const TTL_SECONDS = 60;
const encoder = new TextEncoder();

type Payload = {
  v: 1;
  iat: number;
  exp: number;
  nonce: string;
  sub: string;
  aud: string;
  iss: "https://bcailab.com";
};

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function allowedMapdownOrigin(value: string | null): string | null {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.origin === "https://map.bcailab.com" && url.pathname === "/") return url.origin;
  const local = (url.hostname === "localhost" || url.hostname === "127.0.0.1") && url.protocol === "http:";
  return local && url.pathname === "/" ? url.origin : null;
}

export async function hashMapdownNonce(nonce: string): Promise<string> {
  return base64Url(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", encoder.encode(`bcailab:mapdown-nonce:v1.${nonce}`))
    )
  );
}

export async function createMapdownHandoff(input: {
  secret: string;
  userId: string;
  audience: string;
  nowMs?: number;
  nonce?: string;
}): Promise<{ token: string; nonceHash: string; expiresAt: number }> {
  if (!input.secret || !input.userId || !allowedMapdownOrigin(input.audience)) {
    throw new Error("Mapdown handoff is not configured.");
  }
  const issuedAt = Math.floor((input.nowMs ?? Date.now()) / 1000);
  const nonce = input.nonce ?? crypto.randomUUID();
  if (!/^[0-9a-f-]{36}$/i.test(nonce)) throw new Error("Invalid Mapdown handoff nonce.");
  const payload: Payload = {
    v: VERSION,
    iat: issuedAt,
    exp: issuedAt + TTL_SECONDS,
    nonce,
    sub: input.userId,
    aud: input.audience,
    iss: "https://bcailab.com"
  };
  const payloadSegment = base64Url(encoder.encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(input.secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${DOMAIN}.${payloadSegment}`)
  );
  return {
    token: `${payloadSegment}.${base64Url(new Uint8Array(signature))}`,
    nonceHash: await hashMapdownNonce(nonce),
    expiresAt: (issuedAt + TTL_SECONDS) * 1000
  };
}
