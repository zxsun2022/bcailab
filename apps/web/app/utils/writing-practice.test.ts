import { describe, expect, it } from "vitest";
import type { WritingAnnotation, WritingFeedback } from "./writing-eval.server";
import {
  applyAttempt,
  awaitingStep,
  beginTransfer,
  buildJudgementPrompt,
  buildTransferPrompt,
  canBeginTransfer,
  endPractice,
  normaliseAnswer,
  normaliseJudgement,
  normaliseSituation,
  parseAttempts,
  practiceTargets,
  practiceView,
  type PracticeAttempt,
  type PracticeState
} from "./writing-practice";

const annotation = (overrides: Partial<WritingAnnotation> = {}): WritingAnnotation => ({
  severity: "critical",
  dimension: "grammar",
  quoted_text: "I have been here since three years.",
  diagnosis: "Use 'for' with a length of time.",
  guiding_question: "Which word goes with a period of time?",
  ...overrides
});

const feedback = (annotations: WritingAnnotation[]): WritingFeedback => ({
  annotations,
  round_summary: { critical_count: 0, improvement_count: 0, strengths_count: 0, overall_comment: "", band_estimate: "" },
  delta: null
});

const attempt = (step: PracticeAttempt["step"], acceptable: boolean): PracticeAttempt => ({
  step, acceptable, answer: `${step} answer`, reason: "why", reference: `${step} reference`, model: "m", at: "t"
});

const fresh: PracticeState = { status: "fix", transferPrompt: null, attempts: [] };

describe("practice targets", () => {
  const text = "I have been here since three years. My city is big.";

  it("offers problems whose quote is in the submitted text, and never strengths", () => {
    const targets = practiceTargets(feedback([
      annotation(),
      annotation({ severity: "improvement", quoted_text: "My city is big." }),
      annotation({ severity: "strength", quoted_text: "My city is big." }),
      annotation({ quoted_text: "a sentence the learner never wrote" }),
      annotation({ quoted_text: "   " })
    ]), text);
    expect(targets).toEqual([0, 1]);
  });

  it("offers nothing without feedback", () => {
    expect(practiceTargets(null, text)).toEqual([]);
  });
});

describe("practice state machine", () => {
  it("takes up to two answers on step 1, then waits for step 2's situation", () => {
    const once = applyAttempt(fresh, attempt("fix", false));
    expect(awaitingStep(once)).toBe("fix");
    const twice = applyAttempt(once, attempt("fix", false));
    expect(awaitingStep(twice)).toBeNull();
    expect(twice.status).toBe("fix");
    expect(canBeginTransfer(twice)).toBe(true);
    expect(() => applyAttempt(twice, attempt("fix", true))).toThrow(/not waiting/);
  });

  it("ends step 1 at the first right answer", () => {
    const right = applyAttempt(fresh, attempt("fix", true));
    expect(awaitingStep(right)).toBeNull();
    expect(canBeginTransfer(right)).toBe(true);
  });

  it("refuses step 2 before step 1 is over, and refuses a second situation", () => {
    expect(() => beginTransfer(fresh, "situation")).toThrow(/not over/);
    const started = beginTransfer(applyAttempt(fresh, attempt("fix", true)), "situation");
    expect(started.status).toBe("transfer");
    expect(canBeginTransfer(started)).toBe(false);
  });

  it("finishes the item when step 2 is over", () => {
    const started = beginTransfer(applyAttempt(fresh, attempt("fix", true)), "situation");
    expect(() => applyAttempt(started, attempt("fix", true))).toThrow();
    const done = applyAttempt(started, attempt("transfer", true));
    expect(done.status).toBe("finished");
    expect(awaitingStep(done)).toBeNull();
  });

  it("lets the learner skip or dispute an open item, and only once", () => {
    expect(endPractice(fresh, "skipped").status).toBe("skipped");
    const disputed = endPractice(applyAttempt(fresh, attempt("fix", false)), "disputed");
    expect(disputed.status).toBe("disputed");
    expect(() => endPractice(disputed, "skipped")).toThrow(/already ended/);
    expect(() => applyAttempt(disputed, attempt("fix", true))).toThrow();
  });
});

