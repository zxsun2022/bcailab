import { describe, expect, it } from "vitest";
import prompts from "./prompts.source.json";
import { validateInitialWritingPromptBatch } from "./policy";

describe("initial Writing prompt editorial policy", () => {
  it("accepts the authorized 48-prompt distribution", () => {
    expect(validateInitialWritingPromptBatch(prompts)).toEqual([]);
  });

  it("rejects a later-sized batch without weakening the reusable domain contract", () => {
    const issues = validateInitialWritingPromptBatch(prompts.slice(0, 2));
    expect(issues.some((issue) => issue.message.includes("exactly 48"))).toBe(true);
    expect(issues.some((issue) => issue.message.includes("12 IELTS Task 1"))).toBe(true);
  });
});
