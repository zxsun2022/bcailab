import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildDictationFeedbackPrompt,
  DICTATION_CHINESE_FEEDBACK_DIRECTIVE
} from "./dictation-feedback.server";

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

describe("dictation feedback language", () => {
  const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
  const cases = [
    { passageBand: "B2", learnerContext: "" },
    { passageBand: null, learnerContext: "" },
    {
      passageBand: "A2",
      learnerContext: "## Learner context (as of 2026-09-15)\nLevel: not established"
    }
  ] as const;

  // Hashes of the prompts the code produced before a feedback language existed, taken from the
  // previous commit. English feedback must reach the model exactly as it did.
  const PRE_CHANGE_SHA256 = [
    "514ef012511058ff7877ee047382786bf4432d8735b7a97e86d597da63a039f3",
    "ac5678fb5b438d8693db676ada25271a68cb24223b8043a6e0b7a7ed887099f3",
    "8b076cf8cf0df63676d270f6f509cb8f4ef24841514794451e2b984a7ee0cd36"
  ];

  it("leaves the English prompt byte-identical to the pre-change prompt", () => {
    cases.forEach((input, index) => {
      const omitted = buildDictationFeedbackPrompt({ ...input, opsSummary });
      const english = buildDictationFeedbackPrompt({ ...input, opsSummary, feedbackLanguage: "en" });
      expect(english).toBe(omitted);
      expect(sha256(english)).toBe(PRE_CHANGE_SHA256[index]);
    });
  });

  it("adds only the Chinese directive for Chinese feedback", () => {
    for (const input of cases) {
      const english = buildDictationFeedbackPrompt({ ...input, opsSummary, feedbackLanguage: "en" });
      const chinese = buildDictationFeedbackPrompt({ ...input, opsSummary, feedbackLanguage: "zh" });
      expect(chinese).toContain(DICTATION_CHINESE_FEEDBACK_DIRECTIVE);
      expect(chinese.replace(`\n${DICTATION_CHINESE_FEEDBACK_DIRECTIVE}\n`, "")).toBe(english);
    }
  });

  it("asks for the directive before the response format, where the model reads it as an instruction", () => {
    const chinese = buildDictationFeedbackPrompt({
      passageBand: "B1",
      opsSummary,
      learnerContext: "",
      feedbackLanguage: "zh"
    });
    expect(chinese.indexOf(DICTATION_CHINESE_FEEDBACK_DIRECTIVE)).toBeLessThan(
      chinese.indexOf("Respond with JSON only")
    );
  });
});

