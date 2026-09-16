/**
 * Reading grader variance spike (roadmap Next, confirmed 2026-07-21).
 *
 * Calls the reading evaluator N times against the SAME (audio, passage) pair, with
 * identical parameters, and reports how much the scores and CEFR guess move between calls.
 *
 * Why this exists: the reading evaluator is a single LLM call that judges pronunciation,
 * fluency, etc. from audio — unlike dictation, which scores with a deterministic diff. The
 * learner model currently down-weights reading observations on the *assumption* that this
 * judgment is noisier than a deterministic measurement (learner-model-notes §1). This script
 * measures repeatability, not correctness or bias. A stable wrong judgement can have zero
 * variance. SOURCE_WEIGHT stays unchanged; context bias is tested by scripts/grader-bias.ts.
 *
 * Standalone Node + tsx script, run manually, not deployed. It shares the application's
 * full prompt and output normalizer so highlights and the eight-highlight cap are measured
 * alongside scores. Historical reports used a reduced prompt and are not direct controls.
 * A single recording is a preliminary screen only; it cannot enable Reading context.
 *
 * Usage:
 *   pnpm tsx scripts/grader-variance.ts --audio ./sample-short.mp3 --passage ./sample-short.txt --label short
 *   pnpm tsx scripts/grader-variance.ts --audio ./sample-long.mp3 --passage ./sample-long.txt --label long --runs 5
 *
 * Needs GEMINI_API_KEY (falls back to reading it from .dev.vars, same as
 * scripts/material-seed/publish.ts). Each run performs one real Gemini call — this costs
 * real tokens against the pinned reading_eval model (see MODEL below).
 *
 * Output: docs/spikes/grader-variance-{label}-{yyyymmdd}.md
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { buildPrompt as buildReadingPrompt, normalizeEvalOutput } from "../apps/web/app/utils/esl-reading-eval.server";
import type { EslLearnerProfileData, EslReadingEvaluationOutput } from "../apps/web/app/utils/esl-reading";
import { analyzePassage } from "../apps/web/app/utils/passage-tags";
import { attributeReadingErrors } from "../apps/web/app/utils/learner-model";

/** Mirrors the `reading_eval` entry in `apps/web/app/utils/llm.server.ts` (EVAL_MODEL).
 *  Override with --model if you want to
 *  compare a different candidate model's variance. */
const DEFAULT_MODEL = "gemini-3.6-flash";
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const SPIKES_DIR = path.join(REPO_ROOT, "docs", "spikes");

/* ---------- env ---------- */

/** Same fallback pattern as scripts/material-seed/publish.ts: env var, else .dev.vars. */
export const loadEnvValue = async (key: string): Promise<string | null> => {
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
    // .dev.vars absent — fall through to null.
  }
  return null;
};

/* ---------- args ---------- */

type Args = {
  audioPath: string;
  passagePath: string;
  briefPath: string | null;
  runs: number;
  mode: "reading" | "recitation";
  label: string;
  model: string;
  lang: "zh" | "en";
};

const parseArgs = (): Args => {
  const argv = process.argv.slice(2);
  const read = (flag: string): string | null => {
    const index = argv.indexOf(flag);
    return index >= 0 && argv[index + 1] ? argv[index + 1]! : null;
  };

  const audioPath = read("--audio");
  const passagePath = read("--passage");
  if (!audioPath || !passagePath) {
    throw new Error("Usage: --audio <file> --passage <text file> [--brief <file>] [--runs 5] [--label short] [--mode reading] [--model gemini-3.6-flash] [--lang zh]");
  }

  const runs = Number(read("--runs") ?? "5");
  if (!Number.isInteger(runs) || runs < 2 || runs > 20) {
    throw new Error("--runs must be an integer between 2 and 20.");
  }

  const mode = read("--mode") ?? "reading";
  if (mode !== "reading" && mode !== "recitation") {
    throw new Error("--mode must be 'reading' or 'recitation'.");
  }

  const lang = read("--lang") ?? "zh";
  if (lang !== "zh" && lang !== "en") {
    throw new Error("--lang must be 'zh' or 'en'.");
  }

  return {
    briefPath: read("--brief"),
    audioPath: path.resolve(audioPath),
    passagePath: path.resolve(passagePath),
    runs,
    mode,
    label: read("--label") ?? "run",
    model: read("--model") ?? DEFAULT_MODEL,
    lang
  };
};

