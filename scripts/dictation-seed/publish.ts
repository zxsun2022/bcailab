/**
 * Dictation seed — phase 2: publish reviewed passages (TTS → R2 → D1).
 *
 * Standalone Node + tsx script; must NOT import from `apps/web/app/**`, so it
 * reimplements the service-account TTS auth, mirroring
 * `apps/web/app/utils/google-tts.server.ts` (design §3).
 *
 * Usage:
 *   pnpm tsx scripts/dictation-seed/publish.ts out/<file>.json [more files...]
 *   pnpm tsx scripts/dictation-seed/publish.ts --all            # every out/*.json
 *   Add --local to target the local D1/R2 (plumbing test; TTS still runs for real).
 *
 * Seeding the local dev server needs two overrides, because the vite dev server's
 * Cloudflare proxy resolves bindings differently than a bare `wrangler --local`:
 *   --persist-to <dir>    it persists under apps/web/.wrangler/state (its own cwd),
 *                         while `wrangler --local` uses the repo root
 *   --r2-bucket <name>    it binds R2 to preview_bucket_name from wrangler.toml
 * So:
 *   ... --all --local --persist-to apps/web/.wrangler/state --r2-bucket bcailab-assets-preview
 *
 * Reads GOOGLE_TTS_SERVICE_ACCOUNT_JSON from the environment, falling back to the
 * repo-root .dev.vars (same value either way).
 *
 * Per passage: pick a Chirp3 en-US voice (MALE/FEMALE alternating by uuid parity),
 * synthesize one MP3 per sentence, upload to R2 at dictation/{passageId}/{idx}.mp3,
 * then insert the D1 rows. D1 insert happens LAST, so a passage present in D1 is
 * fully published — that is also the idempotency check: passages whose id already
 * exists are skipped, and the script is safe to re-run. Synthesized MP3s are cached
 * in out/audio/ (gitignored), so a re-run after a partial failure does not re-spend
 * TTS on sentences it already synthesized.
 */

import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import os from "node:os";

const SEED_DIR = import.meta.dirname;
const REPO_ROOT = path.resolve(SEED_DIR, "..", "..");
const OUT_DIR = path.join(SEED_DIR, "out");
const AUDIO_CACHE_DIR = path.join(OUT_DIR, "audio");

/** Overridable with --r2-bucket; the dev server binds the preview bucket instead. */
let r2Bucket = "bcailab-assets";
const D1_NAME = "bcailab-db";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const VOICES_URL = "https://texttospeech.googleapis.com/v1/voices";
const SYNTHESIZE_URL = "https://texttospeech.googleapis.com/v1/text:synthesize";
const TTS_SCOPE = "https://www.googleapis.com/auth/cloud-platform";

type SeedPassage = {
  id: string;
  band: string;
  topic: string;
  title: string;
  sentences: string[];
};

/* ---------- env ---------- */

const loadEnvValue = async (key: string): Promise<string> => {
  const fromEnv = process.env[key]?.trim();
  if (fromEnv) return fromEnv;
  try {
    const raw = await readFile(path.join(REPO_ROOT, ".dev.vars"), "utf8");
    for (const line of raw.split("\n")) {
      const eq = line.indexOf("=");
      if (eq > 0 && line.slice(0, eq).trim() === key) {
        let value = line.slice(eq + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        if (value) return value;
      }
    }
  } catch {
    // fall through
  }
  throw new Error(`${key} is not set (environment or .dev.vars).`);
};

/* ---------- Google auth + TTS (mirrors google-tts.server.ts) ---------- */

const textEncoder = new TextEncoder();

const toBase64Url = (value: string | Uint8Array): string => {
  const bytes = typeof value === "string" ? textEncoder.encode(value) : value;
  return Buffer.from(bytes).toString("base64url");
};

let cachedToken: { token: string; expiresAt: number } | null = null;

const getAccessToken = async (): Promise<string> => {
  if (cachedToken && Date.now() + 60_000 < cachedToken.expiresAt) return cachedToken.token;

  const raw = await loadEnvValue("GOOGLE_TTS_SERVICE_ACCOUNT_JSON");
  const serviceAccount = JSON.parse(raw) as { client_email?: string; private_key?: string };
  if (!serviceAccount.client_email || !serviceAccount.private_key) {
    throw new Error("GOOGLE_TTS_SERVICE_ACCOUNT_JSON is missing client_email/private_key.");
  }

  const nowSec = Math.floor(Date.now() / 1000);
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
  const pkcs8 = Buffer.from(
    serviceAccount.private_key
      .replace("-----BEGIN PRIVATE KEY-----", "")
      .replace("-----END PRIVATE KEY-----", "")
      .replace(/\s+/g, ""),
    "base64"
  );
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pkcs8,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, textEncoder.encode(unsigned));
  const assertion = `${unsigned}.${toBase64Url(new Uint8Array(signature))}`;

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });
  if (!response.ok) throw new Error(`Google OAuth HTTP ${response.status}: ${await response.text()}`);
  const json = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token || !json.expires_in) throw new Error("No access token in OAuth response.");
  cachedToken = { token: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return json.access_token;
};

