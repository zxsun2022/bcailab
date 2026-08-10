import {
  WRITING_PROMPT_CEFR_BANDS,
  validateWritingPromptBatch,
  type PromptValidationIssue
} from "@bcailab/db";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** Editorial acceptance policy for the authorized first 48-prompt release only. */
export const validateInitialWritingPromptBatch = (
  value: unknown
): PromptValidationIssue[] => {
  const issues = validateWritingPromptBatch(value);
  if (!Array.isArray(value)) return issues;

  WRITING_PROMPT_CEFR_BANDS.forEach((band) => {
    const count = value.filter(
      (prompt) => isRecord(prompt) && prompt.family === "general" && prompt.cefrBand === band
    ).length;
    if (count !== 6) {
      issues.push({ path: "prompts", message: `must contain 6 ${band} prompts; found ${count}` });
    }
  });
  const task1 = value.filter(
    (prompt) => isRecord(prompt) && prompt.taskType === "academic_task_1"
  );
  const task2 = value.filter(
    (prompt) => isRecord(prompt) && prompt.taskType === "academic_task_2"
  );
  if (task1.length !== 12) {
    issues.push({ path: "prompts", message: `must contain 12 IELTS Task 1 prompts; found ${task1.length}` });
  }
  if (task2.length !== 12) {
    issues.push({ path: "prompts", message: `must contain 12 IELTS Task 2 prompts; found ${task2.length}` });
  }
  (["line_graph", "bar_chart", "pie_chart", "table", "process", "map"] as const).forEach((kind) => {
    const count = task1.filter(
      (prompt) => isRecord(prompt) && prompt.promptKind === kind
    ).length;
    if (count !== 2) {
      issues.push({ path: "prompts", message: `must contain 2 Task 1 ${kind} prompts; found ${count}` });
    }
  });
  (["opinion_essay", "discussion", "problem_solution", "advantages_disadvantages"] as const).forEach((kind) => {
    const count = task2.filter(
      (prompt) => isRecord(prompt) && prompt.promptKind === kind
    ).length;
    if (count !== 3) {
      issues.push({ path: "prompts", message: `must contain 3 Task 2 ${kind} prompts; found ${count}` });
    }
  });
  if (value.length !== 48) {
    issues.push({ path: "prompts", message: `must contain exactly 48 prompts; found ${value.length}` });
  }
  return issues;
};
