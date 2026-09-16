import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { WritingAssignmentSnapshot } from "@bcailab/db";
import { buildWritingEvaluationPrompt } from "./writing-eval.server";
import { getWritingAgentOrDefault } from "./writing-agents";

const assignment: WritingAssignmentSnapshot = {
  schemaVersion: 1,
  promptId: "wp_ielts_t1_test",
  promptSlug: "ielts-task1-test",
  contentHash: "a".repeat(64),
  family: "ielts",
  taskType: "academic_task_1",
  promptKind: "line_graph",
  cefrBand: null,
  title: "Test chart",
  promptText: "Summarize the chart.",
  coachId: "ielts_task1",
  topic: "Transport",
  targetWords: 150,
  targetMinutes: 20,
  sourceLabel: "bcailab original",
  taskMaterial: {
    kind: "line_graph",
    title: "Bus use",
    unit: "percent",
    categories: ["2020", "2025"],
    series: [{ name: "Bus", values: [20, 40] }],
    keyFeatures: ["Bus use doubled.", "The final value was highest."],
    comparisons: ["2025 was 20 points above 2020."]
  },
  asset: {
    path: "/writing/task1/test.svg",
    digest: "b".repeat(64),
    altText: "A line graph showing bus use rising.",
    accessibleDescription: "Bus use rose from 20 percent in 2020 to 40 percent in 2025."
  }
};

describe("Task 1 evaluation prompt", () => {
  it("carries canonical figures and factual-accuracy rules into every evaluation", () => {
    const prompt = buildWritingEvaluationPrompt({
      agent: getWritingAgentOrDefault("ielts_task1"),
      userText: "Bus use fell from 40 percent to 20 percent.",
      wordCount: 150,
      feedbackLanguage: "en",
      previousRound: null,
      historyScores: [],
      assignment
    });
    expect(prompt).toContain("Canonical Task 1 facts");
    expect(prompt).toContain('"values": [\n        20,\n        40');
    expect(prompt).toContain("incorrect number, reversed trend");
    expect(prompt).toContain("source of truth");
    expect(prompt).toContain("coach estimate, not an official exam result");
  });
});

const contextPromptInput = {
  agent: getWritingAgentOrDefault("general"),
  userText: "Cities should invest in public transport because it benefits everyone.",
  wordCount: 11,
  feedbackLanguage: "en" as const,
  previousRound: null,
  historyScores: []
};

describe("Writing learner context", () => {
  it("keeps anonymous trial prompts byte-identical to the pre-context implementation", () => {
    // SHA-256 fixtures generated from e61cf74, before adding learnerContext.
    const fixtures = [
      ["general", "en", "c5cc5fa6d5dcf9d9c8b399f0309abe42aece6d1c6f40a11787e8b82566f90f54"],
      ["general", "zh", "2db899fded4631f7b373bc929f9b47ee579160a2b9f3ff63d17d8f5874139497"],
      ["ielts_task2", "en", "9869267e7f7acde4f5c53e2606a990f6993d82447cc78a91a693bf5502451135"],
      ["ielts_task2", "zh", "d8a0a957edf7c6f85324540be1e30eed0c6fffca4fa48bc1a9b7b7191a564378"]
    ] as const;
    for (const [agentType, feedbackLanguage, digest] of fixtures) {
      for (const learnerContext of [undefined, ""]) {
        const prompt = buildWritingEvaluationPrompt({ ...contextPromptInput,
          agent: getWritingAgentOrDefault(agentType), feedbackLanguage, learnerContext });
        expect(createHash("sha256").update(prompt).digest("hex")).toBe(digest);
      }
    }
  });

  it("places one brief after the rubric, before the assignment and current text", () => {
    const learnerContext = "## Learner context\nLevel: not established";
    const prompt = buildWritingEvaluationPrompt({ ...contextPromptInput, learnerContext, assignment,
      agent: getWritingAgentOrDefault("ielts_task1") });
    expect(prompt.split(learnerContext)).toHaveLength(2);
    expect(prompt.indexOf(learnerContext)).toBeGreaterThan(prompt.indexOf("## JSON schema"));
    expect(prompt.indexOf(learnerContext)).toBeLessThan(prompt.indexOf("## Assignment"));
    expect(prompt).toContain("## Canonical Task 1 facts");
    expect(prompt.endsWith(contextPromptInput.userText)).toBe(true);
  });

  it("retains same-session feedback and score history for the round delta", () => {
    const prompt = buildWritingEvaluationPrompt({ ...contextPromptInput,
      learnerContext: "## Learner context\nLevel: B2 (declared)",
      historyScores: [{ round: 1, assessment: "B1" }],
      previousRound: { round_number: 1, user_text: "Earlier draft", word_count: 2,
        feedback: { annotations: [], round_summary: { critical_count: 0, improvement_count: 1,
          strengths_count: 0, overall_comment: "SAME_SESSION_FEEDBACK", band_estimate: "B1" }, delta: null } }
    });
    expect(prompt).toContain("## Score history (oldest to newest)");
    expect(prompt).toContain("## Previous round feedback (Round 1)");
    expect(prompt).toContain("SAME_SESSION_FEEDBACK");
    expect(prompt).toContain("Compute delta by comparing the current text against the above feedback.");
  });
});