type VoiceInfo = { name: string; ssmlGender: string };

let cachedVoices: VoiceInfo[] | null = null;

const listEnUsVoices = async (): Promise<VoiceInfo[]> => {
  if (cachedVoices) return cachedVoices;
  const token = await getAccessToken();
  const response = await fetch(`${VOICES_URL}?languageCode=en-US`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) throw new Error(`Voices HTTP ${response.status}: ${await response.text()}`);
  const json = (await response.json()) as {
    voices?: Array<{ name?: string; ssmlGender?: string; languageCodes?: string[] }>;
  };
  cachedVoices = (json.voices ?? [])
    .filter((v) => v.name && v.languageCodes?.includes("en-US"))
    .map((v) => ({ name: v.name!, ssmlGender: v.ssmlGender ?? "" }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return cachedVoices;
};

/**
 * Preference chain mirrors `pickReferenceVoice` in esl-passage-reference.server.ts,
 * parameterized by gender: chirp3+gender → chirp3 → neural2+gender → neural2.
 */
const pickVoice = async (gender: "MALE" | "FEMALE"): Promise<string> => {
  const voices = await listEnUsVoices();
  const chain: Array<(v: VoiceInfo) => boolean> = [
    (v) => v.name.includes("Chirp3") && v.ssmlGender === gender,
    (v) => v.name.includes("Chirp3"),
    (v) => v.name.includes("Neural2") && v.ssmlGender === gender,
    (v) => v.name.includes("Neural2")
  ];
  for (const predicate of chain) {
    const match = voices.find(predicate);
    if (match) return match.name;
  }
  throw new Error("No supported American English voice is available.");
};

const synthesizeMp3 = async (text: string, voiceName: string): Promise<Buffer> => {
  const token = await getAccessToken();
  const response = await fetch(SYNTHESIZE_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: "en-US", name: voiceName },
      audioConfig: { audioEncoding: "MP3" }
    })
  });
  if (!response.ok) throw new Error(`TTS HTTP ${response.status}: ${await response.text()}`);
  const json = (await response.json()) as { audioContent?: string };
  if (!json.audioContent) throw new Error("TTS response has no audioContent.");
  return Buffer.from(json.audioContent, "base64");
};

/* ---------- wrangler ---------- */

const wrangler = (args: string[]): string => {
  try {
    return execFileSync("pnpm", ["exec", "wrangler", ...args], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024
    });
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr ?? "";
    const stdout = (error as { stdout?: string }).stdout ?? "";
    throw new Error(
      `wrangler ${args.slice(0, 3).join(" ")} failed:\n${stderr || stdout || String(error)}`
    );
  }
};

/** Set from --persist-to; only meaningful together with --local. */
let persistTo: string | null = null;

const localFlags = (): string[] =>
  persistTo ? ["--local", "--persist-to", persistTo] : ["--local"];

const d1Target = (local: boolean): string[] => (local ? localFlags() : ["--remote"]);

const passageExistsInD1 = (passageId: string, local: boolean): boolean => {
  const output = wrangler([
    "d1", "execute", D1_NAME, ...d1Target(local), "--json",
    "--command", `SELECT id FROM dictation_passages WHERE id = '${passageId}'`
  ]);
  const parsed = JSON.parse(output) as Array<{ results?: unknown[] }>;
  return (parsed[0]?.results?.length ?? 0) > 0;
};

const sqlQuote = (value: string): string => `'${value.replace(/'/g, "''")}'`;

/* ---------- publish ---------- */

