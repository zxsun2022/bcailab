import type { Env } from "~/types/env";
import type { EslReadingEvaluationOutput, EslReadingMode } from "~/utils/esl-reading";

const RUBRIC_VERSION = "2026-03-03";
const FALLBACK_MODEL_NAME = "local-heuristic-fallback";
const DEFAULT_GEMINI_MODEL = "gemini-flash-latest";
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
  error?: {
    message?: string;
  };
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const estimateDurationSec = (audioBytes: number): number => {
  const assumedBytesPerSecond = 16_000;
  return audioBytes / assumedBytesPerSecond;
};

const extractSampleChunk = (text: string): string => {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const sentence = trimmed.split(/[.!?]/).find((part) => part.trim().length > 0)?.trim();
  return (sentence ?? trimmed).slice(0, 180);
};

const toBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
};

const parseJsonFromText = (input: string): unknown => {
  const raw = input.trim();
  if (!raw) {
    throw new Error("Gemini response is empty.");
  }

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const payload = fenced ? fenced[1] : raw;
  return JSON.parse(payload);
};

const toStringArray = (value: unknown, maxLen: number): string[] => {
  if (!Array.isArray(value)) return [];
  const next = value
    .filter((item) => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
  return next.slice(0, maxLen);
};

const normalizeSpan = (value: unknown): { start: number; end: number } | null => {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const start = Number(record.start);
  const end = Number(record.end);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  const normalizedStart = Math.max(0, Math.floor(start));
  const normalizedEnd = Math.max(normalizedStart, Math.floor(end));
  return { start: normalizedStart, end: normalizedEnd };
};

const normalizeEvalOutput = (raw: unknown): EslReadingEvaluationOutput | null => {
  if (!raw || typeof raw !== "object") return null;
  const root = raw as Record<string, unknown>;
  const scores = root.scores as Record<string, unknown> | undefined;
  if (!scores || typeof scores !== "object") return null;

  const highlightsRaw = Array.isArray(root.highlights) ? root.highlights : [];
  const highlights: EslReadingEvaluationOutput["highlights"] = [];
  for (const item of highlightsRaw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const kind = String(record.kind ?? "");
    const note = typeof record.note_zh === "string" ? record.note_zh.trim() : "";
    const span = normalizeSpan(record.text_span);
    if (!span || !note) continue;
    if (!["mispronunciation", "stress", "pause", "intonation"].includes(kind)) continue;
    const severityValue = Math.floor(Number(record.severity));
    const severity = severityValue >= 1 && severityValue <= 3 ? (severityValue as 1 | 2 | 3) : 2;
    highlights.push({
      kind: kind as EslReadingEvaluationOutput["highlights"][number]["kind"],
      severity,
      text_span: span,
      note_zh: note
    });
    if (highlights.length >= 8) break;
  }

  const drillsRaw = Array.isArray(root.next_drills) ? root.next_drills : [];
  const nextDrills: EslReadingEvaluationOutput["next_drills"] = [];
  for (const item of drillsRaw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const drillType = String(record.drill_type ?? "");
    if (!["repeat_sentence", "minimal_pair", "shadowing"].includes(drillType)) continue;
    const targetText = typeof record.target_text === "string" ? record.target_text.trim() : "";
    const promptZh = typeof record.prompt_zh === "string" ? record.prompt_zh.trim() : "";
    if (!targetText || !promptZh) continue;
    const repeatValue = Math.floor(Number(record.repeat));
    const repeat = repeatValue > 0 ? clamp(repeatValue, 1, 8) : 3;
    nextDrills.push({
      drill_type: drillType as EslReadingEvaluationOutput["next_drills"][number]["drill_type"],
      target_text: targetText,
      repeat,
      prompt_zh: promptZh
    });
    if (nextDrills.length >= 5) break;
  }

  const cefrGuessRaw = root.cefr_guess;
  const cefrGuess =
    typeof cefrGuessRaw === "string" && ["A1", "A2", "B1", "B2", "C1", "C2"].includes(cefrGuessRaw)
      ? (cefrGuessRaw as EslReadingEvaluationOutput["cefr_guess"])
      : null;

  return {
    rubric_version:
      typeof root.rubric_version === "string" && root.rubric_version.trim()
        ? root.rubric_version.trim()
        : RUBRIC_VERSION,
    ui_language: "zh",
    scores: {
      overall: Math.round(clamp(Number(scores.overall) || 0, 0, 100)),
      pronunciation: Math.round(clamp(Number(scores.pronunciation) || 0, 0, 100)),
      stress_rhythm: Math.round(clamp(Number(scores.stress_rhythm) || 0, 0, 100)),
      fluency: Math.round(clamp(Number(scores.fluency) || 0, 0, 100)),
      clarity: Math.round(clamp(Number(scores.clarity) || 0, 0, 100))
    },
    cefr_guess: cefrGuess,
    cefr_confidence: clamp(Number(root.cefr_confidence) || 0, 0, 1),
    top_actions_zh: toStringArray(root.top_actions_zh, 3),
    highlights,
    next_drills: nextDrills
  };
};

const buildHeuristicEvaluation = (input: {
  passageText: string;
  mode: EslReadingMode;
  audioBytes: number;
}): EslReadingEvaluationOutput => {
  const wordCount = input.passageText.trim().split(/\s+/).filter(Boolean).length;
  const estimatedDurationSec = estimateDurationSec(input.audioBytes);
  const expectedDurationSec = Math.max(wordCount / 2.2, 8);
  const pacingRatio = expectedDurationSec > 0 ? estimatedDurationSec / expectedDurationSec : 0.8;
  const normalizedPacing = clamp(pacingRatio, 0.35, 1.2);

  const overall = Math.round(clamp(50 + normalizedPacing * 35, 40, 92));
  const pronunciation = Math.round(clamp(overall - 4, 35, 92));
  const stressRhythm = Math.round(clamp(overall - 2, 35, 92));
  const fluency = Math.round(clamp(overall + (pacingRatio > 0.9 ? 2 : -3), 35, 92));
  const clarity = Math.round(clamp(overall - 1, 35, 92));

  const sampleChunk = extractSampleChunk(input.passageText);
  const hiddenModeTip =
    input.mode === "recitation"
      ? "背诵模式下先用关键词提示，再尝试全隐藏复述。"
      : "先做可见文本朗读，再切到背诵模式复练同一段。";

  return {
    rubric_version: RUBRIC_VERSION,
    ui_language: "zh",
    scores: {
      overall,
      pronunciation,
      stress_rhythm: stressRhythm,
      fluency,
      clarity
    },
    cefr_guess: null,
    cefr_confidence: 0,
    top_actions_zh: [
      "先放慢 10% 语速，优先保证单词结尾辅音清晰。",
      "按意群做停顿，不要逐词停顿；每句至少做一次完整连读。",
      hiddenModeTip
    ],
    highlights: sampleChunk
      ? [
          {
            kind: "mispronunciation",
            severity: 2,
            text_span: { start: 0, end: sampleChunk.length },
            note_zh: "优先复练这一句，关注重读词和连读。"
          }
        ]
      : [],
    next_drills: sampleChunk
      ? [
          {
            drill_type: "repeat_sentence",
            target_text: sampleChunk,
            repeat: 3,
            prompt_zh: "同一句连续读 3 次，第二次更慢，第三次恢复自然语速。"
          },
          {
            drill_type: "shadowing",
            target_text: sampleChunk,
            repeat: 2,
            prompt_zh: "跟读时模仿句子重音和停顿位置。"
          }
        ]
      : []
  };
};

const buildPrompt = (input: { passageText: string; mode: EslReadingMode }): string => {
  const modeLabel = input.mode === "recitation" ? "recitation" : "reading";
  return [
    "You are an ESL reading coach.",
    "Evaluate the learner's spoken English using the reference passage and the uploaded audio.",
    "Respond in JSON only. Do not add markdown fences.",
    `UI language: Chinese (zh).`,
    `Practice mode: ${modeLabel}.`,
    "",
    "Required JSON schema:",
    "{",
    '  "rubric_version": "string",',
    '  "ui_language": "zh",',
    '  "scores": {',
    '    "overall": 0-100,',
    '    "pronunciation": 0-100,',
    '    "stress_rhythm": 0-100,',
    '    "fluency": 0-100,',
    '    "clarity": 0-100',
    "  },",
    '  "cefr_guess": "A1|A2|B1|B2|C1|C2|null",',
    '  "cefr_confidence": 0-1,',
    '  "top_actions_zh": ["string", "string", "string"],',
    '  "highlights": [',
    '    {"kind":"mispronunciation|stress|pause|intonation","severity":1|2|3,"text_span":{"start":0,"end":0},"note_zh":"string"}',
    "  ],",
    '  "next_drills": [',
    '    {"drill_type":"repeat_sentence|minimal_pair|shadowing","target_text":"string","repeat":1-8,"prompt_zh":"string"}',
    "  ]",
    "}",
    "",
    "Rules:",
    "- Give short, actionable Chinese feedback.",
    "- Keep top_actions_zh length 2-3.",
    "- text_span should refer to passage character offsets.",
    "- If CEFR is uncertain, set cefr_guess to null and cefr_confidence to 0.",
    "",
    "Reference passage:",
    input.passageText
  ].join("\n");
};

const evaluateWithGemini = async (input: {
  env: Env;
  passageText: string;
  mode: EslReadingMode;
  audioBytes: Uint8Array;
  audioMimeType: string;
}): Promise<{ modelName: string; output: EslReadingEvaluationOutput }> => {
  const apiKey = input.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }
  const modelName = input.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;

  const response = await fetch(
    `${GEMINI_BASE_URL}/models/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: buildPrompt({ passageText: input.passageText, mode: input.mode }) },
              {
                inline_data: {
                  mime_type: input.audioMimeType,
                  data: toBase64(input.audioBytes)
                }
              }
            ]
          }
        ],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.2
        }
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini request failed (${response.status}): ${errorText.slice(0, 500)}`);
  }

  const json = (await response.json()) as GeminiResponse;
  if (json.error?.message) {
    throw new Error(`Gemini error: ${json.error.message}`);
  }

  const text = json.candidates?.[0]?.content?.parts?.find((part) => typeof part.text === "string")?.text;
  if (!text) {
    throw new Error("Gemini response missing text content.");
  }

  const parsed = parseJsonFromText(text);
  const normalized = normalizeEvalOutput(parsed);
  if (!normalized) {
    throw new Error("Gemini response JSON does not match expected schema.");
  }

  return {
    modelName,
    output: normalized
  };
};

export const evaluateEslReadingAttempt = async (input: {
  env: Env;
  passageText: string;
  mode: EslReadingMode;
  audioBytes: Uint8Array;
  audioMimeType: string;
}): Promise<{ modelName: string; output: EslReadingEvaluationOutput }> => {
  try {
    return await evaluateWithGemini(input);
  } catch {
    return {
      modelName: FALLBACK_MODEL_NAME,
      output: buildHeuristicEvaluation({
        passageText: input.passageText,
        mode: input.mode,
        audioBytes: input.audioBytes.byteLength
      })
    };
  }
};
