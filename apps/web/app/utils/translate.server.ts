import type { Env } from "~/types/env";
import {
  TRANSLATE_LANGUAGES,
  translateLanguageLabel as languageLabel,
  isTranslateLanguageCode,
  type TranslateLanguageCode
} from "~/utils/translate-languages";

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_GEMINI_MODEL = "gemini-flash-latest";

type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
  error?: { message?: string };
};

const parseJsonFromText = (text: string): unknown => {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const candidate = fenced ? fenced[1] : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
};

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
  text: string;
  sourceLang: TranslateLanguageCode | "auto";
  targetLang: TranslateLanguageCode;
}): Promise<TranslateResult> => {
  const apiKey = input.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");
  const modelName = input.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;

  const response = await fetch(
    `${GEMINI_BASE_URL}/models/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: buildPrompt(input) }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.2 }
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini request failed (${response.status}): ${errorText.slice(0, 500)}`);
  }

  const json = (await response.json()) as GeminiResponse;
  if (json.error?.message) throw new Error(`Gemini error: ${json.error.message}`);

  const text = json.candidates?.[0]?.content?.parts?.find((p) => typeof p.text === "string")?.text;
  if (!text) throw new Error("Gemini response missing text content.");

  const parsed = parseJsonFromText(text) as
    | { translation?: unknown; detected_source_language?: unknown }
    | null;
  if (!parsed || typeof parsed.translation !== "string" || !parsed.translation.trim()) {
    throw new Error("Gemini response JSON does not match expected schema.");
  }

  const detectedRaw =
    typeof parsed.detected_source_language === "string" ? parsed.detected_source_language : "";
  const detectedSourceLanguage = isTranslateLanguageCode(detectedRaw) ? detectedRaw : null;

  return { translation: parsed.translation, detectedSourceLanguage, modelName };
};
