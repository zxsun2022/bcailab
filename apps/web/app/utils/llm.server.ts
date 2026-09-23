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
// Every model is a pinned version, and this table is the only place one is chosen (owner
// decision 2026-09-23). There is no environment override: production ran on a `GEMINI_MODEL`
// secret set to the floating `gemini-flash-latest` alias, which silently overrode five tasks —
// the cost-sensitive ones included — and let the graders' model change under stored scores
// without any record. A model change is now a reviewed code change.
//
// Evaluation, where the model output *is* the product, uses the newest Flash. Everything else
// uses the newest Flash-Lite.
const EVAL_MODEL = "gemini-3.8-flash";
const LITE_MODEL = "gemini-3.5-flash-lite";

export type LlmTask =
  | "translate"
  | "translate_anonymous"
  | "reading_eval"
  | "writing_feedback"
  | "title_generation"
  | "dictation_generate"
  | "dictation_feedback"
  | "learner_profile_naming";

export const TASK_MODELS: Record<LlmTask, string> = {
  translate: LITE_MODEL,
  translate_anonymous: LITE_MODEL,
  reading_eval: EVAL_MODEL,
  writing_feedback: EVAL_MODEL,
  title_generation: LITE_MODEL,
  // Dictation v1 generates material offline (scripts/material-seed/), which cannot import app
  // code and pins the same model itself. Material quality is the product, so it uses the
  // newest Flash (owner decision 2026-09-23). This entry is the control point for when
  // generation moves into the runtime.
  dictation_generate: EVAL_MODEL,
  dictation_feedback: LITE_MODEL,
  // Names the deterministic tag-mastery aggregate for the learner; interpretation only,
  // never deciding whether a weakness exists (learner-model design §6.4).
  learner_profile_naming: LITE_MODEL
};

export const resolveModelForTask = (task: LlmTask): string => TASK_MODELS[task];

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
  const modelName = resolveModelForTask(input.task);

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
 * Streaming variant of `callGemini`. Yields text deltas as the model produces them.
 *
 * Uses `:streamGenerateContent?alt=sse`, which returns Server-Sent Events whose payloads
 * are the same `GeminiResponse` shape as the unary endpoint, one partial candidate per event.
 * Callers that need the whole response should use `callGemini` instead — streaming is only
 * worth the extra plumbing where the user watches the output arrive.
 */
export const streamGemini = async (input: {
  env: Env;
  task: LlmTask;
  parts: GeminiPart[];
  generationConfig?: Record<string, unknown>;
  signal?: AbortSignal;
}): Promise<{ modelName: string; textStream: AsyncIterable<string> }> => {
  const apiKey = input.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");

  const baseUrl = input.env.GEMINI_BASE_URL?.trim() || DEFAULT_BASE_URL;
  const modelName = resolveModelForTask(input.task);

  const response = await fetch(
    `${baseUrl}/models/${encodeURIComponent(modelName)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: input.parts }],
        ...(input.generationConfig ? { generationConfig: input.generationConfig } : {})
      }),
      signal: input.signal
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini request failed (${response.status}): ${errorText.slice(0, 500)}`);
  }
  if (!response.body) throw new Error("Gemini stream response has no body.");

  const body = response.body;

  const textStream = (async function* () {
    const reader = body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        // Gemini terminates SSE lines with CRLF; normalizing first keeps the blank-line
        // scan below to a single case. A chunk ending mid-CRLF is normalized on the next
        // append, before any boundary is looked for.
        buffer = `${buffer}${value}`.replace(/\r\n/g, "\n");
        // SSE events are separated by a blank line; a single event may span chunks.
        let boundary = buffer.indexOf("\n\n");
        while (boundary >= 0) {
          const event = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const delta = readSseDelta(event);
          if (delta) yield delta;
          boundary = buffer.indexOf("\n\n");
        }
      }
      const tail = readSseDelta(buffer);
      if (tail) yield tail;
    } finally {
      await reader.cancel().catch(() => {});
    }
  })();

  return { modelName, textStream };
};

/** Extracts the text delta from one SSE event block, or "" when it carries none. */
const readSseDelta = (event: string): string => {
  const payload = event
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("");
  if (!payload || payload === "[DONE]") return "";

  let json: GeminiResponse;
  try {
    json = JSON.parse(payload) as GeminiResponse;
  } catch {
    return "";
  }
  if (json.error?.message) throw new Error(`Gemini error: ${json.error.message}`);
  return (
    json.candidates?.[0]?.content?.parts
      ?.map((part) => (typeof part.text === "string" ? part.text : ""))
      .join("") ?? ""
  );
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
    console.error("parseJsonFromText failed", {
      errorClass: "invalid_json",
      responseLength: payload.length
    });
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
