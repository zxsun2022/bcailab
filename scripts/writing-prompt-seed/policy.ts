import {
  WRITING_PROMPT_CEFR_BANDS,
  validateWritingPromptBatch,
  type PromptValidationIssue
} from "@bcailab/db";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const TASK_1_KINDS = ["line_graph", "bar_chart", "pie_chart", "table", "process", "map"] as const;
const TASK_2_KINDS = [
  "opinion_essay",
  "discussion",
  "problem_solution",
  "advantages_disadvantages"
] as const;

/**
 * The census the currently authorized release must match, expressed per band and per kind.
 *
 * This used to be a set of literals describing the first 48-prompt batch, which made the
 * second batch a code change rather than a content change. The counts are data now: a newly
 * authorized expansion edits this constant, and the totals below are derived from it so a
 * stated total can never drift from the parts it is supposed to sum.
 *
 * Balance is the point rather than the size. Task 1 material kinds and Task 2 essay families
 * are what a learner actually chooses between, so an expansion that doubled only the easy
 * kinds would grow the bank without widening the practice it offers.
 */
export const WRITING_PROMPT_BATCH_CENSUS = {
  /** Per CEFR band, across the four general bands. */
  generalPerBand: 6,
  /** Per Task 1 material kind, across the six kinds. */
  task1PerKind: 4,
  /** Per Task 2 essay family, across the four families. */
  task2PerKind: 6
} as const;

export const WRITING_PROMPT_BATCH_TOTALS = {
  general: WRITING_PROMPT_BATCH_CENSUS.generalPerBand * WRITING_PROMPT_CEFR_BANDS.length,
  task1: WRITING_PROMPT_BATCH_CENSUS.task1PerKind * TASK_1_KINDS.length,
  task2: WRITING_PROMPT_BATCH_CENSUS.task2PerKind * TASK_2_KINDS.length
} as const;

export const WRITING_PROMPT_BATCH_SIZE =
  WRITING_PROMPT_BATCH_TOTALS.general +
  WRITING_PROMPT_BATCH_TOTALS.task1 +
  WRITING_PROMPT_BATCH_TOTALS.task2;

/** Editorial acceptance policy for the currently authorized release. */
export const validateWritingPromptReleaseBatch = (
  value: unknown
): PromptValidationIssue[] => {
  const issues = validateWritingPromptBatch(value);
  if (!Array.isArray(value)) return issues;

  WRITING_PROMPT_CEFR_BANDS.forEach((band) => {
    const count = value.filter(
      (prompt) => isRecord(prompt) && prompt.family === "general" && prompt.cefrBand === band
    ).length;
    if (count !== WRITING_PROMPT_BATCH_CENSUS.generalPerBand) {
      issues.push({
        path: "prompts",
        message: `must contain ${WRITING_PROMPT_BATCH_CENSUS.generalPerBand} ${band} prompts; found ${count}`
      });
    }
  });
  const task1 = value.filter(
    (prompt) => isRecord(prompt) && prompt.taskType === "academic_task_1"
  );
  const task2 = value.filter(
    (prompt) => isRecord(prompt) && prompt.taskType === "academic_task_2"
  );
  if (task1.length !== WRITING_PROMPT_BATCH_TOTALS.task1) {
    issues.push({
      path: "prompts",
      message: `must contain ${WRITING_PROMPT_BATCH_TOTALS.task1} IELTS Task 1 prompts; found ${task1.length}`
    });
  }
  if (task2.length !== WRITING_PROMPT_BATCH_TOTALS.task2) {
    issues.push({
      path: "prompts",
      message: `must contain ${WRITING_PROMPT_BATCH_TOTALS.task2} IELTS Task 2 prompts; found ${task2.length}`
    });
  }
  TASK_1_KINDS.forEach((kind) => {
    const count = task1.filter(
      (prompt) => isRecord(prompt) && prompt.promptKind === kind
    ).length;
    if (count !== WRITING_PROMPT_BATCH_CENSUS.task1PerKind) {
      issues.push({
        path: "prompts",
        message: `must contain ${WRITING_PROMPT_BATCH_CENSUS.task1PerKind} Task 1 ${kind} prompts; found ${count}`
      });
    }
  });
  TASK_2_KINDS.forEach((kind) => {
    const count = task2.filter(
      (prompt) => isRecord(prompt) && prompt.promptKind === kind
    ).length;
    if (count !== WRITING_PROMPT_BATCH_CENSUS.task2PerKind) {
      issues.push({
        path: "prompts",
        message: `must contain ${WRITING_PROMPT_BATCH_CENSUS.task2PerKind} Task 2 ${kind} prompts; found ${count}`
      });
    }
  });
  if (value.length !== WRITING_PROMPT_BATCH_SIZE) {
    issues.push({
      path: "prompts",
      message: `must contain exactly ${WRITING_PROMPT_BATCH_SIZE} prompts; found ${value.length}`
    });
  }
  return issues;
};