const publishPassage = async (filePath: string, local: boolean): Promise<void> => {
  const passage = JSON.parse(await readFile(filePath, "utf8")) as SeedPassage;
  const label = `${passage.band} "${passage.title}"`;

  if (passageExistsInD1(passage.id, local)) {
    console.log(`↷ skip ${label} — already in D1 (${passage.id})`);
    return;
  }

  // Alternate voice gender by uuid parity: deterministic per passage, so re-runs and
  // partial batches always pick the same voice.
  const gender = parseInt(passage.id[0]!, 16) % 2 === 0 ? "MALE" : "FEMALE";
  const voiceName = await pickVoice(gender);
  console.log(`● ${label}: ${passage.sentences.length} sentences, voice ${voiceName}`);

  const cacheDir = path.join(AUDIO_CACHE_DIR, passage.id);
  await mkdir(cacheDir, { recursive: true });

  const sentenceRows: Array<{ id: string; idx: number; text: string; r2Key: string; bytes: number }> = [];
  for (let idx = 0; idx < passage.sentences.length; idx += 1) {
    const text = passage.sentences[idx]!;
    const mp3Path = path.join(cacheDir, `${idx}.mp3`);
    let bytes: number;
    const cached = await stat(mp3Path).catch(() => null);
    if (cached && cached.size > 0) {
      bytes = cached.size;
      console.log(`  ${idx}: cached (${bytes} bytes)`);
    } else {
      const audio = await synthesizeMp3(text, voiceName);
      await writeFile(mp3Path, audio);
      bytes = audio.length;
      console.log(`  ${idx}: synthesized (${bytes} bytes)`);
    }
    const r2Key = `dictation/${passage.id}/${idx}.mp3`;
    wrangler([
      "r2", "object", "put", `${r2Bucket}/${r2Key}`,
      "--file", mp3Path, "--content-type", "audio/mpeg",
      ...(local ? localFlags() : ["--remote"])
    ]);
    sentenceRows.push({ id: randomUUID(), idx, text, r2Key, bytes });
  }

  const statements = [
    `INSERT INTO dictation_passages (id, band, topic, title, voice_name, sentence_count) VALUES (${[
      sqlQuote(passage.id), sqlQuote(passage.band), sqlQuote(passage.topic),
      sqlQuote(passage.title), sqlQuote(voiceName), String(passage.sentences.length)
    ].join(", ")});`,
    ...sentenceRows.map(
      (row) =>
        `INSERT INTO dictation_sentences (id, passage_id, idx, text, r2_key, audio_bytes) VALUES (${[
          sqlQuote(row.id), sqlQuote(passage.id), String(row.idx),
          sqlQuote(row.text), sqlQuote(row.r2Key), String(row.bytes)
        ].join(", ")});`
    )
  ];
  const sqlPath = path.join(os.tmpdir(), `dictation-publish-${passage.id}.sql`);
  await writeFile(sqlPath, `${statements.join("\n")}\n`, "utf8");
  wrangler(["d1", "execute", D1_NAME, ...d1Target(local), "--file", sqlPath]);
  console.log(`✓ published ${label} (${passage.id})`);
};

const main = async () => {
  const argv = process.argv.slice(2);
  const local = argv.includes("--local");
  const persistIndex = argv.indexOf("--persist-to");
  if (persistIndex >= 0) {
    const value = argv[persistIndex + 1];
    if (!value) throw new Error("--persist-to needs a directory.");
    persistTo = path.resolve(process.cwd(), value);
  }
  const bucketIndex = argv.indexOf("--r2-bucket");
  if (bucketIndex >= 0) {
    const value = argv[bucketIndex + 1];
    if (!value) throw new Error("--r2-bucket needs a bucket name.");
    r2Bucket = value;
  }
  const consumed = new Set([persistIndex + 1, bucketIndex + 1]);
  const rest = argv.filter(
    (arg, index) =>
      arg !== "--local" &&
      arg !== "--all" &&
      arg !== "--persist-to" &&
      arg !== "--r2-bucket" &&
      !consumed.has(index)
  );
  const files = argv.includes("--all")
    ? (await readdir(OUT_DIR))
        .filter((name) => name.endsWith(".json"))
        .sort()
        .map((name) => path.join(OUT_DIR, name))
    : rest.map((arg) => path.resolve(process.cwd(), arg));
  if (files.length === 0) {
    throw new Error("Pass one or more out/<file>.json paths, or --all.");
  }
  console.log(`Publishing ${files.length} passage(s) to ${local ? "LOCAL" : "REMOTE"}.`);
  for (const file of files) {
    await publishPassage(file, local);
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
