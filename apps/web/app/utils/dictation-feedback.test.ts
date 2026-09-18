import { describe, expect, it } from "vitest";
import { buildDictationFeedbackPrompt } from "./dictation-feedback.server";

const opsSummary = 'Sentence 1: missed "the"; heard "walk" instead of "walked"';

describe("dictation feedback prompt", () => {
  it("describes the passage band without presenting it as the learner's level", () => {
    const prompt = buildDictationFeedbackPrompt({ passageBand: "B2", opsSummary, learnerContext: "" });
    expect(prompt).toContain("on a passage graded CEFR B2.");
    expect(prompt).not.toMatch(/learner at CEFR level/i);
    expect(prompt).not.toContain("## Learner context");
    expect(prompt).toContain(opsSummary);
  });

  it("makes no band or level claim for an unbanded passage", () => {
    const prompt = buildDictationFeedbackPrompt({ passageBand: null, opsSummary, learnerContext: "" });
    expect(prompt).not.toMatch(/CEFR|\bB1\b/);
  });

  it("places the learner context after the exercise and before the attempt's errors", () => {
    const learnerContext = "## Learner context (as of 2026-09-15)\nLevel: not established";
    const prompt = buildDictationFeedbackPrompt({ passageBand: "A2", opsSummary, learnerContext });
    const contextAt = prompt.indexOf(learnerContext);
    expect(contextAt).toBeGreaterThan(prompt.indexOf("dictation exercise"));
    expect(contextAt).toBeLessThan(prompt.indexOf(opsSummary));
  });
});
