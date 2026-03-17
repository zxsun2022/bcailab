import type { Env } from "~/types/env";
import {
  formatWritingAssessment,
  getWritingAgentOrDefault,
  type WritingAgent
} from "~/utils/writing-agents";

const DEFAULT_GEMINI_MODEL = "gemini-flash-latest";
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  error?: { message?: string };
};

export type WritingFeedback = {
  annotations: WritingAnnotation[];
  round_summary: WritingRoundSummary;
  delta: WritingDelta | null;
};

export type WritingAnnotation = {
  severity: "critical" | "improvement" | "strength";
  dimension: string;
  quoted_text: string;
  diagnosis: string;
  guiding_question: string;
};

export type WritingRoundSummary = {
  critical_count: number;
  improvement_count: number;
  strengths_count: number;
  overall_comment: string;
  band_estimate: string;
};

export type WritingDelta = {
  resolved: string[];
  new_issues: string[];
  improvement_note: string;
};

type PreviousRoundContext = {
  round_number: number;
  user_text: string;
  feedback: WritingFeedback | null;
  word_count: number;
};

const parseJsonFromText = (input: string): unknown => {
  const raw = input.trim();
  if (!raw) throw new Error("Gemini response is empty.");
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const payload = fenced ? fenced[1] : raw;
  return JSON.parse(payload);
};

const toStringArray = (value: unknown, maxLen: number): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maxLen);
};

const normalizeSeverity = (value: unknown): WritingAnnotation["severity"] => {
  const s = String(value ?? "");
  if (s === "critical" || s === "improvement" || s === "strength") return s;
  return "improvement";
};

export const normalizeWritingFeedback = (
  raw: unknown,
  isFirstRound: boolean
): WritingFeedback | null => {
  if (!raw || typeof raw !== "object") return null;
  const root = raw as Record<string, unknown>;

  const annotationsRaw = Array.isArray(root.annotations) ? root.annotations : [];
  const annotations: WritingAnnotation[] = [];
  for (const item of annotationsRaw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const quotedText = typeof record.quoted_text === "string" ? record.quoted_text.trim() : "";
    const diagnosis = typeof record.diagnosis === "string" ? record.diagnosis.trim() : "";
    const guidingQuestion =
      typeof record.guiding_question === "string" ? record.guiding_question.trim() : "";
    if (!diagnosis) continue;
    annotations.push({
      severity: normalizeSeverity(record.severity),
      dimension: typeof record.dimension === "string" ? record.dimension.trim() : "general",
      quoted_text: quotedText,
      diagnosis,
      guiding_question: guidingQuestion
    });
    if (annotations.length >= 15) break;
  }

  const summaryRaw = root.round_summary;
  if (!summaryRaw || typeof summaryRaw !== "object") return null;
  const summary = summaryRaw as Record<string, unknown>;

  const roundSummary: WritingRoundSummary = {
    critical_count: Math.max(0, Math.floor(Number(summary.critical_count) || 0)),
    improvement_count: Math.max(0, Math.floor(Number(summary.improvement_count) || 0)),
    strengths_count: Math.max(0, Math.floor(Number(summary.strengths_count) || 0)),
    overall_comment:
      typeof summary.overall_comment === "string" ? summary.overall_comment.trim() : "",
    band_estimate: typeof summary.band_estimate === "string" ? summary.band_estimate.trim() : "?"
  };

  let delta: WritingDelta | null = null;
  if (!isFirstRound && root.delta && typeof root.delta === "object") {
    const d = root.delta as Record<string, unknown>;
    delta = {
      resolved: toStringArray(d.resolved, 10),
      new_issues: toStringArray(d.new_issues, 10),
      improvement_note:
        typeof d.improvement_note === "string" ? d.improvement_note.trim() : ""
    };
  }

  return { annotations, round_summary: roundSummary, delta };
};

