import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync(new URL("../styles/base.css", import.meta.url), "utf8");

describe("editing field platform parity", () => {
  it("keeps native textarea scrollbars from consuming the measured node width", () => {
    const editingField = styles.match(/\.editing-field\s*\{(?<rules>[^}]*)\}/)?.groups?.rules;

    expect(editingField).toBeDefined();
    expect(editingField).toMatch(/overflow:\s*hidden\s*;/);
  });
});