/* ---------- audio ---------- */

const MIME_BY_EXT: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".webm": "audio/webm",
  ".ogg": "audio/ogg"
};

export const inferMimeType = (filePath: string): string => {
  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME_BY_EXT[ext];
  if (!mime) throw new Error(`Unrecognized audio extension "${ext}". Supported: ${Object.keys(MIME_BY_EXT).join(", ")}`);
  return mime;
};

/** Chunked to avoid the call-stack blowup a single `String.fromCharCode(...bytes)` risks on
 *  a large file — the failure mode noted against the app's own toBase64 in earlier review. */
const toBase64 = (bytes: Uint8Array): string => {
  const CHUNK = 8192;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return Buffer.from(binary, "binary").toString("base64");
};

/* ---------- production prompt, with experimental context only in this script ---------- */

export const buildSpikePrompt = (input: {
  passageText: string;
  mode: "reading" | "recitation";
  lang: "zh" | "en";
  durationSeconds?: number | null;
  brief?: string;
  learnerProfile?: EslLearnerProfileData | null;
}): string => {
  if (input.brief && input.learnerProfile) throw new Error("Use either a brief or the legacy profile, not both.");
  const prompt = buildReadingPrompt({
    passageText: input.passageText,
    mode: input.mode,
    outputLanguage: input.lang,
    durationSeconds: input.durationSeconds ?? null,
    history: [],
    learnerProfile: input.learnerProfile ?? null
  });
  if (!input.brief) return prompt;
  // No history in this experiment: the passage immediately follows the rubric/profile section.
  const marker = "\n\n## Passage text\n";
  const position = prompt.indexOf(marker);
  if (position < 0) throw new Error("Production prompt changed: cannot locate context insertion point.");
  return prompt.slice(0, position) + "\n\n" + input.brief + prompt.slice(position);
};

/* ---------- Gemini call ---------- */

export type ParsedResult = {
  highlights: EslReadingEvaluationOutput["highlights"];
  overall: number;
  pronunciation: number;
  stress_rhythm: number;
  fluency: number;
  clarity: number;
  cefr_guess: string | null;
  cefr_confidence: number;
};


const parseJsonFromText = (input: string): unknown => {
  const raw = input.trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const payload = (fenced ? fenced[1] : raw).trim();
  try {
    return JSON.parse(payload);
  } catch {
    const start = payload.indexOf("{");
    const end = payload.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try { return JSON.parse(payload.slice(start, end + 1)); } catch { /* no response text in logs */ }
    }
    throw new Error("Response is not valid JSON.");
  }
};

export const callOnce = async (input: {
  apiKey: string;
  baseUrl?: string;
  model: string;
  prompt: string;
  audioBase64: string;
  audioMime: string;
}): Promise<{ result: ParsedResult; elapsedMs: number }> => {
  const started = performance.now();
  const response = await fetch(
    `${input.baseUrl || GEMINI_BASE_URL}/models/${encodeURIComponent(input.model)}:generateContent?key=${encodeURIComponent(input.apiKey)}`,
    {
      signal: AbortSignal.timeout(120_000),
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: input.prompt },
              { inline_data: { mime_type: input.audioMime, data: input.audioBase64 } }
            ]
          }
        ],
        generationConfig: { responseMimeType: "application/json", temperature: 0.2 }
      })
    }
  );
  const elapsedMs = performance.now() - started;

  if (!response.ok) {
    throw new Error(`Gemini HTTP ${response.status}`);
  }
  const json = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    error?: { message?: string };
  };
  if (json.error?.message) throw new Error("Gemini returned an API error.");
  const text = json.candidates?.[0]?.content?.parts?.find((p) => typeof p.text === "string")?.text;
  if (!text) throw new Error("Gemini response missing text content.");

  return { result: parseSpikeResult(text), elapsedMs };
};

