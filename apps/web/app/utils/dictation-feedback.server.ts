import type { AppLoadContext } from "@remix-run/cloudflare";
import { setDictationAttemptFeedback } from "@bcailab/db";
import { callGemini, parseJsonFromText } from "~/utils/llm.server";
import type { DiffOp } from "~/utils/dictation-diff";
import { assembleDictationFeedbackContext } from "~/utils/learner-context.server";
import type { FeedbackLanguage } from "~/utils/feedback-language";

/**
 * LLM error-pattern feedback for a completed dictation attempt (design §8).
 *
 * The deterministic diff already *measures* what went wrong; the model's only job
 * is to name the recurring patterns behind those errors. Input is the non-match ops,
 * the passage band, and the learner brief (ADR 0010) — the learner's own level, tag
 * accuracy labelled by provenance, earlier dictation feedback, and grammar notes from
 * Writing. Never the raw audio. The brief is context only: this grader's measurement is
 * the diff, computed before the call, so the brief cannot contaminate it.
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

/**
 * Asked for only when the learner reads Chinese feedback. English feedback adds nothing, so its
 * prompt stays byte-identical to what it was before a feedback language existed. Evidence stays
 * English because it quotes what the learner typed.
 */
export const DICTATION_CHINESE_FEEDBACK_DIRECTIVE =
  'Write "pattern" and "tip" in Simplified Chinese. Keep "evidence" as the learner\'s English words exactly as listed above.';

/**
 * The band belongs to the passage. The learner's own level arrives in the learner context and
 * is never inferred from the material they happened to pick. Exported for prompt fixtures.
 */
export const buildDictationFeedbackPrompt = (input: {
  passageBand: string | null;
  opsSummary: string;
  learnerContext: string;
  feedbackLanguage?: FeedbackLanguage;
}): string => {
  const exercise = input.passageBand
    ? `A learner completed an English listening dictation exercise on a passage graded CEFR ${input.passageBand}.`
    : "A learner completed an English listening dictation exercise.";
  const learnerContext = input.learnerContext ? `\n${input.learnerContext}\n` : "";
  const languageDirective =
    input.feedbackLanguage === "zh" ? `\n${DICTATION_CHINESE_FEEDBACK_DIRECTIVE}\n` : "";
  return `${exercise}
${learnerContext}
Below are their transcription errors on this attempt, derived by comparing what they typed
against the reference text word by word.

${input.opsSummary}

Identify 2 to ${MAX_PATTERNS} recurring error patterns. Look for things like homophone
confusion, dropped articles, missed verb or plural endings, weak-form and linking
problems, or contractions written out. Ignore one-off slips that show no pattern.

For each pattern give:
- "pattern": the name of the pattern, a short phrase
- "evidence": the specific words from the errors above that show it
- "tip": one concrete, actionable listening tip, at most two sentences
${languageDirective}
Respond with JSON only, no markdown fences:
{"patterns": [{"pattern": "...", "evidence": "...", "tip": "..."}]}`;
};

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

type FeedbackRequest = {
  attemptId: string;
  userId: string;
  band: string | null;
  results: SentenceResultInput[];
  /** The resolved language — the learner's choice, or the interface language. */
  feedbackLanguage: FeedbackLanguage;
};

const runFeedback = async (context: AppLoadContext, input: FeedbackRequest): Promise<void> => {
  try {
    const opsSummary = describeOps(input.results);
    // A flawless attempt has no patterns to find — skip the call entirely.
    if (!opsSummary) return;

    // Assembled inside this background task, so its reads never reach the learner's request.
    const learnerContext = await assembleDictationFeedbackContext(context, {
      userId: input.userId,
      attemptId: input.attemptId
    });

    const { text } = await callGemini({
      env: context.env,
      task: "dictation_feedback",
      parts: [
        {
          text: buildDictationFeedbackPrompt({
            passageBand: input.band,
            opsSummary,
            learnerContext,
            feedbackLanguage: input.feedbackLanguage
          })
        }
      ],
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
  input: FeedbackRequest
): Promise<void> => {
  const task = runFeedback(context, input);
  if (context.ctx?.waitUntil) {
    context.ctx.waitUntil(task);
    return;
  }
  await task;
};
