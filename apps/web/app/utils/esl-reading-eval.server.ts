import type { Env } from "~/types/env";
import {
  buildFallbackEslPassageTitle,
  normalizeEslPassageTitle,
  type EslReadingEvaluationOutput,
  type EslReadingMode,
  type EslLearnerProfileData
} from "~/utils/esl-reading";
import { type ReadingOutputLanguage } from "~/utils/reading-settings";
import { callGemini, parseJsonFromText, toBase64, toStringArray } from "~/utils/llm.server";

const RUBRIC_VERSION = "2026-04-02";
const FALLBACK_MODEL_NAME = "local-heuristic-fallback";

type HistoryEntry = {
  date: string;
  mode: string;
  overallScore: number;
  durationSeconds: number | null;
  fullEvaluation?: EslReadingEvaluationOutput;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const extractSampleChunk = (text: string): string => {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const sentence = trimmed.split(/[.!?]/).find((part) => part.trim().length > 0)?.trim();
  return (sentence ?? trimmed).slice(0, 180);
};

const normalizeSpan = (value: unknown): { start: number; end: number } | null => {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const start = Number(record.start);
  const end = Number(record.end);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return { start: Math.max(0, Math.floor(start)), end: Math.max(Math.max(0, Math.floor(start)), Math.floor(end)) };
};

const normalizeEvalOutput = (
  raw: unknown,
  fallbackLanguage: ReadingOutputLanguage
): EslReadingEvaluationOutput | null => {
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
    const textQuote = typeof record.text_quote === "string" ? record.text_quote.trim() : "";
    const span = normalizeSpan(record.text_span);
    if (!span || !note) continue;
    if (!["mispronunciation", "stress", "pause", "intonation"].includes(kind)) continue;
    const severityValue = Math.floor(Number(record.severity));
    const severity = severityValue >= 1 && severityValue <= 3 ? (severityValue as 1 | 2 | 3) : 2;
    highlights.push({
      kind: kind as EslReadingEvaluationOutput["highlights"][number]["kind"],
      severity,
      text_span: span,
      text_quote: textQuote || null,
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
  const uiLanguage =
    root.ui_language === "zh" || root.ui_language === "en" ? root.ui_language : fallbackLanguage;

  return {
    rubric_version:
      typeof root.rubric_version === "string" && root.rubric_version.trim()
        ? root.rubric_version.trim()
        : RUBRIC_VERSION,
    ui_language: uiLanguage,
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
    next_drills: nextDrills,
    commentary_zh: typeof root.commentary_zh === "string" ? root.commentary_zh.trim() : "",
    progress_vs_last: toStringArray(root.progress_vs_last, 5)
  };
};

const buildHeuristicEvaluation = (input: {
  passageText: string;
  mode: EslReadingMode;
  outputLanguage: ReadingOutputLanguage;
  audioBytes: number;
  durationMs: number | null;
}): EslReadingEvaluationOutput => {
  const wordCount = input.passageText.trim().split(/\s+/).filter(Boolean).length;
  const durationSec = input.durationMs ? input.durationMs / 1000 : input.audioBytes / 16_000;
  const expectedDurationSec = Math.max(wordCount / 2.2, 8);
  const pacingRatio = expectedDurationSec > 0 ? durationSec / expectedDurationSec : 0.8;
  const normalizedPacing = clamp(pacingRatio, 0.35, 1.2);

  const overall = Math.round(clamp(50 + normalizedPacing * 35, 40, 92));
  const pronunciation = Math.round(clamp(overall - 4, 35, 92));
  const stressRhythm = Math.round(clamp(overall - 2, 35, 92));
  const fluency = Math.round(clamp(overall + (pacingRatio > 0.9 ? 2 : -3), 35, 92));
  const clarity = Math.round(clamp(overall - 1, 35, 92));

  const sampleChunk = extractSampleChunk(input.passageText);
  const hiddenModeTip =
    input.outputLanguage === "zh"
      ? input.mode === "recitation"
        ? "背诵模式下先用关键词提示，再尝试全隐藏复述。"
        : "先做可见文本朗读，再切到背诵模式复练同一段。"
      : input.mode === "recitation"
        ? "In recitation mode, begin with a few keywords, then try a fully hidden retell."
        : "Start with one visible-text read, then switch to recitation mode for the same passage.";
  const topActions =
    input.outputLanguage === "zh"
      ? [
          "先放慢 10% 语速，优先保证单词结尾辅音清晰。",
          "按意群做停顿，不要逐词停顿；每句至少做一次完整连读。",
          hiddenModeTip
        ]
      : [
          "Slow down by about 10% and make the final consonants of words cleaner.",
          "Pause by thought groups instead of word by word; keep at least one full linking run in each sentence.",
          hiddenModeTip
        ];
  const highlightNote =
    input.outputLanguage === "zh"
      ? "优先复练这一句，关注重读词和连读。"
      : "Practice this sentence first and focus on stressed words plus linking.";
  const repeatPrompt =
    input.outputLanguage === "zh"
      ? "同一句连续读 3 次，第二次更慢，第三次恢复自然语速。"
      : "Read the same sentence 3 times in a row: slower on the second pass, then back to natural speed on the third.";
  const shadowingPrompt =
    input.outputLanguage === "zh"
      ? "跟读时模仿句子重音和停顿位置。"
      : "Shadow the sentence and copy the stress pattern plus pause placement.";

  return {
    rubric_version: RUBRIC_VERSION,
    ui_language: input.outputLanguage,
    scores: { overall, pronunciation, stress_rhythm: stressRhythm, fluency, clarity },
    cefr_guess: null,
    cefr_confidence: 0,
    top_actions_zh: topActions,
    highlights: sampleChunk
      ? [{
          kind: "mispronunciation",
          severity: 2,
          text_span: { start: 0, end: sampleChunk.length },
          text_quote: sampleChunk,
          note_zh: highlightNote
        }]
      : [],
    next_drills: sampleChunk
      ? [
          {
            drill_type: "repeat_sentence",
            target_text: sampleChunk,
            repeat: 3,
            prompt_zh: repeatPrompt
          },
          {
            drill_type: "shadowing",
            target_text: sampleChunk,
            repeat: 2,
            prompt_zh: shadowingPrompt
          }
        ]
      : [],
    commentary_zh: "",
    progress_vs_last: []
  };
};

const buildPrompt = (input: {
  passageText: string;
  mode: EslReadingMode;
  outputLanguage: ReadingOutputLanguage;
  durationSeconds: number | null;
  history: HistoryEntry[];
  learnerProfile: EslLearnerProfileData | null;
}): string => {
  const modeLabel = input.mode === "recitation" ? "recitation" : "reading";
  const feedbackLanguage = input.outputLanguage === "zh" ? "Chinese" : "English";

  const parts: string[] = [
    "You are a professional English reading and recitation coach.",
    "The learner's native language is Chinese.",
    "You will receive the original English passage and a learner recording.",
    "Evaluate the current recording and return structured feedback.",
    "",
    `Practice mode: ${modeLabel}`,
    `Feedback language: ${feedbackLanguage}`
  ];

  if (input.durationSeconds != null) {
    parts.push(`Recording duration: ${input.durationSeconds.toFixed(1)} seconds`);
  }

  parts.push(
    "",
    "Return valid JSON only. Do not wrap the response in markdown.",
    "Important: keep the existing JSON field names even when the feedback language is English.",
    `All learner-facing strings inside top_actions_zh, highlights[].note_zh, next_drills[].prompt_zh, commentary_zh, and progress_vs_last must be written in ${feedbackLanguage}.`,
    "",
    "JSON schema:",
    JSON.stringify({
      rubric_version: "string",
      ui_language: input.outputLanguage,
      scores: { overall: "0-100", pronunciation: "0-100", stress_rhythm: "0-100", fluency: "0-100", clarity: "0-100" },
      cefr_guess: "A1|A2|B1|B2|C1|C2|null",
      cefr_confidence: "0-1",
      top_actions_zh: [`string (2-3 actionable ${feedbackLanguage} items)`],
      highlights: [{
        kind: "mispronunciation|stress|pause|intonation",
        severity: "1|2|3",
        text_span: { start: 0, end: 0 },
        text_quote: "exact word or short phrase copied from the passage",
        note_zh: `string (${feedbackLanguage}; must name the exact word or phrase first)`
      }],
      next_drills: [{ drill_type: "repeat_sentence|minimal_pair|shadowing", target_text: "string", repeat: "1-8", prompt_zh: `string (${feedbackLanguage})` }],
      commentary_zh: `freeform ${feedbackLanguage} coaching feedback that can reference history and give concrete guidance`,
      progress_vs_last: [`changes vs last attempt, written in ${feedbackLanguage}`]
    }, null, 2)
  );

  parts.push(
    "",
    "Rules:",
    `- Give concise, actionable feedback in ${feedbackLanguage}`,
    "- Keep top_actions_zh to 2-3 items",
    "- Use passage character offsets for text_span",
    "- Every highlight must include text_quote copied verbatim from the passage",
    "- text_quote must agree with text_span; if they disagree, fix the span before returning JSON",
    "- Every highlight must point to the smallest relevant word or phrase, not a whole sentence unless the issue truly spans the full sentence",
    "- For mispronunciation highlights, prefer a single word as text_span",
    "- highlights[].note_zh must explicitly name the exact target word or phrase from the passage before explaining the problem",
    "- Never write a vague note like 'avoid adding an h sound' without saying which word it applies to",
    `- commentary_zh should sound like a coach speaking naturally to the learner in ${feedbackLanguage}`,
    "- Fill progress_vs_last only when there is meaningful history",
    "- If you are unsure about CEFR, set cefr_guess to null and cefr_confidence to 0"
  );

  if (input.learnerProfile) {
    parts.push(
      "",
      "## Learner profile",
      `Persistent issues: ${JSON.stringify(input.learnerProfile.persistent_issues)}`,
      `Strengths: ${JSON.stringify(input.learnerProfile.strengths)}`
    );
  }

  if (input.history.length > 0) {
    parts.push("", "## Practice history (newest first)");

    const recent = input.history.slice(0, 3);
    const older = input.history.slice(3);

    for (const entry of recent) {
      const dur = entry.durationSeconds != null ? `${entry.durationSeconds.toFixed(0)}s` : "unknown duration";
      parts.push(`### ${entry.date} | ${entry.mode} | ${dur}`);
      if (entry.fullEvaluation) {
        parts.push(JSON.stringify({
          scores: entry.fullEvaluation.scores,
          top_actions_zh: entry.fullEvaluation.top_actions_zh,
          highlights: entry.fullEvaluation.highlights.map(h => ({
            kind: h.kind,
            text_span: h.text_span,
            text_quote: h.text_quote ?? null,
            note_zh: h.note_zh
          }))
        }));
      } else {
        parts.push(`Overall: ${entry.overallScore}`);
      }
    }

    if (older.length > 0) {
      parts.push("### Older history (scores only)");
      for (const entry of older) {
        const dur = entry.durationSeconds != null ? `${entry.durationSeconds.toFixed(0)}s` : "?";
        parts.push(`- ${entry.date} | ${entry.mode} | ${entry.overallScore} points | ${dur}`);
      }
    }
  }

  parts.push("", "## Passage text", input.passageText);

  return parts.join("\n");
};

const evaluateWithGemini = async (input: {
  env: Env;
  passageText: string;
  mode: EslReadingMode;
  outputLanguage: ReadingOutputLanguage;
  audioBytes: Uint8Array;
  audioMimeType: string;
  durationMs: number | null;
  history: HistoryEntry[];
  learnerProfile: EslLearnerProfileData | null;
}): Promise<{ modelName: string; output: EslReadingEvaluationOutput }> => {
  const durationSeconds = input.durationMs != null ? input.durationMs / 1000 : null;
  const prompt = buildPrompt({
    passageText: input.passageText,
    mode: input.mode,
    outputLanguage: input.outputLanguage,
    durationSeconds,
    history: input.history,
    learnerProfile: input.learnerProfile
  });

  const { modelName, text } = await callGemini({
    env: input.env,
    task: "reading_eval",
    parts: [
      { text: prompt },
      { inline_data: { mime_type: input.audioMimeType, data: toBase64(input.audioBytes) } }
    ],
    generationConfig: { responseMimeType: "application/json", temperature: 0.2 }
  });

  const parsed = parseJsonFromText(text);
  const normalized = normalizeEvalOutput(parsed, input.outputLanguage);
  if (!normalized) throw new Error("Gemini response JSON does not match expected schema.");

  return { modelName, output: normalized };
};

export const evaluateEslReadingAttempt = async (input: {
  env: Env;
  passageText: string;
  mode: EslReadingMode;
  outputLanguage: ReadingOutputLanguage;
  audioBytes: Uint8Array;
  audioMimeType: string;
  durationMs: number | null;
  history: HistoryEntry[];
  learnerProfile: EslLearnerProfileData | null;
}): Promise<{ modelName: string; output: EslReadingEvaluationOutput }> => {
  try {
    return await evaluateWithGemini(input);
  } catch {
    return {
      modelName: FALLBACK_MODEL_NAME,
      output: buildHeuristicEvaluation({
        passageText: input.passageText,
        mode: input.mode,
        outputLanguage: input.outputLanguage,
        audioBytes: input.audioBytes.byteLength,
        durationMs: input.durationMs
      })
    };
  }
};

export const generatePassageTitle = async (env: Env, contentText: string): Promise<string> => {
  if (!env.GEMINI_API_KEY?.trim()) return buildFallbackEslPassageTitle(contentText);

  const prompt = [
    "Generate one short English title for the passage below.",
    "Rules:",
    "- 2 to 6 words",
    "- at most 42 characters",
    "- plain text only",
    "- no quotes",
    "- no markdown",
    "- no trailing punctuation",
    "",
    contentText.slice(0, 1200)
  ].join("\n");

  try {
    const { text } = await callGemini({
      env,
      task: "title_generation",
      parts: [{ text: prompt }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 24,
        thinkingConfig: { thinkingBudget: 0 }
      }
    });
    const normalized = normalizeEslPassageTitle(text);
    const wordCount = normalized ? normalized.split(/\s+/).filter(Boolean).length : 0;
    return normalized && normalized.length <= 42 && wordCount >= 2 && wordCount <= 6
      ? normalized
      : buildFallbackEslPassageTitle(contentText);
  } catch {
    return buildFallbackEslPassageTitle(contentText);
  }
};