/** Strict experiment parsing: malformed responses cannot masquerade as clean recordings. */
export const parseSpikeResult = (text: string): ParsedResult => {
  const raw = parseJsonFromText(text);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid evaluation object.");
  const parsed = raw as Record<string, unknown>;
  const scores = (parsed.scores ?? {}) as Record<string, unknown>;
  for (const key of ["overall", "pronunciation", "stress_rhythm", "fluency", "clarity"]) {
    if (typeof scores[key] !== "number" || !Number.isFinite(scores[key]) || Number(scores[key]) < 0 || Number(scores[key]) > 100) {
      throw new Error("Invalid evaluation scores; no heuristic fallback is allowed in an experiment.");
    }
  }
  if (!Array.isArray(parsed.highlights)) throw new Error("Missing highlights in evaluation response.");
  const normalized = normalizeEvalOutput(parsed, "en");
  if (!normalized || normalized.highlights.length !== Math.min(parsed.highlights.length, 8)) {
    throw new Error("Invalid evaluation highlights; refusing to silently discard them.");
  }
  const result: ParsedResult = {
    ...normalized.scores,
    cefr_guess: normalized.cefr_guess,
    cefr_confidence: normalized.cefr_confidence,
    highlights: normalized.highlights
  };
  return result;
};

/* ---------- stats ---------- */

const mean = (values: number[]): number => values.reduce((s, v) => s + v, 0) / values.length;

const stddev = (values: number[]): number => {
  const m = mean(values);
  const variance = values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
};

const modeAgreementRate = (values: (string | null)[]): { mode: string | null; rate: number } => {
  const counts = new Map<string | null, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let bestKey: string | null = null;
  let bestCount = 0;
  for (const [key, count] of counts) {
    if (count > bestCount) {
      bestKey = key;
      bestCount = count;
    }
  }
  return { mode: bestKey, rate: bestCount / values.length };
};

/* ---------- report ---------- */

const DIMENSIONS = ["overall", "pronunciation", "stress_rhythm", "fluency", "clarity"] as const;

