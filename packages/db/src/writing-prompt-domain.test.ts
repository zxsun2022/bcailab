import { describe, expect, it } from "vitest";
import {
  buildWritingAssignmentSnapshot,
  validateWritingPrompt,
  validateWritingPromptBatch,
  type GeneratedWritingPrompt,
  type WritingPromptSource
} from "./writing-prompt-domain";

const base: WritingPromptSource = {
  schemaVersion: 1,
  id: "wp_general_a2_email",
  slug: "general-a2-email",
  family: "general",
  taskType: "guided",
  promptKind: "email",
  cefrBand: "A2",
  title: "Invite a classmate",
  promptText: "Write an email inviting a classmate to a weekend study session. Include the time, place, and what to bring.",
  coachId: "general",
  topic: "Everyday communication",
  targetWords: 80,
  targetMinutes: 15,
  sourceLabel: "bcailab original"
};

describe("validateWritingPrompt", () => {
  it("accepts a well-formed general prompt", () => {
    expect(validateWritingPrompt(base)).toEqual([]);
  });

  it("rejects cross-family coach and level drift", () => {
    const issues = validateWritingPrompt({
      ...base,
      family: "ielts",
      taskType: "academic_task_2",
      promptKind: "opinion_essay",
      coachId: "general"
    });
    expect(issues.map((issue) => issue.message)).toContain(
      "must be null for IELTS prompts"
    );
    expect(issues.map((issue) => issue.message)).toContain(
      "IELTS Task 2 must use its coach and a 250-word target"
    );
  });

  it("rejects Task 1 series that disagree with their categories", () => {
    const issues = validateWritingPrompt({
      ...base,
      id: "wp_ielts_task1_line",
      slug: "ielts-task1-line",
      family: "ielts",
      taskType: "academic_task_1",
      promptKind: "line_graph",
      cefrBand: null,
      coachId: "ielts_task1",
      targetWords: 150,
      targetMinutes: 20,
      assetAltText: "A line graph comparing two transport modes across three years.",
      material: {
        kind: "line_graph",
        title: "Transport use",
        unit: "percent",
        categories: ["2020", "2021", "2022"],
        series: [{ name: "Bus", values: [20, 30] }],
        keyFeatures: ["Bus use rose.", "The final year was highest."],
        comparisons: ["Bus use was higher in 2022 than 2020."]
      }
    });
    expect(issues).toContainEqual({
      path: "prompt.material.series[0].values",
      message: "must contain one finite number per category"
    });
  });

  it("rejects answer leakage", () => {
    expect(
      validateWritingPrompt({ ...base, promptText: `${base.promptText} Model answer: copy this.` })
    ).toContainEqual({
      path: "prompt.promptText",
      message: "appears to leak an answer or explanation"
    });
  });
});

describe("validateWritingPromptBatch", () => {
  it("reports duplicate identity without imposing one editorial batch size", () => {
    const issues = validateWritingPromptBatch([base, base]);
    expect(issues.some((issue) => issue.message.includes("duplicates"))).toBe(true);
    expect(issues.some((issue) => issue.message.includes("exactly 48"))).toBe(false);
    expect(issues.some((issue) => issue.message.includes("12 IELTS Task 1"))).toBe(false);
  });
});

describe("buildWritingAssignmentSnapshot", () => {
  it("copies canonical material and asset identity into an immutable projection", () => {
    const generated: GeneratedWritingPrompt = {
      ...base,
      taskMaterialJson: null,
      assetPath: null,
      assetDigest: null,
      accessibleDescription: null,
      contentHash: "a".repeat(64)
    };
    const snapshot = buildWritingAssignmentSnapshot(generated);
    expect(snapshot).toMatchObject({
      schemaVersion: 1,
      promptId: base.id,
      contentHash: "a".repeat(64),
      taskMaterial: null,
      asset: null
    });
  });
});
