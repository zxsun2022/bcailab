import type { Env } from "~/types/env";
import type { EslReadingEvaluationOutput, EslReadingMode, EslLearnerProfileData } from "~/utils/esl-reading";

const RUBRIC_VERSION = "2026-03-05";
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

const toBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
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

const normalizeSpan = (value: unknown): { start: number; end: number } | null => {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const start = Number(record.start);
  const end = Number(record.end);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return { start: Math.max(0, Math.floor(start)), end: Math.max(Math.max(0, Math.floor(start)), Math.floor(end)) };
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
    next_drills: nextDrills,
    commentary_zh: typeof root.commentary_zh === "string" ? root.commentary_zh.trim() : "",
    progress_vs_last: toStringArray(root.progress_vs_last, 5)
  };
};

const buildHeuristicEvaluation = (input: {
  passageText: string;
  mode: EslReadingMode;
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
    input.mode === "recitation"
      ? "背诵模式下先用关键词提示，再尝试全隐藏复述。"
      : "先做可见文本朗读，再切到背诵模式复练同一段。";

  return {
    rubric_version: RUBRIC_VERSION,
    ui_language: "zh",
    scores: { overall, pronunciation, stress_rhythm: stressRhythm, fluency, clarity },
    cefr_guess: null,
    cefr_confidence: 0,
    top_actions_zh: [
      "先放慢 10% 语速，优先保证单词结尾辅音清晰。",
      "按意群做停顿，不要逐词停顿；每句至少做一次完整连读。",
      hiddenModeTip
    ],
    highlights: sampleChunk
      ? [{
          kind: "mispronunciation",
          severity: 2,
          text_span: { start: 0, end: sampleChunk.length },
          note_zh: "优先复练这一句，关注重读词和连读。"
        }]
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
      : [],
    commentary_zh: "",
    progress_vs_last: []
  };
};

const buildPrompt = (input: {
  passageText: string;
  mode: EslReadingMode;
  durationSeconds: number | null;
  history: HistoryEntry[];
  learnerProfile: EslLearnerProfileData | null;
}): string => {
  const modeLabel = input.mode === "recitation" ? "recitation" : "reading";

  const parts: string[] = [
    "你是一个专业的英语朗读/背诵教练。学习者母语是中文。",
    "你会收到一段英文原文和学习者的录音。请评估当前录音并给出结构化反馈。",
    "",
    `练习模式: ${modeLabel}`,
  ];

  if (input.durationSeconds != null) {
    parts.push(`录音时长: ${input.durationSeconds.toFixed(1)} 秒`);
  }

  parts.push(
    "",
    "请以 JSON 格式回复（不要加 markdown 代码块），schema 如下:",
    JSON.stringify({
      rubric_version: "string",
      ui_language: "zh",
      scores: { overall: "0-100", pronunciation: "0-100", stress_rhythm: "0-100", fluency: "0-100", clarity: "0-100" },
      cefr_guess: "A1|A2|B1|B2|C1|C2|null",
      cefr_confidence: "0-1",
      top_actions_zh: ["string (2-3 items, actionable Chinese feedback)"],
      highlights: [{ kind: "mispronunciation|stress|pause|intonation", severity: "1|2|3", text_span: { start: 0, end: 0 }, note_zh: "string" }],
      next_drills: [{ drill_type: "repeat_sentence|minimal_pair|shadowing", target_text: "string", repeat: "1-8", prompt_zh: "string" }],
      commentary_zh: "自由形式的中文教练反馈，可以引用历史数据、鼓励学习者、给出具体建议",
      progress_vs_last: ["与上次对比的变化，如: +fluency: 语速提升, =pronunciation: th问题持续"]
    }, null, 2)
  );

  parts.push(
    "",
    "规则:",
    "- 给出简短、可操作的中文反馈",
    "- top_actions_zh 保持 2-3 条",
    "- text_span 使用段落原文的字符偏移",
    "- commentary_zh 用自然的中文写，像教练在跟学生说话，可以引用历史数据对比",
    "- progress_vs_last 只在有历史数据时填写",
    "- 如果不确定 CEFR，设 cefr_guess 为 null, cefr_confidence 为 0"
  );

  if (input.learnerProfile) {
    parts.push(
      "",
      "## 学习者画像",
      `持续性问题: ${JSON.stringify(input.learnerProfile.persistent_issues)}`,
      `优势: ${JSON.stringify(input.learnerProfile.strengths)}`
    );
  }

  if (input.history.length > 0) {
    parts.push("", "## 历史练习记录 (从新到旧)");

    const recent = input.history.slice(0, 3);
    const older = input.history.slice(3);

    for (const entry of recent) {
      const dur = entry.durationSeconds != null ? `${entry.durationSeconds.toFixed(0)}s` : "未知时长";
      parts.push(`### ${entry.date} | ${entry.mode} | ${dur}`);
      if (entry.fullEvaluation) {
        parts.push(JSON.stringify({
          scores: entry.fullEvaluation.scores,
          top_actions_zh: entry.fullEvaluation.top_actions_zh,
          highlights: entry.fullEvaluation.highlights.map(h => ({
            kind: h.kind,
            text_span: h.text_span,
            note_zh: h.note_zh
          }))
        }));
      } else {
        parts.push(`Overall: ${entry.overallScore}`);
      }
    }

    if (older.length > 0) {
      parts.push("### 更早记录 (仅分数)");
      for (const entry of older) {
        const dur = entry.durationSeconds != null ? `${entry.durationSeconds.toFixed(0)}s` : "?";
        parts.push(`- ${entry.date} | ${entry.mode} | ${entry.overallScore}分 | ${dur}`);
      }
    }
  }

  parts.push("", "## 段落原文", input.passageText);

  return parts.join("\n");
};

const evaluateWithGemini = async (input: {
  env: Env;
  passageText: string;
  mode: EslReadingMode;
  audioBytes: Uint8Array;
  audioMimeType: string;
  durationMs: number | null;
  history: HistoryEntry[];
  learnerProfile: EslLearnerProfileData | null;
}): Promise<{ modelName: string; output: EslReadingEvaluationOutput }> => {
  const apiKey = input.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");
  const modelName = input.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;

  const durationSeconds = input.durationMs != null ? input.durationMs / 1000 : null;
  const prompt = buildPrompt({
    passageText: input.passageText,
    mode: input.mode,
    durationSeconds,
    history: input.history,
    learnerProfile: input.learnerProfile
  });

  const response = await fetch(
    `${GEMINI_BASE_URL}/models/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: [
            { text: prompt },
            { inline_data: { mime_type: input.audioMimeType, data: toBase64(input.audioBytes) } }
          ]
        }],
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

  const text = json.candidates?.[0]?.content?.parts?.find((part) => typeof part.text === "string")?.text;
  if (!text) throw new Error("Gemini response missing text content.");

  const parsed = parseJsonFromText(text);
  const normalized = normalizeEvalOutput(parsed);
  if (!normalized) throw new Error("Gemini response JSON does not match expected schema.");

  return { modelName, output: normalized };
};

export const evaluateEslReadingAttempt = async (input: {
  env: Env;
  passageText: string;
  mode: EslReadingMode;
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
        audioBytes: input.audioBytes.byteLength,
        durationMs: input.durationMs
      })
    };
  }
};

export const generatePassageTitle = async (env: Env, contentText: string): Promise<string> => {
  const apiKey = env.GEMINI_API_KEY?.trim();
  if (!apiKey) return contentText.slice(0, 60).trim();

  const model = "gemini-2.0-flash-lite";
  const prompt = `给这段英文文本生成一个简短的标题（10个英文单词以内）。只返回标题文字，不要引号或其他格式。\n\n${contentText.slice(0, 1000)}`;

  try {
    const response = await fetch(
      `${GEMINI_BASE_URL}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 60 }
        })
      }
    );
    if (!response.ok) return contentText.slice(0, 60).trim();
    const json = (await response.json()) as GeminiResponse;
    const text = json.candidates?.[0]?.content?.parts?.find((p) => typeof p.text === "string")?.text?.trim();
    return text && text.length > 0 && text.length < 120 ? text : contentText.slice(0, 60).trim();
  } catch {
    return contentText.slice(0, 60).trim();
  }
};