const buildReport = (input: {
  label: string;
  model: string;
  mode: string;
  audioPath: string;
  passagePath: string;
  passageText: string;
  briefDigest: string | null;
  results: { result: ParsedResult; elapsedMs: number }[];
}): string => {
  const lines: string[] = [];
  lines.push(`# Grader variance spike — ${input.label}`);
  lines.push("");
  lines.push(`Model: \`${input.model}\` · Practice mode: \`${input.mode}\` · Runs: ${input.results.length}`);
  lines.push(`Audio: \`${path.relative(REPO_ROOT, input.audioPath)}\``);
  lines.push(`Passage: \`${path.relative(REPO_ROOT, input.passagePath)}\``);
  lines.push("");
  lines.push(`Prompt: full production rubric. Brief SHA-256: ${input.briefDigest ?? "none"}.`);
  lines.push("Preliminary screen only: repeatability does not establish absence of bias or enable Reading context.");
  lines.push("");
  lines.push("## Per-run scores");
  lines.push("");
  lines.push("| Run | Overall | Pronunciation | Stress/Rhythm | Fluency | Clarity | CEFR guess | Elapsed |");
  lines.push("|---|---|---|---|---|---|---|---|");
  input.results.forEach(({ result, elapsedMs }, i) => {
    lines.push(
      `| ${i + 1} | ${result.overall} | ${result.pronunciation} | ${result.stress_rhythm} | ${result.fluency} | ${result.clarity} | ${result.cefr_guess ?? "—"} | ${(elapsedMs / 1000).toFixed(1)}s |`
    );
  });
  lines.push("");
  lines.push("## Attributed tag accuracy (production attribution)");
  lines.push("");
  lines.push("| Run | Tag | Hits | Exposure |");
  lines.push("|---|---|---|---|");
  const tags = analyzePassage(input.passageText).tags;
  input.results.forEach(({ result }, index) => {
    for (const [tag, tally] of attributeReadingErrors(tags, result.highlights)) {
      lines.push(`| ${index + 1} | ${tag} | ${tally.hits} | ${tally.exposure} |`);
    }
  });
  lines.push("");
  lines.push("## Standard deviation (0-100 scale)");
  lines.push("");
  lines.push("| Dimension | Mean | Stddev |");
  lines.push("|---|---|---|");
  for (const dim of DIMENSIONS) {
    const values = input.results.map((r) => r.result[dim]);
    lines.push(`| ${dim} | ${mean(values).toFixed(1)} | ${stddev(values).toFixed(2)} |`);
  }
  lines.push("");
  const cefrValues = input.results.map((r) => r.result.cefr_guess);
  const agreement = modeAgreementRate(cefrValues);
  lines.push(
    `CEFR-guess agreement: ${(agreement.rate * 100).toFixed(0)}% (mode: ${agreement.mode ?? "—"})`
  );
  lines.push("");
  const maxStddev = Math.max(...DIMENSIONS.map((dim) => stddev(input.results.map((r) => r.result[dim]))));
  lines.push("## Reading");
  lines.push("");
  lines.push(
    maxStddev > 4
      ? `Max dimension stddev is ${maxStddev.toFixed(2)}, above the roadmap's 4-point working ` +
        "threshold. This is evidence for the reading-grader deterministic split (roadmap Next)."
      : `Max dimension stddev is ${maxStddev.toFixed(2)}, at or below the roadmap's 4-point ` +
        "working threshold. This only measures repeatability on this sample. It does not validate " +
        "accuracy, source weighting, or absence of context bias."
  );
  lines.push("");
  return lines.join("\n");
};

/* ---------- main ---------- */

const main = async () => {
  const args = parseArgs();

  const apiKey = await loadEnvValue("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY not found in env or .dev.vars.");

  const [audioBuffer, passageText] = await Promise.all([
    readFile(args.audioPath),
    readFile(args.passagePath, "utf8")
  ]);
  const audioMime = inferMimeType(args.audioPath);
  const audioBase64 = toBase64(new Uint8Array(audioBuffer));
  const brief = args.briefPath ? await readFile(path.resolve(args.briefPath), "utf8") : "";
  if (args.briefPath && (!brief.trim() || brief.length > 1800)) throw new Error("Brief must contain 1–1800 characters.");
  const prompt = buildSpikePrompt({ passageText: passageText.trim(), mode: args.mode, lang: args.lang, brief });
  const baseUrl = await loadEnvValue("GEMINI_BASE_URL") ?? undefined;

  console.log(`Running ${args.runs} calls against ${args.model} for label "${args.label}"...`);

  const results: { result: ParsedResult; elapsedMs: number }[] = [];
  for (let i = 0; i < args.runs; i += 1) {
    const outcome = await callOnce({ apiKey, baseUrl, model: args.model, prompt, audioBase64, audioMime });
    results.push(outcome);
    console.log(
      `  run ${i + 1}/${args.runs}: overall=${outcome.result.overall} cefr=${outcome.result.cefr_guess ?? "—"} (${(outcome.elapsedMs / 1000).toFixed(1)}s)`
    );
  }

  const report = buildReport({
    label: args.label,
    model: args.model,
    mode: args.mode,
    audioPath: args.audioPath,
    passagePath: args.passagePath,
    passageText: passageText.trim(),
    briefDigest: brief ? createHash("sha256").update(brief).digest("hex") : null,
    results
  });

  await mkdir(SPIKES_DIR, { recursive: true });
  const dateStamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const outFile = path.join(SPIKES_DIR, `grader-variance-${args.label}-${dateStamp}.md`);
  await writeFile(outFile, report, "utf8");
  console.log(`\nWrote ${path.relative(REPO_ROOT, outFile)}`);
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
