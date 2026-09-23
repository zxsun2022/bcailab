import { describe, expect, it } from "vitest";
import { resolveModelForTask, TASK_MODELS } from "./llm.server";

describe("model routing (owner decision 2026-09-23)", () => {
  it("pins every task to an exact version, never a floating alias", () => {
    for (const model of Object.values(TASK_MODELS)) {
      expect(model).toMatch(/^gemini-\d+(\.\d+)*-flash(-lite)?$/);
      expect(model).not.toMatch(/latest/);
    }
  });

  it("uses the newest Flash for the two graders and Flash-Lite for everything else", () => {
    expect(resolveModelForTask("reading_eval")).toBe("gemini-3.8-flash");
    expect(resolveModelForTask("writing_feedback")).toBe("gemini-3.8-flash");
    const others = Object.entries(TASK_MODELS).filter(
      ([task]) => task !== "reading_eval" && task !== "writing_feedback"
    );
    for (const [, model] of others) expect(model).toBe("gemini-3.5-flash-lite");
  });
});
