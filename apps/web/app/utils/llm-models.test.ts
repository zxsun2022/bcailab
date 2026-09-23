import { describe, expect, it } from "vitest";
import { resolveModelForTask, TASK_MODELS } from "./llm.server";

describe("model routing (owner decision 2026-09-23)", () => {
  it("pins every task to an exact version, never a floating alias", () => {
    for (const model of Object.values(TASK_MODELS)) {
      expect(model).toMatch(/^gemini-\d+(\.\d+)*-flash(-lite)?$/);
      expect(model).not.toMatch(/latest/);
    }
  });

  it("uses the newest Flash for the graders and material generation, Flash-Lite elsewhere", () => {
    const flash = ["reading_eval", "writing_feedback", "dictation_generate"];
    for (const task of flash) expect(TASK_MODELS[task as keyof typeof TASK_MODELS]).toBe("gemini-3.8-flash");
    expect(resolveModelForTask("reading_eval")).toBe("gemini-3.8-flash");
    const others = Object.entries(TASK_MODELS).filter(([task]) => !flash.includes(task));
    for (const [, model] of others) expect(model).toBe("gemini-3.5-flash-lite");
  });

  it("keeps the offline material generator on the same model as its routing entry", async () => {
    const { DICTATION_GENERATE_MODEL } = await import("../../../../scripts/material-seed/generate");
    expect(DICTATION_GENERATE_MODEL).toBe(TASK_MODELS.dictation_generate);
  });
});
