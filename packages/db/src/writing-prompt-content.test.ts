import { describe, expect, it } from "vitest";
import prompts from "../../../scripts/writing-prompt-seed/prompts.source.json";
import { validateWritingPromptBatch } from "./writing-prompt-domain";

/**
 * The reviewable source has to satisfy the *domain* contract — the rules that hold for any
 * batch, in any release. How many prompts a given authorized release must contain, and how they
 * are distributed across bands and kinds, is editorial policy and is enforced in one place:
 * `scripts/writing-prompt-seed/policy.ts`, with its own tests. This file deliberately no longer
 * restates those counts. It did, as literals, and the second batch therefore failed here as
 * well as in the policy — one census expressed twice is one census that can disagree with
 * itself.
 */
describe("reviewable Writing prompt source", () => {
  it("satisfies the domain contract", () => {
    expect(validateWritingPromptBatch(prompts)).toEqual([]);
  });

  it("has unique identity across the whole source", () => {
    expect(new Set(prompts.map((prompt) => prompt.id)).size).toBe(prompts.length);
    expect(new Set(prompts.map((prompt) => prompt.slug)).size).toBe(prompts.length);
  });

  it("keeps every Task 1 representation anchored to explicit editorial facts", () => {
    const task1 = prompts.filter((prompt) => prompt.taskType === "academic_task_1");
    expect(task1.length).toBeGreaterThan(0);
    for (const prompt of task1) {
      expect(prompt.material).toBeDefined();
      expect(prompt.assetAltText?.length).toBeGreaterThanOrEqual(20);
      expect(prompt.material?.keyFeatures.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("gives every general prompt a band and every IELTS prompt none", () => {
    for (const prompt of prompts) {
      if (prompt.family === "general") expect(prompt.cefrBand).not.toBeNull();
      else expect(prompt.cefrBand).toBeNull();
    }
  });
});
