import {
  getWritingPracticeItem,
  getWritingRevisionById,
  listWritingPracticeItemsByRevision,
  startWritingPracticeItem,
  updateWritingPracticeItem,
  type WritingPracticeItem
} from "@bcailab/db";
import type { Env } from "~/types/env";
import { callGemini, parseJsonFromText } from "~/utils/llm.server";
import type { WritingAnnotation, WritingFeedback } from "~/utils/writing-eval.server";
import {
  applyAttempt,
  awaitingStep,
  beginTransfer,
  buildJudgementPrompt,
  buildTransferPrompt,
  canBeginTransfer,
  endPractice,
  isEnded,
  normaliseAnswer,
  normaliseJudgement,
  normaliseSituation,
  parseAttempts,
  practiceTargets,
  practiceView,
  PracticeError,
  type PracticeLanguage,
  type PracticeState,
  type PracticeView
} from "~/utils/writing-practice";

/** Raised when another request changed the item first; the page should reload it. */
export class PracticeConflictError extends Error {}

const parseFeedback = (json: string | null): WritingFeedback | null => {
  if (!json) return null;
  try {
    return JSON.parse(json) as WritingFeedback;
  } catch {
    return null;
  }
};

const parseAnnotation = (json: string): WritingAnnotation => JSON.parse(json) as WritingAnnotation;

const stateOf = (item: WritingPracticeItem): PracticeState => ({
  status: item.status,
  transferPrompt: item.transfer_prompt,
  attempts: parseAttempts(item.attempts_json)
});

const viewOf = (item: WritingPracticeItem, state = stateOf(item)): PracticeView =>
  practiceView({ id: item.id, annotationIndex: item.annotation_index, annotation: parseAnnotation(item.annotation_json), state });

const save = async (db: D1Database, item: WritingPracticeItem, next: PracticeState): Promise<PracticeView> => {
  const saved = await updateWritingPracticeItem(db, {
    id: item.id,
    userId: item.user_id,
    version: item.version,
    status: next.status,
    transferPrompt: next.transferPrompt,
    attemptsJson: JSON.stringify(next.attempts),
    ended: isEnded(next.status) && !isEnded(item.status)
  });
  if (!saved) throw new PracticeConflictError("The practice changed in another request.");
  return viewOf(item, next);
};

/**
 * The practice state of one completed feedback round: which annotations qualify and the items
 * already started on it. Read-only; a round that is not completed has no targets.
 */
export const loadRoundPractice = async (
  db: D1Database,
  input: { userId: string; revision: { id: string; user_text: string; feedback_generation: number; feedback_status: string }; feedback: WritingFeedback | null }
): Promise<{ targets: number[]; items: PracticeView[] }> => {
  if (input.revision.feedback_status !== "completed") return { targets: [], items: [] };
  const items = await listWritingPracticeItemsByRevision(db, {
    userId: input.userId,
    revisionId: input.revision.id,
    feedbackGeneration: input.revision.feedback_generation
  });
  return { targets: practiceTargets(input.feedback, input.revision.user_text), items: items.map((item) => viewOf(item)) };
};

export const startPractice = async (
  db: D1Database,
  input: { userId: string; articleId: string; revisionId: string; annotationIndex: number; language: PracticeLanguage }
): Promise<PracticeView> => {
  const revision = await getWritingRevisionById(db, input.revisionId);
  if (!revision || revision.user_id !== input.userId || revision.article_id !== input.articleId ||
      revision.feedback_status !== "completed") {
    throw new PracticeError("invalid_state", "This round has no completed feedback.");
  }
  const feedback = parseFeedback(revision.feedback_json);
  if (!practiceTargets(feedback, revision.user_text).includes(input.annotationIndex)) {
    throw new PracticeError("invalid_state", "This annotation cannot be practised.");
  }
  const item = await startWritingPracticeItem(db, {
    userId: input.userId,
    articleId: input.articleId,
    revisionId: revision.id,
    feedbackGeneration: revision.feedback_generation,
    annotationIndex: input.annotationIndex,
    annotationJson: JSON.stringify(feedback!.annotations[input.annotationIndex]),
    feedbackLanguage: input.language
  });
  return viewOf(item);
};

const loadOwnItem = async (db: D1Database, input: { userId: string; articleId: string; itemId: string }) => {
  const item = await getWritingPracticeItem(db, { id: input.itemId, userId: input.userId });
  if (!item || item.article_id !== input.articleId) throw new PracticeError("invalid_state", "Practice not found.");
  return item;
};

/** Judges one answer: exactly one model call. A failed call leaves the item unchanged. */
export const answerPractice = async (
  env: Env,
  input: { userId: string; articleId: string; itemId: string; answer: string }
): Promise<PracticeView> => {
  const item = await loadOwnItem(env.DB, input);
  const state = stateOf(item);
  const answer = normaliseAnswer(input.answer);
  // Checked before paying for a call: an ended item or a concluded step takes no answer.
  const step = awaitingStep(state);
  if (!step) throw new PracticeError("invalid_state", "This step is not waiting for an answer.");

  const { modelName, text } = await callGemini({
    env,
    task: "writing_practice",
    parts: [{
      text: buildJudgementPrompt({
        annotation: parseAnnotation(item.annotation_json),
        step,
        transferPrompt: state.transferPrompt,
        answer,
        language: item.feedback_language
      })
    }],
    generationConfig: { responseMimeType: "application/json", temperature: 0.2 }
  });
  const judgement = normaliseJudgement(parseJsonFromText(text));
  const next = applyAttempt(state, { step, answer, ...judgement, model: modelName, at: new Date().toISOString() });
  return save(env.DB, item, next);
};

/** Generates step 2's situation: exactly one model call. */
export const beginTransferStep = async (
  env: Env,
  input: { userId: string; articleId: string; itemId: string }
): Promise<PracticeView> => {
  const item = await loadOwnItem(env.DB, input);
  const state = stateOf(item);
  if (!canBeginTransfer(state)) throw new PracticeError("invalid_state", "Step 1 is not over yet.");
  const annotation = parseAnnotation(item.annotation_json);
  const { text } = await callGemini({
    env,
    task: "writing_practice",
    parts: [{ text: buildTransferPrompt({ annotation, language: item.feedback_language }) }],
    generationConfig: { responseMimeType: "application/json", temperature: 0.7 }
  });
  const situation = normaliseSituation(parseJsonFromText(text), annotation.quoted_text);
  return save(env.DB, item, beginTransfer(state, situation));
};

export const endPracticeItem = async (
  db: D1Database,
  input: { userId: string; articleId: string; itemId: string; outcome: "skipped" | "disputed" }
): Promise<PracticeView> => {
  const item = await loadOwnItem(db, input);
  return save(db, item, endPractice(stateOf(item), input.outcome));
};
