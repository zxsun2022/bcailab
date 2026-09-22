import { describe, expect, it } from "vitest";
import { createTranslator } from "~/i18n/translate";
import { WRITING_AGENTS } from "./writing-agents";
import {
  WRITING_DIMENSION_KEYS,
  writingAgentCopy,
  writingAssessmentLabel,
  writingDimensionLabel
} from "./writing-agent-copy";

describe("writing coach display copy", () => {
  it("has translated copy for every coach in the roster", () => {
    const zh = createTranslator("zh");
    for (const agent of Object.values(WRITING_AGENTS)) {
      const copy = writingAgentCopy(zh, agent);
      expect(copy.label).not.toBe(agent.label);
      expect(copy.description).not.toBe(agent.description);
      expect(copy.scaffold).not.toBe(agent.scaffold);
    }
  });

  it("keeps the roster's own English in the English interface", () => {
    const en = createTranslator("en");
    for (const agent of Object.values(WRITING_AGENTS)) {
      expect(writingAgentCopy(en, agent)).toEqual({
        label: agent.label,
        description: agent.description,
        scaffold: agent.scaffold
      });
    }
  });

  it("maps every dimension any coach grades on", () => {
    const dimensions = Object.values(WRITING_AGENTS).flatMap((agent) => agent.dimensions);
    for (const dimension of dimensions) {
      expect(WRITING_DIMENSION_KEYS[dimension], dimension).toBeDefined();
      expect(writingDimensionLabel(createTranslator("en"), dimension)).toBe(dimension);
    }
  });

  it("shows an unknown dimension as stored", () => {
    expect(writingDimensionLabel(createTranslator("zh"), "Something else")).toBe("Something else");
  });

  it("translates only the IELTS prefix of an assessment", () => {
    const zh = createTranslator("zh");
    expect(writingAssessmentLabel(zh, " 6.5 ", "Coach estimate · Band")).toBe("教练估分 · 6.5 分");
    expect(writingAssessmentLabel(zh, "Strong", null)).toBe("Strong");
    expect(writingAssessmentLabel(zh, "  ", "Coach estimate · Band")).toBe("");
    expect(writingAssessmentLabel(createTranslator("en"), "6.5", "Coach estimate · Band")).toBe(
      "Coach estimate · Band 6.5"
    );
  });
});
