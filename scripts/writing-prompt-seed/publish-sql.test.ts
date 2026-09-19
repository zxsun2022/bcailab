import { describe, expect, it } from "vitest";
import prompts from "./prompts.source.json";
import { deriveWritingPrompt } from "./derive";
import {
  buildPublishedPromptStatements,
  buildPublishedPromptValueRow,
  PUBLISH_STATEMENT_BUDGET_BYTES
} from "./publish-sql";
import type { WritingPromptSource } from "@bcailab/db";

const derivedPrompts = (prompts as WritingPromptSource[]).map(
  (source) => deriveWritingPrompt(source).prompt
);

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

  it("splits the bank so no statement is refused for length", () => {
    const statements = buildPublishedPromptStatements(derivedPrompts, '{"schemaVersion":1}');
    // The second batch as one statement measured 133 KB; D1 answered SQLITE_TOOBIG.
    expect(statements.length).toBeGreaterThan(1);
    for (const statement of statements) {
      expect(statement.length).toBeLessThanOrEqual(PUBLISH_STATEMENT_BUDGET_BYTES);
      expect(statement).toContain("ON CONFLICT(id) DO UPDATE SET");
    }
  });

  it("covers every prompt exactly once, in order", () => {
    const statements = buildPublishedPromptStatements(derivedPrompts, '{"schemaVersion":1}');
    for (const prompt of derivedPrompts) {
      expect(statements.filter((sql) => sql.includes(`'${prompt.id}'`))).toHaveLength(1);
    }
    const joined = statements.join("\n");
    expect(joined.indexOf(`'${derivedPrompts[0]!.id}'`)).toBeLessThan(
      joined.indexOf(`'${derivedPrompts[derivedPrompts.length - 1]!.id}'`)
    );
  });

  it("stays one statement while the whole batch fits the budget", () => {
    expect(
      buildPublishedPromptStatements(derivedPrompts, '{"schemaVersion":1}', 10_000_000)
    ).toHaveLength(1);
    expect(buildPublishedPromptStatements([], '{"schemaVersion":1}')).toEqual([]);
  });
});
