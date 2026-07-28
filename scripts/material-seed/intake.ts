/**
 * Material seed — intake for manually written passages.
 *
 * The README calls the manual path the *default* for library batches ("ask the AI session
 * to write passages"), but there was no tooling for it: you had to hand-assemble the JSON
 * files and invent uuids. This closes that gap, and — more importantly — makes the
 * constraints machine-checked at intake instead of eyeballed, so a batch cannot reach the
 * owner's review with a sentence that is too long or a stray digit in it.
 *
 * Reuses `validatePassage` from generate.ts rather than restating the rules, so the manual
 * and scripted paths can never drift apart on what counts as valid. Digits are a *warning*
 * there (reviewer judgement); here they are an error, because a digit in dictation material
 * is unambiguously wrong — the learner would have to guess whether to type "25" or
 * "twenty-five".
 *
 * Usage:
 *   pnpm tsx scripts/material-seed/intake.ts --band B1 --file batch.json
 *   pnpm tsx scripts/material-seed/intake.ts --band B1 --file batch.json --dry-run
 *
 * Input: a JSON array of { topic, title, sentences[] } — exactly what an AI session
 * returns. Output: one `out/<uuid>.json` per passage, in the shape publish.ts expects.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import {
  DICTATION_BANDS,
  validatePassage,
  type DictationBand,
  type GeneratedPassage
} from "./generate";

const OUT_DIR = path.join(import.meta.dirname, "out");

type IncomingPassage = { topic?: unknown; title?: unknown; sentences?: unknown };

const parseArgs = (): { band: DictationBand; file: string; dryRun: boolean } => {
  const argv = process.argv.slice(2);
  const read = (flag: string): string | null => {
    const index = argv.indexOf(flag);
    return index >= 0 && argv[index + 1] ? argv[index + 1]! : null;
  };
  const band = read("--band");
  if (!band || !DICTATION_BANDS.includes(band as DictationBand)) {
    throw new Error(`--band is required and must be one of: ${DICTATION_BANDS.join(", ")}`);
  }
  const file = read("--file");
  if (!file) throw new Error("--file <path to JSON array> is required.");
  return {
    band: band as DictationBand,
    file: path.resolve(process.cwd(), file),
    dryRun: argv.includes("--dry-run")
  };
};

/** Title rules the prompt asks for, checked rather than trusted. */
const validateTitle = (title: string): void => {
  const words = title.trim().split(/\s+/).filter(Boolean).length;
  if (words < 2 || words > 6) {
    throw new Error(`Title should be two to six words, got ${words}: "${title}"`);
  }
  if (/[.,;:!?]$/.test(title.trim())) {
    throw new Error(`Title should not end in punctuation: "${title}"`);
  }
  if (/^["'`]|["'`]$/.test(title.trim())) {
    throw new Error(`Title should not be quoted: "${title}"`);
  }
};

const main = async () => {
  const { band, file, dryRun } = parseArgs();
  const raw = JSON.parse(await readFile(file, "utf8")) as unknown;
  if (!Array.isArray(raw)) throw new Error("Input must be a JSON array of passages.");

  const prepared: GeneratedPassage[] = [];
  const seenTitles = new Set<string>();

  raw.forEach((entry, position) => {
    const incoming = entry as IncomingPassage;
    const where = `passage ${position + 1}`;

    if (typeof incoming.title !== "string" || typeof incoming.topic !== "string") {
      throw new Error(`${where}: title and topic must be strings.`);
    }
    if (!Array.isArray(incoming.sentences)) {
      throw new Error(`${where}: sentences must be an array.`);
    }

    const title = incoming.title.trim();
    const key = title.toLowerCase();
    if (seenTitles.has(key)) throw new Error(`${where}: duplicate title "${title}" in this batch.`);
    seenTitles.add(key);
    validateTitle(title);

    const passage: GeneratedPassage = {
      id: randomUUID(),
      band,
      topic: incoming.topic.trim(),
      title,
      sentences: incoming.sentences.map((sentence) => String(sentence).trim())
    };

    // Hard constraints, shared with the scripted path.
    const warnings = validatePassage(passage);
    // Digits are only a warning there; for dictation they are disqualifying.
    const digitWarnings = warnings.filter((warning) => warning.includes("digits"));
    if (digitWarnings.length > 0) {
      throw new Error(`${where} "${title}": ${digitWarnings.join(" ")}`);
    }
    for (const warning of warnings) console.warn(`  ⚠ ${title}: ${warning}`);

    prepared.push(passage);
  });

  const longest = Math.max(
    ...prepared.flatMap((passage) => passage.sentences.map((sentence) => sentence.length))
  );
  console.log(
    `${prepared.length} ${band} passage(s) valid · longest sentence ${longest}/110 chars`
  );

  if (dryRun) {
    for (const passage of prepared) {
      console.log(`  ✓ ${passage.topic} — "${passage.title}" (${passage.sentences.length} sentences)`);
    }
    console.log("Dry run: nothing written.");
    return;
  }

  await mkdir(OUT_DIR, { recursive: true });
  for (const passage of prepared) {
    const target = path.join(OUT_DIR, `${passage.id}.json`);
    await writeFile(target, `${JSON.stringify(passage, null, 2)}\n`, "utf8");
    console.log(`  ✓ ${passage.topic} — "${passage.title}" → ${path.relative(process.cwd(), target)}`);
  }
  console.log("\nReview out/*.json, then publish. Nothing is published by this script.");
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
