import type { Env } from "~/types/env";

/**
 * Unified LLM call layer.
 *
 * Every model call in the app goes through `callGemini` with a named task.
 * The task → model routing table below is the single place to change which
 * model serves which job (e.g. cheaper model for anonymous translation).
 *
 * `GEMINI_BASE_URL` env var optionally overrides the API origin so calls can
 * be routed through Cloudflare AI Gateway without code changes.
 */

const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_MODEL = "gemini-flash-latest";
const LITE_MODEL = "gemini-2.5-flash-lite";

export type LlmTask =
  | "translate"
  | "translate_anonymous"
  | "reading_eval"
  | "writing_feedback"
  | "title_generation"
  | "dictation_generate"
  | "dictation_feedback"
  | "learner_profile_naming";

type TaskConfig = {
  model: string;
  /** When true, the GEMINI_MODEL env var overrides the default model. */
  envModelOverride?: boolean;
};

const TASK_MODELS: Record<LlmTask, TaskConfig> = {
  translate: { model: DEFAULT_MODEL, envModelOverride: true },
  translate_anonymous: { model: LITE_MODEL },
  reading_eval: { model: DEFAULT_MODEL, envModelOverride: true },
  writing_feedback: { model: DEFAULT_MODEL, envModelOverride: true },
  title_generation: { model: LITE_MODEL },
  // Dictation v1 generates material offline (scripts/dictation-seed/), which cannot
  // import app code. This entry documents the routing decision and is the control
  // point for when v2 moves generation into the runtime.
  dictation_generate: { model: DEFAULT_MODEL },
  dictation_feedback: { model: DEFAULT_MODEL, envModelOverride: true },
  // Names the deterministic tag-mastery aggregate for the learner; interpretation only,
  // never deciding whether a weakness exists (learner-model design §6.4).
  learner_profile_naming: { model: DEFAULT_MODEL, envModelOverride: true }
};

export const resolveModelForTask = (env: Env, task: LlmTask): string => {
  const config = TASK_MODELS[task];
  if (config.envModelOverride) {
    const override = env.GEMINI_MODEL?.trim();
    if (override) return override;
  }
  return config.model;
};

export type GeminiPart =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } };

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  error?: { message?: string };
};

export const callGemini = async (input: {
  env: Env;
  task: LlmTask;
  parts: GeminiPart[];
  generationConfig?: Record<string, unknown>;
}): Promise<{ modelName: string; text: string }> => {
  const apiKey = input.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");

  const baseUrl = input.env.GEMINI_BASE_URL?.trim() || DEFAULT_BASE_URL;
  const modelName = resolveModelForTask(input.env, input.task);

  const response = await fetch(
    `${baseUrl}/models/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: input.parts }],
        ...(input.generationConfig ? { generationConfig: input.generationConfig } : {})
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini request failed (${response.status}): ${errorText.slice(0, 500)}`);
  }

  const json = (await response.json()) as GeminiResponse;
  if (json.error?.message) throw new Error(`Gemini error: ${json.error.message}`);

  const text = json.candidates?.[0]?.content?.parts?.find(
    (part) => typeof part.text === "string"
  )?.text;
  if (!text) throw new Error("Gemini response missing text content.");

  return { modelName, text };
};

/**
 * Parses JSON from an LLM response, tolerating ```json fences and surrounding
 * prose (falls back to the outermost {...} block). Throws on failure.
 */
export const parseJsonFromText = (input: string): unknown => {
  const raw = input.trim();
  if (!raw) throw new Error("Gemini response is empty.");
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const payload = (fenced ? fenced[1] : raw).trim();
  try {
    return JSON.parse(payload);
  } catch {
    const start = payload.indexOf("{");
    const end = payload.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(payload.slice(start, end + 1));
      } catch {
        // fall through to the error below
      }
    }
    console.error("parseJsonFromText failed; response head:", payload.slice(0, 300));
    throw new Error("Gemini response is not valid JSON.");
  }
};

export const toStringArray = (value: unknown, maxLen: number): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maxLen);
};

/** Base64-encodes binary data in chunks (audio payloads can be several MB). */
export const toBase64 = (bytes: Uint8Array): string => {
  const CHUNK = 8192;
  const pieces: string[] = [];
  for (let i = 0; i < bytes.length; i += CHUNK) {
    pieces.push(String.fromCharCode(...bytes.subarray(i, i + CHUNK)));
  }
  return btoa(pieces.join(""));
};
