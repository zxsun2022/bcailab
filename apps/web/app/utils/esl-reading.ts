export const MAX_ESL_PASSAGE_CHARS = 8000;
export const MAX_ESL_READING_AUDIO_BYTES = 20 * 1024 * 1024;

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
};

export const normalizeEslPassageText = (input: string): string =>
  input.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

export const clipText = (input: string, maxLen: number): string =>
  input.length > maxLen ? `${input.slice(0, maxLen)}...` : input;

export const parseEslReadingEvaluationOutput = (
  input: string
): EslReadingEvaluationOutput | null => {
  try {
    return JSON.parse(input) as EslReadingEvaluationOutput;
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
