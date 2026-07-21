/**
 * Dictation seed — phase 1: generate passage JSON for human review.
 *
 * Standalone Node + tsx script. It must NOT import from `apps/web/app/**` (Remix
 * path aliases), so it duplicates a ~30-line Gemini call. The model mirrors the
 * `dictation_generate` entry in `apps/web/app/utils/llm.server.ts` — that routing
 * table stays the documented control point (design §3, §8).
 *
 * Usage:
 *   GEMINI_API_KEY=... pnpm tsx scripts/dictation-seed/generate.ts --band B1 --count 5
 *   Optional: --topic "travel" to pin a topic instead of rotating.
 *
 * Output: one JSON file per passage in scripts/dictation-seed/out/
 *   { "id": "<uuid>", "band": "B1", "topic": "...", "title": "...", "sentences": [...] }
 *
 * Review the text by eye, then run publish.ts (phase 2: TTS + R2 + D1).
 */

import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

export const DICTATION_BANDS = ["A2", "B1", "B2", "C1"] as const;
export type DictationBand = (typeof DICTATION_BANDS)[number];

export const DICTATION_TOPICS = [
  "daily routines",
  "travel",
  "work",
  "food",
  "weather"
] as const;

/** Mirrors `dictation_generate` in the app's LLM routing table (design §8). */
export const DICTATION_GENERATE_MODEL = "gemini-flash-latest";

export const DICTATION_SENTENCE_MIN = 8;
export const DICTATION_SENTENCE_MAX = 12;
export const DICTATION_SENTENCE_MAX_CHARS = 110;

/**
 * Exported as a plain constant-builder so Dictation v2 can lift it into the runtime
 * material-generation service without archaeology (design §10). The LLM outputs the
 * sentence array directly — never generate prose and segment it afterwards.
 */
export const buildDictationPrompt = (band: DictationBand, topic: string): string =>
  `You write short listening-dictation passages for English learners.

Write one passage at CEFR level ${band} about "${topic}".

Rules:
- ${DICTATION_SENTENCE_MIN} to ${DICTATION_SENTENCE_MAX} sentences, output as a JSON array of strings (one sentence per entry).
- Each sentence is at most ${DICTATION_SENTENCE_MAX_CHARS} characters.
- Vocabulary and grammar must be appropriate for CEFR ${band}.
- Self-contained everyday content; no proper nouns that are ambiguous to spell.
- Write every number as words ("twenty-five", never "25"). No digits anywhere.
- Give the passage a short title (a few words).

Respond with JSON only, no markdown fences:
{"title": "...", "sentences": ["...", "..."]}`;

export type GeneratedPassage = {
  id: string;
  band: DictationBand;
  topic: string;
  title: string;
  sentences: string[];
};

const OUT_DIR = path.join(import.meta.dirname, "out");

const callGemini = async (prompt: string): Promise<string> => {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set (same value as .dev.vars).");
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${DICTATION_GENERATE_MODEL}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.9, responseMimeType: "application/json" }
      })
    }
  );
  if (!response.ok) {
    throw new Error(`Gemini HTTP ${response.status}: ${await response.text()}`);
  }
  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    error?: { message?: string };
  };
  if (data.error?.message) throw new Error(`Gemini error: ${data.error.message}`);
  const text =
    data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
  if (!text.trim()) throw new Error("Gemini returned no text.");
  return text;
};

const parseModelJson = (text: string): { title: string; sentences: string[] } => {
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "");
  const parsed = JSON.parse(stripped) as { title?: unknown; sentences?: unknown };
  if (typeof parsed.title !== "string" || !Array.isArray(parsed.sentences)) {
    throw new Error("Model output missing title or sentences array.");
  }
  return {
    title: parsed.title.trim(),
    sentences: parsed.sentences.map((sentence) => String(sentence).trim())
  };
};

/** Throws on hard violations; returns warnings for soft ones (reviewer judgement). */
export const validatePassage = (passage: GeneratedPassage): string[] => {
  const warnings: string[] = [];
  if (
    passage.sentences.length < DICTATION_SENTENCE_MIN ||
    passage.sentences.length > DICTATION_SENTENCE_MAX
  ) {
    throw new Error(
      `Expected ${DICTATION_SENTENCE_MIN}-${DICTATION_SENTENCE_MAX} sentences, got ${passage.sentences.length}.`
    );
  }
  passage.sentences.forEach((sentence, index) => {
    if (!sentence) throw new Error(`Sentence ${index} is empty.`);
    if (sentence.length > DICTATION_SENTENCE_MAX_CHARS) {
      throw new Error(`Sentence ${index} exceeds ${DICTATION_SENTENCE_MAX_CHARS} chars: "${sentence}"`);
    }
    if (/\d/.test(sentence)) {
      warnings.push(`Sentence ${index} contains digits (should be words): "${sentence}"`);
    }
  });
  if (!passage.title) throw new Error("Empty title.");
  return warnings;
};

const parseArgs = (): { band: DictationBand; count: number; topic: string | null } => {
  const argv = process.argv.slice(2);
  const read = (flag: string): string | null => {
    const index = argv.indexOf(flag);
    return index >= 0 && argv[index + 1] ? argv[index + 1]! : null;
  };
  const band = read("--band");
  if (!band || !DICTATION_BANDS.includes(band as DictationBand)) {
    throw new Error(`--band is required and must be one of: ${DICTATION_BANDS.join(", ")}`);
  }
  const count = Number(read("--count") ?? "5");
  if (!Number.isInteger(count) || count < 1 || count > 20) {
    throw new Error("--count must be an integer between 1 and 20.");
  }
  return { band: band as DictationBand, count, topic: read("--topic") };
};

const main = async () => {
  const { band, count, topic } = parseArgs();
  await mkdir(OUT_DIR, { recursive: true });

  for (let i = 0; i < count; i += 1) {
    const passageTopic = topic ?? DICTATION_TOPICS[i % DICTATION_TOPICS.length]!;
    const raw = await callGemini(buildDictationPrompt(band, passageTopic));
    const { title, sentences } = parseModelJson(raw);
    const passage: GeneratedPassage = { id: randomUUID(), band, topic: passageTopic, title, sentences };
    const warnings = validatePassage(passage);
    const file = path.join(OUT_DIR, `${passage.id}.json`);
    await writeFile(file, `${JSON.stringify(passage, null, 2)}\n`, "utf8");
    console.log(`✓ ${band} "${title}" (${sentences.length} sentences) → ${path.relative(process.cwd(), file)}`);
    for (const warning of warnings) console.warn(`  ⚠ ${warning}`);
  }
};

// Only run when executed directly (constants above are importable by publish.ts / v2).
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
