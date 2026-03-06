import type { Env } from "~/types/env";
import { requireEnv } from "~/utils/env.server";
import type { SpeechLanguage } from "~/utils/tts";

type GoogleServiceAccount = {
  client_email: string;
  private_key: string;
};

type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

type GoogleVoicesResponse = {
  voices?: Array<{
    name?: string;
    languageCodes?: string[];
    ssmlGender?: string;
  }>;
  error?: {
    message?: string;
  };
};

type GoogleSynthesizeResponse = {
  audioContent?: string;
  timepoints?: Array<{
    markName?: string;
    timeSeconds?: number | string;
  }>;
  error?: {
    message?: string;
  };
};

export type VoiceFamily = "chirp3" | "neural2";

export type SpeechVoiceOption = {
  languageCode: string;
  name: string;
  label: string;
  family: VoiceFamily;
  ssmlGender: string | null;
};

export type SynthesizeResult = {
  audioBytes: Uint8Array;
  timepoints: Array<{
    markName: string;
    timeSeconds: number;
  }>;
};

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const VOICES_URL = "https://texttospeech.googleapis.com/v1/voices";
// `enableTimePointing` for SSML marks is available on v1beta1 `text:synthesize`.
const SYNTHESIZE_URL = "https://texttospeech.googleapis.com/v1beta1/text:synthesize";
const TTS_SCOPE = "https://www.googleapis.com/auth/cloud-platform";
const ACCESS_TOKEN_SKEW_MS = 60_000;
const VOICE_CACHE_MS = 5 * 60_000;

let tokenCache:
  | {
      token: string;
      expiresAt: number;
      clientEmail: string;
    }
  | null = null;
let voicesCache:
  | {
      voices: SpeechVoiceOption[];
      expiresAt: number;
      clientEmail: string;
    }
  | null = null;

const textEncoder = new TextEncoder();

const toBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
};

const fromBase64 = (value: string): Uint8Array => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const toBase64Url = (value: string | Uint8Array): string => {
  const bytes = typeof value === "string" ? textEncoder.encode(value) : value;
  return toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const parseServiceAccount = (env: Env): GoogleServiceAccount => {
  const raw = requireEnv(env, "GOOGLE_TTS_SERVICE_ACCOUNT_JSON");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("GOOGLE_TTS_SERVICE_ACCOUNT_JSON is not valid JSON.");
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    typeof (parsed as { client_email?: unknown }).client_email !== "string" ||
    typeof (parsed as { private_key?: unknown }).private_key !== "string"
  ) {
    throw new Error("GOOGLE_TTS_SERVICE_ACCOUNT_JSON is missing client_email/private_key.");
  }
  return {
    client_email: (parsed as { client_email: string }).client_email,
    private_key: (parsed as { private_key: string }).private_key
  };
};

const pemToPkcs8 = (pem: string): ArrayBuffer => {
  const stripped = pem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s+/g, "");
  const bytes = fromBase64(stripped);
  const normalized = new Uint8Array(bytes.byteLength);
  normalized.set(bytes);
  return normalized.buffer;
};

const readGoogleError = async (response: Response): Promise<string> => {
  try {
    const json = (await response.json()) as
      | { error?: { message?: string } | string; error_description?: string }
      | null;
    if (!json) return `Google API error (${response.status}).`;
    if (typeof json.error === "string") {
      return `${json.error}${json.error_description ? `: ${json.error_description}` : ""}`;
    }
    if (typeof json.error === "object" && json.error?.message) {
      return json.error.message;
    }
    if (json.error_description) {
      return json.error_description;
    }
  } catch {
    // ignore JSON parse issues
  }
  return `Google API error (${response.status}).`;
};

const createServiceAccountJwt = async (
  serviceAccount: GoogleServiceAccount,
  nowSec: number
): Promise<string> => {
  const header = toBase64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = toBase64Url(
    JSON.stringify({
      iss: serviceAccount.client_email,
      sub: serviceAccount.client_email,
      aud: TOKEN_URL,
      scope: TTS_SCOPE,
      iat: nowSec,
      exp: nowSec + 3600
    })
  );
  const unsigned = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(serviceAccount.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    textEncoder.encode(unsigned)
  );
  return `${unsigned}.${toBase64Url(new Uint8Array(signature))}`;
};