const buildPrompt = (input: {
  agent: WritingAgent;
  userText: string;
  wordCount: number;
  feedbackLanguage: "en" | "zh";
  previousRound: PreviousRoundContext | null;
  historyScores: Array<{ round: number; assessment: string }>;
}): string => {
  const langLabel = input.feedbackLanguage === "zh" ? "Chinese" : "English";
  const isFirstRound = input.previousRound === null;

  const parts: string[] = [
    "You are an expert writing coach.",
    `Agent: ${input.agent.label}`,
    `Evaluation standard: ${input.agent.id}`,
    "",
    "## Rubric",
    input.agent.rubric,
    "",
    `## Feedback tone`,
    input.agent.tone,
    "",
    "## Rules",
    "- You are a COACH, not a ghostwriter. Never rewrite text on behalf of the user.",
    "- Each annotation must include a guiding_question that helps the user think about how to improve, NOT a suggested rewrite.",
    "- Identify genuine weaknesses — do not confirm existing strengths unless truly notable.",
    `- All learner-facing strings (diagnosis, guiding_question, overall_comment, delta strings) must be in ${langLabel}.`,
    `- Feedback language: ${langLabel}`,
    `- round_summary.band_estimate should follow this format: ${input.agent.assessmentGuidance}`,
    "",
    "## JSON schema",
    "Return valid JSON only. Do not wrap in markdown code fences.",
    JSON.stringify(
      {
        annotations: [
          {
            severity: "critical | improvement | strength",
            dimension: input.agent.dimensions.join(" | "),
            quoted_text: "the specific text being referenced",
            diagnosis: "what the issue is",
            guiding_question: "a question to guide revision, not a rewrite"
          }
        ],
        round_summary: {
          critical_count: 0,
          improvement_count: 0,
          strengths_count: 0,
          overall_comment: "coaching summary for this round",
          band_estimate: input.agent.assessmentExample
        },
        delta: isFirstRound
          ? null
          : {
              resolved: ["issues resolved since last round"],
              new_issues: ["newly identified issues"],
              improvement_note: "overall progress observation"
            }
      },
      null,
      2
    )
  ];

  if (input.historyScores.length > 0) {
    parts.push("", "## Score history (oldest to newest)");
    for (const h of input.historyScores) {
      parts.push(
        `- Round ${h.round}: ${formatWritingAssessment(
          h.assessment,
          input.agent.assessmentPrefix
        )}`
      );
    }
  }

  if (input.previousRound?.feedback) {
    parts.push(
      "",
      `## Previous round feedback (Round ${input.previousRound.round_number})`,
      JSON.stringify(input.previousRound.feedback, null, 2),
      "",
      "Compute delta by comparing the current text against the above feedback."
    );
  }

  parts.push(
    "",
    `## Current text (${input.wordCount} words)`,
    input.userText
  );

  return parts.join("\n");
};

export const evaluateWriting = async (input: {
  env: Env;
  agentType: string;
  userText: string;
  wordCount: number;
  feedbackLanguage: "en" | "zh";
  previousRound: PreviousRoundContext | null;
  historyScores: Array<{ round: number; assessment: string }>;
}): Promise<{ modelName: string; feedback: WritingFeedback }> => {
  const apiKey = input.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");
  const modelName = input.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
  const agent = getWritingAgentOrDefault(input.agentType);

  const prompt = buildPrompt({
    agent,
    userText: input.userText,
    wordCount: input.wordCount,
    feedbackLanguage: input.feedbackLanguage,
    previousRound: input.previousRound,
    historyScores: input.historyScores
  });

  const response = await fetch(
    `${GEMINI_BASE_URL}/models/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.3 }
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

  const parsed = parseJsonFromText(text);
  const isFirstRound = input.previousRound === null;
  const feedback = normalizeWritingFeedback(parsed, isFirstRound);
  if (!feedback) throw new Error("Gemini response JSON does not match expected schema.");

  return { modelName, feedback };
};

export const generateArticleTitle = async (
  env: Env,
  userText: string
): Promise<string | null> => {
  const apiKey = env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;

  const model = "gemini-2.5-flash-lite";
  const prompt = [
    "Generate one short English title for the essay below.",
    "Rules:",
    "- 2 to 8 words",
    "- at most 60 characters",
    "- plain text only",
    "- no quotes",
    "- no markdown",
    "- no trailing punctuation",
    "",
    userText.slice(0, 1500)
  ].join("\n");

  try {
    const response = await fetch(
      `${GEMINI_BASE_URL}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 32,
            thinkingConfig: { thinkingBudget: 0 }
          }
        })
      }
    );
    if (!response.ok) return null;
    const json = (await response.json()) as GeminiResponse;
    const text = json.candidates?.[0]?.content?.parts?.find(
      (p) => typeof p.text === "string"
    )?.text;
    if (!text) return null;
    const cleaned = text
      .trim()
      .replace(/^["']+|["']+$/g, "")
      .replace(/[.!?]+$/, "")
      .trim();
    const wordCount = cleaned.split(/\s+/).filter(Boolean).length;
    if (cleaned.length > 60 || wordCount < 2 || wordCount > 8) return null;
    return cleaned;
  } catch {
    return null;
  }
};
