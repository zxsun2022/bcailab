import { describe, expect, it } from "vitest";
import {
  FEATURED_WRITING_TRIAL_SLUG,
  classifyWritingTrialAssignment
} from "~/utils/writing-trial";

describe("Writing trial assignment boundary", () => {
  it("allows only freeform or the single reviewed featured assignment", () => {
    expect(classifyWritingTrialAssignment("")).toBe("freeform");
    expect(classifyWritingTrialAssignment(FEATURED_WRITING_TRIAL_SLUG)).toBe("featured");
    expect(classifyWritingTrialAssignment("ielts-task-1-hidden-prompt")).toBe("invalid");
  });
});
