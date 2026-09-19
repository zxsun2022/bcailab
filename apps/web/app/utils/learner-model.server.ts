import type { AppLoadContext } from "@remix-run/cloudflare";
import {
  getDictationBandResults,
  getEslLearnerProfile,
  getRecentLearnerTagObservations,
  incrementEslLearnerProfileCounters,
  insertLearnerTagObservations,
  updateLearnerNamedPatterns,
  updateLearnerProfileAggregate
} from "@bcailab/db";
import { callGemini, parseJsonFromText, toStringArray } from "~/utils/llm.server";
import {
  aggregateTagMastery,
  attributeDictationErrors,
  estimateCefrFromDictation,
  NAMING_MIN_EXPOSURE,
  resolveCefr,
  STRONG_MASTERY_FROM,
  TAG_DESCRIPTIONS,
  WEAK_MASTERY_BELOW,
  type DictationSentenceInput,
  type TagMasteryMap
} from "~/utils/learner-model";

/**
 * Server orchestration for the learner model. Design: `docs/learner-model-design.md`.
 *
 * The write path is two-speed (§6.2): per attempt we record the deterministic observations
 * and bump the throttle counter synchronously; the recompute (aggregate + LLM naming) runs in
 * the background and only when the counter crosses `RECOMPUTE_EVERY`, so the hot attempt path
 * never waits on a full aggregation or a model call. All of it fails soft — the attempt is
 * already committed, and a learner-model failure must never fail practice.
 */

/** Recompute after this many attempts since the last one. Tunable (design §6.2). */
const RECOMPUTE_EVERY = 3;

/**
 * Record a completed dictation attempt into the learner model: attribute its errors to the
 * tag vocabulary, store the observations, bump the profile counters, then schedule the
 * throttled recompute. Signed-in learners only — anonymous practice writes nothing (§4.2).
 */
export const recordDictationObservations = async (
  context: AppLoadContext,
  input: {
    userId: string;
    passageId: string;
    attemptId: string;
    sentences: DictationSentenceInput[];
    /** The completed attempt's active practice time (`dictation_attempts.practice_seconds`). */
    practiceSeconds: number;
  }
): Promise<void> => {
  try {
    const tallies = attributeDictationErrors(input.sentences);
    await insertLearnerTagObservations(context.env.DB, {
      userId: input.userId,
      mode: "dictation",
      passageId: input.passageId,
      attemptId: input.attemptId,
      source: "deterministic",
      tallies: [...tallies].map(([tag, tally]) => ({
        tag,
        exposure: tally.exposure,
        hits: tally.hits
      }))
    });
    // Dictation contributes to the shared profile (v1 deliberately did not), including its
    // active practice time, credited once when the attempt completes.
    await incrementEslLearnerProfileCounters(context.env.DB, {
      userId: input.userId,
      practiceSeconds: input.practiceSeconds
    });
  } catch (error) {
    console.error("learner-model observation write failed:", error);
    return;
  }
  await scheduleLearnerModelRecompute(context, input.userId);
};

/** Fire-and-forget recompute; resolves immediately where `waitUntil` is available. */
export const scheduleLearnerModelRecompute = async (
  context: AppLoadContext,
  userId: string
): Promise<void> => {
  const task = runRecompute(context, userId);
  if (context.ctx?.waitUntil) {
    context.ctx.waitUntil(task);
    return;
  }
  await task;
};

const runRecompute = async (context: AppLoadContext, userId: string): Promise<void> => {
  try {
    const profile = await getEslLearnerProfile(context.env.DB, userId);
    if (!profile) return;
    if (profile.eval_count_since_update < RECOMPUTE_EVERY) return;

    // Deterministic aggregation — the measurement.
    const observations = await getRecentLearnerTagObservations(context.env.DB, userId);
    const tagMastery = aggregateTagMastery(observations);

    const bandResults = await getDictationBandResults(context.env.DB, userId);
    const measured = estimateCefrFromDictation(bandResults);
    const resolved = resolveCefr({
      declared: profile.cefr_declared,
      measured: measured.level,
      measuredConfidence: measured.confidence
    });

    await updateLearnerProfileAggregate(context.env.DB, {
      userId,
      tagMasteryJson: JSON.stringify(tagMastery),
      cefrMeasured: measured.level,
      cefrMeasuredConfidence: measured.confidence,
      cefrEstimate: resolved.level
    });

    // LLM naming pass — interpretation only. Never decides whether a weakness exists; it
    // phrases what the aggregate already shows (§2, §6.4).
    await runNamingPass(context, userId, tagMastery);
  } catch (error) {
    console.error("learner-model recompute failed:", error);
  }
};

const buildNamingPrompt = (
  weak: { tag: string; mastery: number }[],
  strong: { tag: string; mastery: number }[]
): string => {
  const describe = (rows: { tag: string; mastery: number }[]) =>
    rows
      .map((r) => `- ${TAG_DESCRIPTIONS[r.tag] ?? r.tag} (accuracy ${Math.round(r.mastery * 100)}%)`)
      .join("\n");
  return `An English learner's practice data shows these measured patterns. Do not invent or
judge new weaknesses — only phrase the ones listed, for the learner to read.

Weaknesses (lower accuracy):
${weak.length ? describe(weak) : "- none"}

Strengths (higher accuracy):
${strong.length ? describe(strong) : "- none"}

Write short, encouraging, learner-facing phrases. Respond with JSON only, no markdown fences:
{"issues": ["short phrase", ...], "strengths": ["short phrase", ...]}
At most 4 items in each array; each phrase at most 12 words.`;
};

const runNamingPass = async (
  context: AppLoadContext,
  userId: string,
  tagMastery: TagMasteryMap
): Promise<void> => {
  const named = Object.entries(tagMastery)
    .map(([tag, m]) => ({ tag, ...m }))
    .filter((m) => m.exposure >= NAMING_MIN_EXPOSURE);

  const weak = named
    .filter((m) => m.mastery < WEAK_MASTERY_BELOW)
    .sort((a, b) => a.mastery - b.mastery)
    .slice(0, 4);
  const strong = named
    .filter((m) => m.mastery >= STRONG_MASTERY_FROM)
    .sort((a, b) => b.mastery - a.mastery)
    .slice(0, 4);

  // Nothing worth naming yet — leave the fields as they are rather than blank them.
  if (weak.length === 0 && strong.length === 0) return;

  const { text } = await callGemini({
    env: context.env,
    task: "learner_profile_naming",
    parts: [{ text: buildNamingPrompt(weak, strong) }],
    generationConfig: { responseMimeType: "application/json" }
  });

  const parsed = parseJsonFromText(text) as { issues?: unknown; strengths?: unknown } | null;
  if (!parsed) return;

  await updateLearnerNamedPatterns(context.env.DB, {
    userId,
    persistentIssuesJson: JSON.stringify(toStringArray(parsed.issues, 4)),
    strengthsJson: JSON.stringify(toStringArray(parsed.strengths, 4))
  });
};
