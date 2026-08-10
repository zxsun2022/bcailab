import { describe, expect, it } from "vitest";
import prompts from "./prompts.source.json";
import { deriveWritingPrompt } from "./derive";
import { buildPublishedPromptValueRow } from "./publish-sql";
import type { WritingPromptSource } from "@bcailab/db";

describe("Writing prompt publish SQL", () => {
  it("quotes text explicitly while keeping numeric targets numeric", () => {
    const { prompt } = deriveWritingPrompt(prompts[0]! as WritingPromptSource);
    const row = buildPublishedPromptValueRow(
      { ...prompt, title: "Teacher's invitation" },
      '{"schemaVersion":1}'
    );
    expect(row).toContain("'Teacher''s invitation'");
    expect(row).toContain(`, ${prompt.targetWords}, ${prompt.targetMinutes},`);
    expect(row).not.toContain(`'${prompt.targetWords}'`);
    expect(row).not.toContain(`'${prompt.targetMinutes}'`);
  });
});
