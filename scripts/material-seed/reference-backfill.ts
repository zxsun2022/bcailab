/**
 * Material seed — reference-audio backfill.
 *
 * Twenty library passages were published before whole-passage reference recordings existed
 * (material-layer §9.1). They have per-sentence dictation audio, but Reading's reference
 * player stays empty for them: the in-app lazy path only serves a learner's own text, and
 * `publish.ts` skips any passage already in D1. This is the one-off that closes that gap.
 *
 * Usage:
 *   pnpm tsx scripts/material-seed/reference-backfill.ts --dry-run
 *   pnpm tsx scripts/material-seed/reference-backfill.ts
 *   ... --local --persist-to apps/web/.wrangler/state --r2-bucket bcailab-assets-preview
 *
 * Idempotent and resumable: a passage whose row already reads `completed` is skipped, and a
 * synthesized MP3 is cached in `out/audio/<id>/reference.mp3`, so a re-run after a failure
 * uploads from cache instead of paying for TTS again. Unlike `publish.ts`, this never inserts
 * a passage and never touches its text, sentences, tags or metrics — it only adds the
 * missing recording and the five columns that describe it.
 */

import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  genderForPassage,
  pickVoice,
  putObjectToR2,
  setR2Bucket,
  sqlQuote,
  synthesizeMp3,
  wrangler
} from "./publish";

const SEED_DIR = import.meta.dirname;
const AUDIO_CACHE_DIR = path.join(SEED_DIR, "out", "audio");
const D1_NAME = "bcailab-db";

type Candidate = { id: string; title: string; band: string | null; content_text: string };

let persistTo: string | null = null;
let local = false;

const localFlags = (): string[] =>
  persistTo ? ["--local", "--persist-to", persistTo] : ["--local"];

const d1Json = (sql: string): Array<Record<string, unknown>> => {
  const raw = wrangler([
    "d1", "execute", D1_NAME,
    ...(local ? localFlags() : ["--remote"]),
    "--json", "--command", sql
  ]);
  const start = raw.indexOf("[");
  if (start < 0) throw new Error(`Unexpected wrangler output:\n${raw}`);
  return (JSON.parse(raw.slice(start))[0]?.results ?? []) as Array<Record<string, unknown>>;
};

const main = async () => {
  const argv = process.argv.slice(2);
  local = argv.includes("--local");
  const dryRun = argv.includes("--dry-run");
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
    setR2Bucket(value);
  }

  const candidates = d1Json(
    `SELECT id, title, band, content_text FROM passages
      WHERE user_id IS NULL AND deleted_at IS NULL
        AND (reference_audio_status IS NULL OR reference_audio_status <> 'completed')
      ORDER BY band, title`
  ) as unknown as Candidate[];

  console.log(
    `${candidates.length} library passage(s) without a reference recording on ${local ? "LOCAL" : "REMOTE"}.`
  );
  if (candidates.length === 0) return;

  const voices = new Map<string, string>();
  let synthesized = 0;
  for (const passage of candidates) {
    const gender = genderForPassage(passage.id);
    if (!voices.has(gender)) voices.set(gender, await pickVoice(gender));
    const voiceName = voices.get(gender)!;

    const cacheDir = path.join(AUDIO_CACHE_DIR, passage.id);
    const mp3Path = path.join(cacheDir, "reference.mp3");
    const cached = await stat(mp3Path).catch(() => null);
    const label = `${passage.band} "${passage.title}"`;

    if (dryRun) {
      const source = cached && cached.size > 0 ? "upload cached" : "synthesize";
      console.log(`  would ${source} ${label} (voice ${voiceName}, ${passage.content_text.length} chars)`);
      continue;
    }

    let bytes: number;
    if (cached && cached.size > 0) {
      bytes = cached.size;
      console.log(`  ${label}: cached (${bytes} bytes)`);
    } else {
      await mkdir(cacheDir, { recursive: true });
      const audio = await synthesizeMp3(passage.content_text, voiceName);
      await writeFile(mp3Path, audio);
      bytes = audio.length;
      synthesized += 1;
      console.log(`  ${label}: synthesized (${bytes} bytes)`);
    }

    const r2Key = `material/${passage.id}/reference.mp3`;
    putObjectToR2(r2Key, mp3Path, "audio/mpeg", local);
    d1Json(
      `UPDATE passages SET reference_audio_status = 'completed',
         reference_voice_name = ${sqlQuote(voiceName)},
         reference_audio_r2_key = ${sqlQuote(r2Key)},
         reference_audio_bytes = ${bytes},
         reference_audio_created_at = datetime('now'),
         updated_at = datetime('now')
       WHERE id = ${sqlQuote(passage.id)} AND user_id IS NULL;`
    );
    console.log(`  ✓ ${label} (${passage.id})`);
  }

  if (!dryRun) {
    console.log(`Backfilled ${candidates.length} reference recording(s); ${synthesized} synthesized.`);
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