const getAccessToken = async (env: Env): Promise<{ token: string; clientEmail: string }> => {
  const serviceAccount = parseServiceAccount(env);
  const now = Date.now();
  if (
    tokenCache &&
    tokenCache.clientEmail === serviceAccount.client_email &&
    now + ACCESS_TOKEN_SKEW_MS < tokenCache.expiresAt
  ) {
    return { token: tokenCache.token, clientEmail: tokenCache.clientEmail };
  }

  const assertion = await createServiceAccountJwt(
    serviceAccount,
    Math.floor(now / 1000)
  );
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion
  });
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  if (!response.ok) {
    throw new Error(await readGoogleError(response));
  }

  const json = (await response.json()) as GoogleTokenResponse;
  if (!json.access_token || !json.expires_in) {
    throw new Error("Google OAuth token response is missing access token.");
  }

  tokenCache = {
    token: json.access_token,
    expiresAt: now + json.expires_in * 1000,
    clientEmail: serviceAccount.client_email
  };
  return { token: json.access_token, clientEmail: serviceAccount.client_email };
};

const detectVoiceFamily = (name: string): VoiceFamily | null => {
  if (name.includes("Chirp3")) return "chirp3";
  if (name.includes("Neural2")) return "neural2";
  return null;
};

const voiceFamilyPriority = (family: VoiceFamily): number =>
  family === "chirp3" ? 0 : 1;

const loadSupportedVoices = async (
  env: Env,
  languages: SpeechLanguage[]
): Promise<SpeechVoiceOption[]> => {
  const { token, clientEmail } = await getAccessToken(env);
  const now = Date.now();
  if (
    voicesCache &&
    voicesCache.clientEmail === clientEmail &&
    now < voicesCache.expiresAt
  ) {
    return voicesCache.voices;
  }

  const response = await fetch(VOICES_URL, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) {
    throw new Error(await readGoogleError(response));
  }

  const json = (await response.json()) as GoogleVoicesResponse;
  const supportedCodes = new Set(languages.map((lang) => lang.code));
  const collected = new Map<string, SpeechVoiceOption>();

  for (const voice of json.voices ?? []) {
    if (!voice.name || !voice.languageCodes?.length) continue;
    const family = detectVoiceFamily(voice.name);
    if (!family) continue;
    for (const code of voice.languageCodes) {
      if (!supportedCodes.has(code)) continue;
      const key = `${code}|${voice.name}`;
      if (collected.has(key)) continue;
      collected.set(key, {
        languageCode: code,
        name: voice.name,
        label: voice.ssmlGender ? `${voice.name} (${voice.ssmlGender})` : voice.name,
        family,
        ssmlGender: voice.ssmlGender ?? null
      });
    }
  }

  const voices = Array.from(collected.values()).sort((a, b) => {
    if (a.languageCode !== b.languageCode) {
      return a.languageCode.localeCompare(b.languageCode);
    }
    const familyOrder = voiceFamilyPriority(a.family) - voiceFamilyPriority(b.family);
    if (familyOrder !== 0) {
      return familyOrder;
    }
    return a.name.localeCompare(b.name);
  });

  voicesCache = {
    voices,
    expiresAt: now + VOICE_CACHE_MS,
    clientEmail
  };
  return voices;
};

export const getVoicesByLanguage = async (
  env: Env,
  languages: SpeechLanguage[]
): Promise<Record<string, SpeechVoiceOption[]>> => {
  const voices = await loadSupportedVoices(env, languages);
  const grouped: Record<string, SpeechVoiceOption[]> = {};
  for (const language of languages) {
    grouped[language.code] = voices.filter((voice) => voice.languageCode === language.code);
  }
  return grouped;
};

export const synthesizeSpeech = async (input: {
  env: Env;
  input: { type: "ssml" | "text"; value: string };
  languageCode: string;
  voiceName: string;
  enableTimePointing: boolean;
}): Promise<SynthesizeResult> => {
  const { token } = await getAccessToken(input.env);
  const body: {
    input: { ssml?: string; text?: string };
    voice: { languageCode: string; name: string };
    audioConfig: { audioEncoding: "MP3" };
    enableTimePointing?: string[];
  } = {
    input: input.input.type === "ssml" ? { ssml: input.input.value } : { text: input.input.value },
    voice: { languageCode: input.languageCode, name: input.voiceName },
    audioConfig: { audioEncoding: "MP3" }
  };
  if (input.enableTimePointing) {
    body.enableTimePointing = ["SSML_MARK"];
  }
  const response = await fetch(SYNTHESIZE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw new Error(await readGoogleError(response));
  }

  const json = (await response.json()) as GoogleSynthesizeResponse;
  if (!json.audioContent) {
    throw new Error("Google TTS response does not contain audioContent.");
  }

  const timepoints = (json.timepoints ?? [])
    .map((point) => {
      const markName = point.markName ? String(point.markName) : "";
      const timeSeconds = Number(point.timeSeconds);
      return { markName, timeSeconds };
    })
    .filter((point) => point.markName && Number.isFinite(point.timeSeconds));

  return {
    audioBytes: fromBase64(json.audioContent),
    timepoints
  };
};
