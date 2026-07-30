import type { Env } from "~/types/env";
import {
  TRANSLATE_LANGUAGES,
  translateLanguageLabel as languageLabel,
  isTranslateLanguageCode,
  type TranslateLanguageCode
} from "~/utils/translate-languages";
import { callGemini, streamGemini, parseJsonFromText, type LlmTask } from "~/utils/llm.server";

type PromptInput = {
  text: string;
  sourceLang: TranslateLanguageCode | "auto";
  targetLang: TranslateLanguageCode;
};

const promptPreamble = (input: PromptInput): string[] => {
  const supported = TRANSLATE_LANGUAGES.map((lang) => `${lang.code} = ${lang.label}`).join(", ");
  const sourceInstruction =
    input.sourceLang === "auto"
      ? "First detect the source language of the text."
      : `The source language is ${languageLabel(input.sourceLang)} (${input.sourceLang}).`;

  return [
    "You are a professional translation engine, similar to DeepL.",
    sourceInstruction,
    `Translate the text into ${languageLabel(input.targetLang)} (${input.targetLang}).`,
    "Rules:",
    "- Produce a natural, fluent, faithful translation. Prefer idiomatic phrasing over literal word order.",
    "- Preserve paragraph breaks and line breaks exactly.",
    "- Preserve inline formatting characters (Markdown, punctuation, numbers, code) as-is.",
    "- Do not add explanations, notes, romanization, or alternatives.",
    "- If the text is already in the target language, return it lightly polished rather than refusing.",
    `- Supported language codes: ${supported}.`
  ];
};

const promptSuffix = (input: PromptInput): string[] => ["Text to translate:", "<<<", input.text, ">>>"];

const buildPrompt = (input: PromptInput): string =>
  [
    ...promptPreamble(input),
    "",
    'Respond with JSON only, in the shape: {"translation": string, "detected_source_language": string}',
    'where "detected_source_language" is the code of the language the source text is written in',
    "(pick the closest supported code).",
    "",
    ...promptSuffix(input)
  ].join("\n");

/**
 * Streaming prompt. JSON is unusable here — the translation would only be readable
 * once the closing brace arrives — so the model emits a one-line header carrying the
 * detected language, then the translation as plain text. The header is stripped
 * server-side before any delta reaches the client.
 */
const buildStreamPrompt = (input: PromptInput): string =>
  [
    ...promptPreamble(input),
    "",
    "Output format — plain text, exactly this shape and nothing else:",
    "- Line 1: `#lang: <code>`, the code of the language the source text is written in",
    "  (pick the closest supported code).",
    "- Line 2 onwards: the translation, and nothing but the translation.",
    "Do not wrap the output in code fences.",
    "",
    ...promptSuffix(input)
  ].join("\n");

const LANG_HEADER = /^#lang:\s*([A-Za-z-]+)\s*$/;
const LANG_HEADER_TOKEN = "#lang:";

/**
 * Maps a model-reported language code onto the supported list, case-insensitively —
 * the script subtags (`zh-Hans`) are the ones a model is most likely to case differently
 * from the canonical spelling.
 */
const resolveLanguageCode = (raw: string): TranslateLanguageCode | null => {
  const value = raw.trim();
  if (!value) return null;
  if (isTranslateLanguageCode(value)) return value;
  const match = TRANSLATE_LANGUAGES.find(
    (lang) => lang.code.toLowerCase() === value.toLowerCase()
  );
  return match ? match.code : null;
};

/** True while a partial first line could still grow into the `#lang:` header. */
const looksLikeHeaderPrefix = (buffer: string): boolean => {
  const head = buffer.trimStart();
  if (head.length === 0) return true;
  if (head.length >= LANG_HEADER_TOKEN.length) {
    return head.startsWith(LANG_HEADER_TOKEN) && head.length < 32;
  }
  return LANG_HEADER_TOKEN.startsWith(head);
};

export type TranslateResult = {
  translation: string;
  detectedSourceLanguage: TranslateLanguageCode | null;
  modelName: string;
};