describe("what the learner may see", () => {
  const view = (state: PracticeState) => practiceView({ id: "p1", annotationIndex: 0, annotation: annotation(), state });

  it("withholds a step's reference until that step is over", () => {
    const once = applyAttempt(fresh, attempt("fix", false));
    expect(view(once).references).toEqual({});
    expect(JSON.stringify(view(once))).not.toContain("fix reference");
    expect(view(applyAttempt(once, attempt("fix", false))).references).toEqual({ fix: "fix reference" });
  });

  it("shows the reference of an attempted step once the item ends", () => {
    const skipped = endPractice(applyAttempt(fresh, attempt("fix", false)), "skipped");
    expect(view(skipped).references).toEqual({ fix: "fix reference" });
    expect(view(endPractice(fresh, "skipped")).references).toEqual({});
  });

  it("drops the model name and timestamps, and the annotation's guiding question", () => {
    const shown = view(applyAttempt(fresh, attempt("fix", true)));
    expect(shown.attempts[0]).toEqual({ step: "fix", answer: "fix answer", acceptable: true, reason: "why" });
    expect(shown.annotation).not.toHaveProperty("guiding_question");
    expect(shown.needsTransferPrompt).toBe(true);
  });
});

describe("answers and stored attempts", () => {
  it("trims answers and refuses empty or overlong ones", () => {
    expect(normaliseAnswer("  I have lived here for three years.  ")).toBe("I have lived here for three years.");
    expect(() => normaliseAnswer("   ")).toThrow(/empty/);
    expect(() => normaliseAnswer("x".repeat(601))).toThrow(/too long/);
  });

  it("ignores malformed stored attempts instead of failing the page", () => {
    expect(parseAttempts("not json")).toEqual([]);
    expect(parseAttempts('[{"step":"fix","answer":"a","acceptable":true},{"step":"x"}]')).toHaveLength(1);
  });
});

describe("model output normalisers", () => {
  it("accepts a judgement and trims long text", () => {
    const judged = normaliseJudgement({ acceptable: "false", reason: ` ${"r".repeat(500)} `, reference: "I have lived here for three years." });
    expect(judged.acceptable).toBe(false);
    expect(judged.reason.length).toBeLessThanOrEqual(400);
    expect(judged.reference).toBe("I have lived here for three years.");
  });

  it("rejects a judgement without a verdict, reason or reference", () => {
    expect(() => normaliseJudgement({ reason: "x", reference: "y" })).toThrow(/acceptable/);
    expect(() => normaliseJudgement({ acceptable: true, reference: "y" })).toThrow(/reason/);
    expect(() => normaliseJudgement({ acceptable: true, reason: "x" })).toThrow(/reference/);
    expect(() => normaliseJudgement([])).toThrow(/object/);
  });

  it("rejects a situation that repeats the learner's own sentence", () => {
    const quote = "I have been here since three years.";
    expect(normaliseSituation({ situation: "用一句英文说：她在这家公司工作六个月了。" }, quote)).toContain("六个月");
    expect(() => normaliseSituation({ situation: `Rewrite: ${quote}` }, quote)).toThrow(/reuses/);
    expect(() => normaliseSituation({}, quote)).toThrow(/situation/);
  });
});

describe("prompts", () => {
  it("judges step 1 against the annotation, in the feedback language, with the answer last", () => {
    const prompt = buildJudgementPrompt({ annotation: annotation(), step: "fix", transferPrompt: null, answer: "I have been here for three years.", language: "zh" });
    expect(prompt).toContain('Original text from the learner\'s essay: "I have been here since three years."');
    expect(prompt).toContain("Use 'for' with a length of time.");
    expect(prompt).toContain("Rewrite the original text");
    expect(prompt).toContain("Accept any correct wording");
    expect(prompt).toContain("in Simplified Chinese");
    expect(prompt).toContain("Never put a corrected version in the reason");
    expect(prompt.trimEnd().endsWith("I have been here for three years.")).toBe(true);
  });

  it("judges step 2 against the generated situation", () => {
    const prompt = buildJudgementPrompt({ annotation: annotation(), step: "transfer", transferPrompt: "Say how long she has worked there.", answer: "She has worked there for six months.", language: "en" });
    expect(prompt).toContain("Say how long she has worked there.");
    expect(prompt).toContain("reuses the original sentence");
    expect(prompt).toContain("in English");
    expect(prompt).not.toContain("Rewrite the original text");
  });

  it("asks for a new situation on a different topic, without the answer", () => {
    const prompt = buildTransferPrompt({ annotation: annotation(), language: "zh" });
    expect(prompt).toContain("different topic");
    expect(prompt).toContain("never give the English answer");
    expect(prompt).toContain("in Simplified Chinese");
    expect(prompt).toContain('"situation"');
  });
});
