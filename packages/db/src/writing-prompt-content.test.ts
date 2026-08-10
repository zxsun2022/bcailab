import { describe, expect, it } from "vitest";
import prompts from "../../../scripts/writing-prompt-seed/prompts.source.json";
import { validateWritingPromptBatch } from "./writing-prompt-domain";

describe("reviewable Writing prompt source", () => {
  it("contains the authorized 48-prompt distribution and satisfies the domain contract", () => {
    expect(validateWritingPromptBatch(prompts)).toEqual([]);
    expect(prompts).toHaveLength(48);
    expect(prompts.filter((prompt) => prompt.family === "general")).toHaveLength(24);
    expect(prompts.filter((prompt) => prompt.taskType === "academic_task_1")).toHaveLength(12);
    expect(prompts.filter((prompt) => prompt.taskType === "academic_task_2")).toHaveLength(12);
  });

  it("keeps every Task 1 representation anchored to explicit editorial facts", () => {
    const task1 = prompts.filter((prompt) => prompt.taskType === "academic_task_1");
    for (const prompt of task1) {
      expect(prompt.material).toBeDefined();
      expect(prompt.assetAltText?.length).toBeGreaterThanOrEqual(20);
      expect(prompt.material?.keyFeatures.length).toBeGreaterThanOrEqual(2);
    }
  });
});
