import { describe, expect, it } from "vitest";
import {
  buildHeuristicEvaluation,
  buildPrompt,
  normalizeEvalOutput
} from "~/utils/esl-reading-eval.server";

const scores = {
  overall: 80,
  pronunciation: 79,
  stress_rhythm: 78,
  fluency: 81,
  clarity: 80
};

describe("ESL reading next_drills compatibility", () => {
  it("continues to normalize drills stored in historical model output", () => {
    const output = normalizeEvalOutput(
      {
        scores,
        next_drills: [
          {
            drill_type: "repeat_sentence",
            target_text: "A historical sentence.",
            repeat: 3,
            prompt_zh: "Repeat this sentence three times."
          }
        ]
      },
      "en"
    );

    expect(output?.next_drills).toEqual([
      {
        drill_type: "repeat_sentence",
        target_text: "A historical sentence.",
        repeat: 3,
        prompt_zh: "Repeat this sentence three times."
      }
    ]);
  });

  it("does not generate drills in new heuristic feedback", () => {
    const output = buildHeuristicEvaluation({
      passageText: "This is a short passage for a new attempt.",
      mode: "reading",
      outputLanguage: "en",
      audioBytes: 32_000,
      durationMs: 8_000
    });

    expect(output.next_drills).toEqual([]);
  });

  it("does not request next_drills from the model", () => {
    const prompt = buildPrompt({
      passageText: "This is a short passage.",
      mode: "reading",
      outputLanguage: "en",
      durationSeconds: 8,
      history: [],
      learnerProfile: null
    });

    expect(prompt).not.toContain("next_drills");
  });
});
