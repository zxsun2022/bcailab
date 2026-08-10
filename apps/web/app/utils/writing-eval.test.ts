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