export const translateText = async (input: {
  env: Env;
  task: Extract<LlmTask, "translate" | "translate_anonymous">;
  text: string;
  sourceLang: TranslateLanguageCode | "auto";
  targetLang: TranslateLanguageCode;
}): Promise<TranslateResult> => {
  const { modelName, text } = await callGemini({
    env: input.env,
    task: input.task,
    parts: [{ text: buildPrompt(input) }],
    generationConfig: { responseMimeType: "application/json", temperature: 0.2 }
  });

  let parsed: { translation?: unknown; detected_source_language?: unknown };
  try {
    parsed = parseJsonFromText(text) as typeof parsed;
  } catch {
    throw new Error("Gemini response is not valid JSON.");
  }
  if (!parsed || typeof parsed.translation !== "string" || !parsed.translation.trim()) {
    throw new Error("Gemini response JSON does not match expected schema.");
  }

  const detectedRaw =
    typeof parsed.detected_source_language === "string" ? parsed.detected_source_language : "";
  const detectedSourceLanguage = resolveLanguageCode(detectedRaw);

  return { translation: parsed.translation, detectedSourceLanguage, modelName };
};

export type TranslateStreamChunk =
  | { type: "detected"; language: TranslateLanguageCode | null }
  | { type: "delta"; text: string };

/**
 * Streams a translation. Emits at most one `detected` chunk (as soon as the header line
 * is complete), then `delta` chunks carrying translation text in arrival order.
 */
export const streamTranslateText = (input: {
  env: Env;
  task: Extract<LlmTask, "translate" | "translate_anonymous">;
  text: string;
  sourceLang: TranslateLanguageCode | "auto";
  targetLang: TranslateLanguageCode;
  signal?: AbortSignal;
}): AsyncGenerator<TranslateStreamChunk> =>
  splitLangHeader(
    (async function* () {
      const { textStream } = await streamGemini({
        env: input.env,
        task: input.task,
        parts: [{ text: buildStreamPrompt(input) }],
        generationConfig: { temperature: 0.2 },
        signal: input.signal
      });
      yield* textStream;
    })()
  );

/**
 * Splits the model's `#lang:` header off the front of a raw token stream and turns the
 * rest into `delta` chunks. Held separate from the model call so the buffering rules —
 * a header split across chunks, a missing header, a header that is not the first thing
 * emitted — are testable without a network.
 */
export const splitLangHeader = async function* (
  source: AsyncIterable<string>
): AsyncGenerator<TranslateStreamChunk> {
  let headerDone = false;
  let buffer = "";
  let emitted = false;

  for await (const delta of source) {
    buffer += delta;

    if (!headerDone) {
      const newline = buffer.indexOf("\n");
      if (newline < 0) {
        // Keep buffering while the first line could still turn out to be the header;
        // bail out as soon as it cannot, so a model that skips it costs no latency.
        if (looksLikeHeaderPrefix(buffer)) continue;
        headerDone = true;
        yield { type: "detected", language: null };
      } else {
        const match = LANG_HEADER.exec(buffer.slice(0, newline).trim());
        headerDone = true;
        yield { type: "detected", language: resolveLanguageCode(match?.[1] ?? "") };
        // A recognized header is consumed along with its newline; anything else is content.
        if (match) buffer = buffer.slice(newline + 1);
      }
    }

    if (buffer) {
      emitted = true;
      yield { type: "delta", text: buffer };
      buffer = "";
    }
  }

  // The stream can end while the first line is still incomplete — a one-line output has
  // no trailing newline to trigger the check above.
  if (!headerDone) {
    const match = LANG_HEADER.exec(buffer.trim());
    yield { type: "detected", language: resolveLanguageCode(match?.[1] ?? "") };
    if (match) buffer = "";
  }
  if (buffer) {
    emitted = true;
    yield { type: "delta", text: buffer };
  }
  if (!emitted) throw new Error("Gemini stream produced no translation text.");
};
