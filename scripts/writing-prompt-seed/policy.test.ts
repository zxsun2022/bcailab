import { describe, expect, it } from "vitest";
import prompts from "./prompts.source.json";
import {
  WRITING_PROMPT_BATCH_SIZE,
  WRITING_PROMPT_BATCH_TOTALS,
  validateWritingPromptReleaseBatch
} from "./policy";

describe("Writing prompt editorial policy", () => {
  it("accepts the authorized distribution", () => {
    expect(validateWritingPromptReleaseBatch(prompts)).toEqual([]);
  });

  it("rejects a short batch without weakening the reusable domain contract", () => {
    const issues = validateWritingPromptReleaseBatch(prompts.slice(0, 2));
    expect(
      issues.some((issue) => issue.message.includes(`exactly ${WRITING_PROMPT_BATCH_SIZE}`))
    ).toBe(true);
    expect(
      issues.some((issue) =>
        issue.message.includes(`${WRITING_PROMPT_BATCH_TOTALS.task1} IELTS Task 1`)
      )
    ).toBe(true);
  });

  it("derives its totals from the per-kind census, so the two cannot disagree", () => {
    expect(WRITING_PROMPT_BATCH_SIZE).toBe(
      WRITING_PROMPT_BATCH_TOTALS.general +
        WRITING_PROMPT_BATCH_TOTALS.task1 +
        WRITING_PROMPT_BATCH_TOTALS.task2
    );
  });

  it("requires balance across Task 1 kinds, not just a total", () => {
    // Duplicating one kind to reach the right total must still fail: an expansion that
    // doubled only the cheap kinds would grow the bank without widening the practice.
    const task1 = prompts.filter((prompt) => prompt.taskType === "academic_task_1");
    const lopsided = [
      ...prompts.filter((prompt) => prompt.taskType !== "academic_task_1"),
      ...task1.map((prompt) => ({ ...prompt, promptKind: "line_graph" }))
    ];
    const issues = validateWritingPromptReleaseBatch(lopsided);
    expect(issues.some((issue) => issue.message.includes("Task 1 line_graph"))).toBe(true);
    expect(issues.some((issue) => issue.message.includes("Task 1 map"))).toBe(true);
  });
});
