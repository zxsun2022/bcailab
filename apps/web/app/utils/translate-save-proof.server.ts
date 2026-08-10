import {
  isTranslateLanguageCode,
  type TranslateLanguageCode
} from "~/utils/translate-languages";

const PROOF_DOMAIN = "bcailab:translate-save:v1";
const PROOF_VERSION = 1 as const;
const PROOF_TTL_SECONDS = 15 * 60;
const CLOCK_SKEW_SECONDS = 60;
const MAX_SOURCE_CHARS = 20_000;
const MAX_TRANSLATED_CHARS = 40_000;

export type TranslationSaveSnapshot = {
  sourceLanguage: TranslateLanguageCode | "auto";
  detectedSourceLanguage: TranslateLanguageCode | null;
  targetLanguage: TranslateLanguageCode;
  sourceText: string;
  translatedText: string;
};

type TranslationSaveProofPayload = {
  v: 1;
  iat: number;
  exp: number;
  cid: string;
  sub: string;
  digest: string;
};

export class TranslationSaveProofError extends Error {
  constructor(readonly code: "invalid" | "expired" | "subject" | "snapshot") {
    super("The completed translation cannot be verified.");
    this.name = "TranslationSaveProofError";
  }
}

const normalizeText = (value: string): string =>
  value.replace(/\r\n?/g, "\n").normalize("NFC");

export const normalizeTranslationSaveSnapshot = (
  input: TranslationSaveSnapshot
): TranslationSaveSnapshot => {
  const sourceText = normalizeText(input.sourceText);
  const translatedText = normalizeText(input.translatedText);
  if (
    (input.sourceLanguage !== "auto" && !isTranslateLanguageCode(input.sourceLanguage)) ||
    !isTranslateLanguageCode(input.targetLanguage) ||
    (input.detectedSourceLanguage !== null &&
      !isTranslateLanguageCode(input.detectedSourceLanguage)) ||
    !sourceText.trim() ||
    !translatedText.trim() ||
    sourceText.length > MAX_SOURCE_CHARS ||
    translatedText.length > MAX_TRANSLATED_CHARS ||
    (input.sourceLanguage !== "auto" && input.sourceLanguage === input.targetLanguage)
  ) {
    throw new TranslationSaveProofError("snapshot");
  }
  return {
    sourceLanguage: input.sourceLanguage,
    detectedSourceLanguage: input.detectedSourceLanguage,
    targetLanguage: input.targetLanguage,
    sourceText,
    translatedText
  };
};

const encodeBase64Url = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const decodeBase64Url = (value: string): Uint8Array => {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new TranslationSaveProofError("invalid");
  const padded = `${value.replace(/-/g, "+").replace(/_/g, "/")}${"=".repeat((4 - value.length % 4) % 4)}`;
  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    throw new TranslationSaveProofError("invalid");
  }
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

const importHmacKey = (secret: string) => {
  if (!secret) throw new TranslationSaveProofError("invalid");
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
};

const canonicalSnapshot = (snapshot: TranslationSaveSnapshot): string =>
  JSON.stringify([
    snapshot.sourceLanguage,
    snapshot.detectedSourceLanguage,
    snapshot.targetLanguage,
    snapshot.sourceText,
    snapshot.translatedText
  ]);

const snapshotDigest = async (snapshot: TranslationSaveSnapshot): Promise<string> =>
  encodeBase64Url(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalSnapshot(snapshot)))
    )
  );

const signingBytes = (payloadSegment: string): Uint8Array =>
  new TextEncoder().encode(`${PROOF_DOMAIN}.${payloadSegment}`);

export const translateSaveProofSubject = (input: {
  userId: string | null;
  anonId: string;
}): string => input.userId ? `user:${input.userId}` : `anon:${input.anonId}`;

export const createTranslationSaveProof = async (input: {
  secret: string;
  subject: string;
  snapshot: TranslationSaveSnapshot;
  nowMs?: number;
  completionId?: string;
}): Promise<string> => {
  const snapshot = normalizeTranslationSaveSnapshot(input.snapshot);
  const issuedAt = Math.floor((input.nowMs ?? Date.now()) / 1000);
  const completionId = input.completionId ?? crypto.randomUUID();
  if (!/^[0-9a-f-]{36}$/i.test(completionId) || !/^(?:user|anon):.+/.test(input.subject)) {
    throw new TranslationSaveProofError("invalid");
  }
  const payload: TranslationSaveProofPayload = {
    v: PROOF_VERSION,
    iat: issuedAt,
    exp: issuedAt + PROOF_TTL_SECONDS,
    cid: completionId,
    sub: input.subject,
    digest: await snapshotDigest(snapshot)
  };
  const payloadSegment = encodeBase64Url(
    new TextEncoder().encode(JSON.stringify(payload))
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    await importHmacKey(input.secret),
    signingBytes(payloadSegment).buffer as ArrayBuffer
  );
  return `${payloadSegment}.${encodeBase64Url(new Uint8Array(signature))}`;
};

export const verifyTranslationSaveProof = async (input: {
  secret: string;
  proof: string;
  acceptedSubjects: string[];
  snapshot: TranslationSaveSnapshot;
  nowMs?: number;
}): Promise<{
  completionId: string;
  snapshot: TranslationSaveSnapshot;
}> => {
  const [payloadSegment, signatureSegment, extra] = input.proof.split(".");
  if (!payloadSegment || !signatureSegment || extra) {
    throw new TranslationSaveProofError("invalid");
  }
  const validSignature = await crypto.subtle.verify(
    "HMAC",
    await importHmacKey(input.secret),
    decodeBase64Url(signatureSegment).buffer as ArrayBuffer,
    signingBytes(payloadSegment).buffer as ArrayBuffer
  );
  if (!validSignature) throw new TranslationSaveProofError("invalid");

  let payload: TranslationSaveProofPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(payloadSegment)));
  } catch {
    throw new TranslationSaveProofError("invalid");
  }
  if (
    payload?.v !== PROOF_VERSION ||
    !Number.isInteger(payload.iat) ||
    !Number.isInteger(payload.exp) ||
    payload.exp - payload.iat !== PROOF_TTL_SECONDS ||
    !/^[0-9a-f-]{36}$/i.test(payload.cid) ||
    typeof payload.sub !== "string" ||
    typeof payload.digest !== "string"
  ) {
    throw new TranslationSaveProofError("invalid");
  }
  const now = Math.floor((input.nowMs ?? Date.now()) / 1000);
  if (payload.iat > now + CLOCK_SKEW_SECONDS || payload.exp < now) {
    throw new TranslationSaveProofError("expired");
  }
  if (!input.acceptedSubjects.includes(payload.sub)) {
    throw new TranslationSaveProofError("subject");
  }
  const snapshot = normalizeTranslationSaveSnapshot(input.snapshot);
  if (await snapshotDigest(snapshot) !== payload.digest) {
    throw new TranslationSaveProofError("snapshot");
  }
  return { completionId: payload.cid, snapshot };
};
