import type { Env } from "~/types/env";
import {
  TRANSLATE_LANGUAGES,
  translateLanguageLabel as languageLabel,
  isTranslateLanguageCode,
  type TranslateLanguageCode
} from "~/utils/translate-languages";
import { callGemini, parseJsonFromText, type LlmTask } from "~/utils/llm.server";

const buildPrompt = (input: {
  text: string;
  sourceLang: TranslateLanguageCode | "auto";
  targetLang: TranslateLanguageCode;
}): string => {
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
    `- Supported language codes: ${supported}.`,
    "",
    'Respond with JSON only, in the shape: {"translation": string, "detected_source_language": string}',
    'where "detected_source_language" is the code of the language the source text is written in',
    "(pick the closest supported code).",
    "",
    "Text to translate:",
    "<<<",
    input.text,
    ">>>"
  ].join("\n");
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
  const detectedSourceLanguage = isTranslateLanguageCode(detectedRaw) ? detectedRaw : null;

  return { translation: parsed.translation, detectedSourceLanguage, modelName };
};
