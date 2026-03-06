export const MAX_ESL_PASSAGE_CHARS = 8000;
export const MAX_ESL_READING_AUDIO_BYTES = 20 * 1024 * 1024;
export const ESL_PENDING_EVAL_STALE_MS = 45 * 1000;

export const ESL_READING_MODES = ["reading", "recitation"] as const;
export type EslReadingMode = (typeof ESL_READING_MODES)[number];

export const SUPPORTED_ESL_AUDIO_MIME_TYPES = [
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/aac",
  "audio/flac"
] as const;

export type EslReadingEvaluationOutput = {
  rubric_version: string;
  ui_language: "zh" | "en";
  scores: {
    overall: number;
    pronunciation: number;
    stress_rhythm: number;
    fluency: number;
    clarity: number;
  };
  cefr_guess: "A1" | "A2" | "B1" | "B2" | "C1" | "C2" | null;
  cefr_confidence: number;
  top_actions_zh: string[];
  highlights: Array<{
    kind: "mispronunciation" | "stress" | "pause" | "intonation";
    severity: 1 | 2 | 3;
    text_span: { start: number; end: number };
    note_zh: string;
  }>;
  next_drills: Array<{
    drill_type: "repeat_sentence" | "minimal_pair" | "shadowing";
    target_text: string;
    repeat: number;
    prompt_zh: string;
  }>;
  commentary_zh: string;
  progress_vs_last: string[];
};

export type EslLearnerProfileData = {
  persistent_issues: string[];
  strengths: string[];
};

export const normalizeEslPassageText = (input: string): string =>
  input.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

export const normalizeEslPassageTitle = (input: string): string =>
  input
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

export const buildFallbackEslPassageTitle = (contentText: string): string => {
  const cleaned = contentText
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`>#~]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const source = cleaned || contentText.trim();
  if (!source) return "Untitled passage";

  const sentence = source.split(/[.!?]/).find((part) => part.trim().length > 0)?.trim() ?? source;
  if (sentence.length <= 48) return sentence;
  const clipped = sentence.slice(0, 48).trim();
  const lastSpace = clipped.lastIndexOf(" ");
  return (lastSpace > 16 ? clipped.slice(0, lastSpace) : clipped).trim();
};

export const getDisplayEslPassageTitle = (
  title: string | null | undefined,
  contentText: string
): string => {
  const rawTitle = title ?? "";
  const normalizedTitle = normalizeEslPassageTitle(rawTitle);
  const looksLikeFallbackExcerpt =
    normalizedTitle.length === 0 ||
    normalizedTitle.length > 80 ||
    /[*_`#[\]~]/.test(rawTitle);

  return looksLikeFallbackExcerpt
    ? buildFallbackEslPassageTitle(contentText)
    : normalizedTitle;
};

export const clipText = (input: string, maxLen: number): string =>
  input.length > maxLen ? `${input.slice(0, maxLen)}...` : input;

export const parseEslReadingEvaluationOutput = (
  input: string
): EslReadingEvaluationOutput | null => {
  try {
    const raw = JSON.parse(input) as Record<string, unknown>;
    return {
      ...(raw as unknown as EslReadingEvaluationOutput),
      commentary_zh: typeof raw.commentary_zh === "string" ? raw.commentary_zh : "",
      progress_vs_last: Array.isArray(raw.progress_vs_last)
        ? (raw.progress_vs_last as unknown[]).filter((x): x is string => typeof x === "string")
        : []
    };
  } catch {
    return null;
  }
};

export const isSupportedReadingMode = (value: string): value is EslReadingMode =>
  ESL_READING_MODES.some((mode) => mode === value);

export const isSupportedEslAudioMime = (value: string): boolean =>
  SUPPORTED_ESL_AUDIO_MIME_TYPES.includes(
    value.split(";")[0].trim().toLowerCase() as (typeof SUPPORTED_ESL_AUDIO_MIME_TYPES)[number]
  );

export const formatDuration = (ms: number): string => {
  const totalSec = Math.round(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, "0")}`;
};

export const deriveEslAttemptEvaluationState = (input: {
  storedStatus: "pending" | "completed" | "failed";
  hasEvaluation: boolean;
  createdAt: string;
  now?: number;
}): {
  status: "pending" | "completed" | "failed";
  isStalePending: boolean;
} => {
  if (input.hasEvaluation) {
    return { status: "completed", isStalePending: false };
  }

  const ageMs = (input.now ?? Date.now()) - new Date(input.createdAt).getTime();
  const isStalePending = ageMs > ESL_PENDING_EVAL_STALE_MS;

  if (input.storedStatus === "pending") {
    return { status: "pending", isStalePending };
  }
  if (input.storedStatus === "failed") {
    return { status: "failed", isStalePending: false };
  }

  return isStalePending
    ? { status: "failed", isStalePending: false }
    : { status: "pending", isStalePending: false };
};
