import type { AppLoadContext } from "@remix-run/cloudflare";
import { setDictationAttemptFeedback } from "@bcailab/db";
import { callGemini, parseJsonFromText } from "~/utils/llm.server";
import type { DiffOp } from "~/utils/dictation-diff";

/**
 * LLM error-pattern feedback for a completed dictation attempt (design §8).
 *
 * The deterministic diff already *measures* what went wrong; the model's only job
 * is to name the recurring patterns behind those errors. Input is the non-match ops
 * plus the CEFR band — never the raw audio, and never the learner profile (v1 does
 * not touch `esl_learner_profiles`).
 *
 * Runs in the background via `waitUntil`, filling the `feedback_json` null slot the
 * summary page polls. Failure must never fail the attempt: the attempt row is
 * already committed, so a failed call just leaves the panel absent.
 */

export type DictationErrorPattern = {
  pattern: string;
  evidence: string;
  tip: string;
};

export type DictationFeedback = {
  patterns: DictationErrorPattern[];
};

type SentenceResultInput = {
  idx: number;
  userText: string;
  accuracy: number;
  ops: DiffOp[];
};

const MAX_PATTERNS = 4;

const describeOps = (results: SentenceResultInput[]): string =>
  results
    .filter((result) => result.ops.length > 0)
    .map((result) => {
      const ops = result.ops
        .map((op) => {
          if (op.op === "substitute") return `heard "${op.got}" instead of "${op.ref}"`;
          if (op.op === "delete") return `missed "${op.ref}"`;
          if (op.op === "insert") return `added "${op.got}"`;
          return null;
        })
        .filter(Boolean)
        .join("; ");
      return `Sentence ${result.idx + 1}: ${ops}`;
    })
    .join("\n");

const buildPrompt = (band: string, opsSummary: string): string =>
  `A learner at CEFR level ${band} completed an English listening dictation exercise.
Below are their transcription errors, derived by comparing what they typed against the
reference text word by word.

${opsSummary}

Identify 2 to ${MAX_PATTERNS} recurring error patterns. Look for things like homophone
confusion, dropped articles, missed verb or plural endings, weak-form and linking
problems, or contractions written out. Ignore one-off slips that show no pattern.

For each pattern give:
- "pattern": the name of the pattern, a short phrase
- "evidence": the specific words from the errors above that show it
- "tip": one concrete, actionable listening tip, at most two sentences

Respond with JSON only, no markdown fences:
{"patterns": [{"pattern": "...", "evidence": "...", "tip": "..."}]}`;

const coerceFeedback = (value: unknown): DictationFeedback | null => {
  if (!value || typeof value !== "object") return null;
  const rawPatterns = (value as { patterns?: unknown }).patterns;
  if (!Array.isArray(rawPatterns)) return null;

  const patterns = rawPatterns
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
    .map((entry) => ({
      pattern: String(entry.pattern ?? "").trim(),
      evidence: String(entry.evidence ?? "").trim(),
      tip: String(entry.tip ?? "").trim()
    }))
    .filter((entry) => entry.pattern && entry.tip)
    .slice(0, MAX_PATTERNS);

  return patterns.length > 0 ? { patterns } : null;
};

const runFeedback = async (
  context: AppLoadContext,
  input: { attemptId: string; userId: string; band: string; results: SentenceResultInput[] }
): Promise<void> => {
  try {
    const opsSummary = describeOps(input.results);
    // A flawless attempt has no patterns to find — skip the call entirely.
    if (!opsSummary) return;

    const { text } = await callGemini({
      env: context.env,
      task: "dictation_feedback",
      parts: [{ text: buildPrompt(input.band, opsSummary) }],
      generationConfig: { responseMimeType: "application/json" }
    });

    const feedback = coerceFeedback(parseJsonFromText(text));
    if (!feedback) return;

    await setDictationAttemptFeedback(context.env.DB, {
      id: input.attemptId,
      userId: input.userId,
      feedbackJson: JSON.stringify(feedback)
    });
  } catch (error) {
    // Never surface: the attempt is already stored and the summary renders without
    // the panel. Logged so failures are visible in `wrangler tail`.
    console.error("dictation feedback failed:", error);
  }
};

/** Fire-and-forget; resolves immediately when the platform supports `waitUntil`. */
export const scheduleDictationFeedback = async (
  context: AppLoadContext,
  input: { attemptId: string; userId: string; band: string; results: SentenceResultInput[] }
): Promise<void> => {
  const task = runFeedback(context, input);
  if (context.ctx?.waitUntil) {
    context.ctx.waitUntil(task);
    return;
  }
  await task;
};
