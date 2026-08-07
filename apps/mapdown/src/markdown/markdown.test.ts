import { beforeEach, describe, expect, it } from "vitest";
import kepanSource from "../fixtures/kepan.md?raw";
import { applyCommand } from "../model/commands";
import { checkInvariants } from "../model/invariants";
import {
  createDocument,
  getNode,
  resetIdCounterForTests,
  walk,
  type MindMapDocument
} from "../model/types";
import { escapeLabel, exportFilename, sanitizeFilename, unescapeLabel } from "./escape";
import { IMPORT_LIMITS, importMarkdown } from "./parse";
import { exportMarkdown } from "./serialize";

beforeEach(() => resetIdCounterForTests());

/** Text of every node in document order — the thing §15 says must survive a round trip. */
function shape(doc: MindMapDocument): { text: string; depth: number }[] {
  return walk(doc).map((id) => {
    let depth = 0;
    let node = getNode(doc, id);
    while (node.parentId !== null) {
      depth++;
      node = getNode(doc, node.parentId);
    }
    return { text: getNode(doc, id).text, depth };
  });
}

function roundTrip(doc: MindMapDocument): MindMapDocument {
  const result = importMarkdown(exportMarkdown(doc));
  if (!result.ok) throw new Error(`round trip failed: ${result.error}`);
  return result.doc;
}

function build(labels: [string, number][]): MindMapDocument {
  let doc = createDocument(labels[0]![0]);
  const atDepth: string[] = [doc.rootId];
  for (const [text, depth] of labels.slice(1)) {
    const parent = atDepth[depth - 1]!;
    const result = applyCommand(doc, { type: "CreateChild", parentId: parent, text });
    doc = result.doc;
    atDepth[depth] = result.selection!;
    atDepth.length = depth + 1;
  }
  return doc;
}

describe("canonical export (§2)", () => {
  it("emits heading, one blank line, two-space indentation and a single trailing newline", () => {
    const doc = build([
      ["Product plan", 0],
      ["Problem", 1],
      ["User pain", 2],
      ["Solution", 1]
    ]);
    expect(exportMarkdown(doc)).toBe(
      "# Product plan\n\n- Problem\n  - User pain\n- Solution\n"
    );
  });

  it("omits front matter when every setting is default, and emits it when one differs", () => {
    const doc = build([["Root", 0]]);
    expect(exportMarkdown(doc)).toBe("# Root\n");

    const themed: MindMapDocument = {
      ...doc,
      theme: { shapeId: "business", paletteId: "corporate", branchColorMode: "single" }
    };
    expect(exportMarkdown(themed)).toBe(
      "---\nmindmap:\n  version: 1\n  shape: business\n  palette: corporate\n---\n\n# Root\n"
    );
  });

  it("writes the two theme axes as separate front matter keys (D-24), never the legacy theme key", () => {
    const doc = build([["Root", 0]]);
    const axes: MindMapDocument = {
      ...doc,
      theme: { shapeId: "dark", paletteId: "vivid", branchColorMode: "by-first-level-branch" }
    };
    expect(exportMarkdown(axes)).toBe(
      "---\nmindmap:\n  version: 1\n  shape: dark\n  palette: vivid\n  branchColors: by-first-level-branch\n---\n\n# Root\n"
    );
    // A non-default shape writes both axes even when the palette is that shape's own default,
    // so the file stays self-contained.
    const paired: MindMapDocument = {
      ...doc,
      theme: { shapeId: "business", paletteId: "corporate", branchColorMode: "single" }
    };
    expect(exportMarkdown(paired)).toBe(
      "---\nmindmap:\n  version: 1\n  shape: business\n  palette: corporate\n---\n\n# Root\n"
    );
  });

  it("exports collapsed descendants — collapse is view state, not content (§14.1)", () => {
    const doc = build([
      ["Root", 0],
      ["Branch", 1],
      ["Hidden child", 2]
    ]);
    const branchId = getNode(doc, doc.rootId).childIds[0]!;
    const collapsed = applyCommand(doc, { type: "SetCollapsed", nodeId: branchId, collapsed: true }).doc;

    expect(getNode(collapsed, branchId).collapsed).toBe(true);
    expect(exportMarkdown(collapsed)).toContain("Hidden child");
    expect(exportMarkdown(collapsed)).toBe(exportMarkdown(doc));
  });

  it("writes an empty root as a bare # and an empty node as a bare - (§14.3, D-09)", () => {
    let doc = createDocument("");
    doc = applyCommand(doc, { type: "CreateChild", parentId: doc.rootId, text: "" }).doc;
    const output = exportMarkdown(doc);
    expect(output).toBe("#\n\n-\n");
    expect(output).not.toMatch(/[ \t]\n/); // no trailing whitespace on any line
  });
});

/**
 * These assert the *bytes produced*, not a round trip.
 *
 * A round trip through this repository's own parser proves the serialiser and parser agree with
 * each other, which is not the same as either being right: this parser does not interpret inline
 * Markdown, so unescaped `*x*` survives it untouched and the round-trip tests below pass even
 * with escaping switched off entirely (verified by mutation). §10.4 requires a real
 * CommonMark-compatible parser in Phase 2, and that one *will* strip the emphasis.
 *
 * So the escaping contract has to be pinned to concrete output, independent of any reader.
 */
describe("escaping produces the expected bytes (§6)", () => {
  it.each([
    ["*emphasis*", "\\*emphasis\\*"],
    ["_underscore_", "\\_underscore\\_"],
    ["`code`", "\\`code\\`"],
    ["[label](url)", "\\[label\\](url)"],
    ["a\\b", "a\\\\b"],
    ["<html>", "\\<html\\>"],
    ["- leading marker", "\\- leading marker"],
    ["+ leading marker", "\\+ leading marker"],
    ["# leading hash", "\\# leading hash"],
    ["1. ordered", "1\\. ordered"],
    ["2) ordered", "2\\) ordered"],
    ["暇满难得", "暇满难得"],
    ["plain text", "plain text"]
  ])("escapes %j to %j", (input, expected) => {
    expect(escapeLabel(input)).toBe(expected);
  });

  it("leaves an interior hash alone — only a leading one changes the block type", () => {
    expect(escapeLabel("issue #42")).toBe("issue #42");
  });

  it("does not escape a hyphen that is not a list marker", () => {
    expect(escapeLabel("well-known")).toBe("well-known");
  });
});

describe("escaping is reversible (§6.3)", () => {
  const hazards = [
    "- not a list item",
    "# not a heading",
    "1. not ordered",
    "*not emphasis*",
    "_not emphasis_",
    "`not code`",
    "[label](https://example.com)",
    "a\\b backslash",
    "<not html>",
    "混合 *中文* 与 [链接](url)",
    "100% safe & sound"
  ];

  it.each(hazards)("round-trips %j through escape/unescape", (text) => {
    expect(unescapeLabel(escapeLabel(text))).toBe(text);
  });

  it.each(hazards)("round-trips %j through a full document export/import", (text) => {
    const doc = build([
      ["Root", 0],
      [text, 1]
    ]);
    expect(shape(roundTrip(doc))).toEqual(shape(doc));
  });
});

describe("round-trip guarantee (§15)", () => {
  it("preserves text, hierarchy and sibling order", () => {
    const doc = build([
      ["Interview preparation", 0],
      ["Product sense", 1],
      ["Market", 2],
      ["Users", 2],
      ["Technical knowledge", 1],
      ["Behavioral stories", 1]
    ]);
    expect(shape(roundTrip(doc))).toEqual(shape(doc));
  });

  it("preserves supported document settings", () => {
    const base = build([["Root", 0]]);
    const doc: MindMapDocument = {
      ...base,
      layout: { mode: "two-sided" },
      theme: { shapeId: "dark", paletteId: "night-glow", branchColorMode: "by-first-level-branch" }
    };
    const back = roundTrip(doc);
    expect(back.layout.mode).toBe("two-sided");
    expect(back.theme).toEqual(doc.theme);
  });

  it("is idempotent — exporting the reimported document gives byte-identical output", () => {
    const doc = build([
      ["根节点", 0],
      ["暇满难得", 1],
      ["思维本性闲暇", 2],
      ["- 看起来像列表", 2],
      ["寿命无常", 1]
    ]);
    const once = exportMarkdown(doc);
    const twice = exportMarkdown(roundTrip(doc));
    expect(twice).toBe(once);
  });

  it("survives the seven-level 科判 fixture unchanged", () => {
    const first = importMarkdown(kepanSource);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    expect(checkInvariants(first.doc)).toEqual([]);
    expect(walk(first.doc)).toHaveLength(72);
    expect(shape(roundTrip(first.doc))).toEqual(shape(first.doc));
    expect(exportMarkdown(roundTrip(first.doc))).toBe(exportMarkdown(first.doc));
  });
});

describe("import of hand-written variations (§4, §17)", () => {
  it("accepts four-space indentation and normalizes it to two", () => {
    const result = importMarkdown("# Root\n\n- A\n    - A1\n");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(shape(result.doc)).toEqual([
      { text: "Root", depth: 0 },
      { text: "A", depth: 1 },
      { text: "A1", depth: 2 }
    ]);
    expect(exportMarkdown(result.doc)).toBe("# Root\n\n- A\n  - A1\n");
  });

  it("does not report a continuation warning for an ordinary nested list", () => {
    const result = importMarkdown("# Root\n\n- Parent\n  - Child\n");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings.map((warning) => warning.category)).not.toContain(
      "continuation-merged"
    );
  });

  it("accepts * and + markers", () => {
    const result = importMarkdown("# Root\n\n* A\n+ B\n");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(shape(result.doc).map((n) => n.text)).toEqual(["Root", "A", "B"]);
  });

  it("converts ordered lists to ordinary nodes with a warning (§4.1)", () => {
    const result = importMarkdown("# Root\n\n1. First\n2. Second\n");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(shape(result.doc).map((n) => n.text)).toEqual(["Root", "First", "Second"]);
    expect(result.warnings.map((w) => w.category)).toContain("ordered-list-converted");
  });

  it("keeps an empty root and empty nodes empty rather than inventing placeholders", () => {
    const result = importMarkdown("#\n\n-\n");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(shape(result.doc)).toEqual([
      { text: "", depth: 0 },
      { text: "", depth: 1 }
    ]);
  });

  it("does not invent intermediate nodes for a depth jump (§4.3)", () => {
    // §4.3: "the parser SHOULD normalize B as a child of A if the Markdown parser already
    // resolves it that way. It MUST NOT invent unnamed intermediate nodes." Six spaces of indent
    // is not enough for CommonMark to open a new nested list here — it is lazy continuation of
    // A's paragraph — so the spec-correct resolution is a merged label, not an invented child.
    // This is D-14 in effect: the hand-written reader this replaced invented a nested "B" node
    // from indentation alone, which a real CommonMark parser does not do.
    const result = importMarkdown("# Root\n\n- A\n      - B\n");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(shape(result.doc)).toEqual([
      { text: "Root", depth: 0 },
      { text: "A - B", depth: 1 }
    ]);
  });

  it("handles CJK, emoji and combining characters", () => {
    const result = importMarkdown("# 暇满难得\n\n- emoji 😀 combining é ǎ\n");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(shape(result.doc).map((n) => n.text)).toEqual(["暇满难得", "emoji 😀 combining é ǎ"]);
  });

  it("strips a BOM and accepts CRLF line endings", () => {
    const result = importMarkdown("﻿# Root\r\n\r\n- A\r\n");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(shape(result.doc).map((n) => n.text)).toEqual(["Root", "A"]);
  });

  it("reports extra level-1 headings instead of silently creating a second root (§3.2)", () => {
    const result = importMarkdown("# First\n\n- A\n\n# Second\n");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.doc.nodes[result.doc.rootId]!.text).toBe("First");
    expect(result.warnings.map((w) => w.category)).toContain("additional-heading-ignored");
  });

  it("produces a valid tree for every accepted input", () => {
    for (const source of ["# R\n", "# R\n\n- A\n  - B\n", "#\n\n-\n", kepanSource]) {
      const result = importMarkdown(source);
      expect(result.ok).toBe(true);
      if (result.ok) expect(checkInvariants(result.doc)).toEqual([]);
    }
  });
});

describe("import failure leaves the caller free to keep the current document (§12)", () => {
  it("fails when there is no level-1 heading", () => {
    const result = importMarkdown("- just a list\n");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/heading/i);
  });

  it("fails on unclosed front matter", () => {
    const result = importMarkdown("---\nmindmap:\n  version: 1\n\n# Root\n");
    expect(result.ok).toBe(false);
  });

  it("refuses a future format version rather than guessing (§7.4)", () => {
    const result = importMarkdown("---\nmindmap:\n  version: 9\n---\n\n# Root\n");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/version 9/);
  });

  it("falls back to defaults for an invalid layout rather than failing (§7.3)", () => {
    const result = importMarkdown("---\nmindmap:\n  version: 1\n  layout: sideways\n---\n\n# Root\n");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.doc.layout.mode).toBe("right");
  });

  it("reports unknown front-matter keys without acting on them (§7.2)", () => {
    const result = importMarkdown("---\nmindmap:\n  version: 1\n  danger: yes\n---\n\n# Root\n");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.warnings.map((w) => w.category)).toContain("unsupported-front-matter-key");
    }
  });

  it("maps a legacy single theme key onto its shape + default palette (step 3 back-compat)", () => {
    const result = importMarkdown(
      "---\nmindmap:\n  version: 1\n  theme: soft-branches\n  branchColors: by-first-level-branch\n---\n\n# Root\n"
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.doc.theme).toEqual({
      shapeId: "soft-branches",
      paletteId: "soft-spectrum",
      branchColorMode: "by-first-level-branch"
    });
    expect(result.warnings.map((w) => w.category)).not.toContain("unsupported-theme-fallback");
  });

  it("reads the two axes from front matter, with explicit keys winning per axis", () => {
    const result = importMarkdown(
      "---\nmindmap:\n  version: 1\n  shape: dark\n  palette: vivid\n  branchColors: single\n---\n\n# Root\n"
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.doc.theme).toEqual({
      shapeId: "dark",
      paletteId: "vivid",
      branchColorMode: "single"
    });
  });

  it("falls back to defaults and warns for an unknown shape or palette (§7.3)", () => {
    const result = importMarkdown(
      "---\nmindmap:\n  version: 1\n  shape: bogus\n  palette: nope\n---\n\n# Root\n"
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.doc.theme).toEqual({
      shapeId: "minimal-light",
      paletteId: "slate",
      branchColorMode: "single"
    });
    const categories = result.warnings.map((w) => w.category);
    expect(categories.filter((c) => c === "unsupported-theme-fallback")).toHaveLength(2);
  });
});

describe("import resource limits (§13)", () => {
  it("accepts depth 100 and rejects depth 101", () => {
    const outline = (depth: number) =>
      `# Root\n\n${Array.from({ length: depth }, (_, index) =>
        `${"  ".repeat(index)}- Level ${index + 1}`
      ).join("\n")}\n`;

    expect(importMarkdown(outline(IMPORT_LIMITS.depth)).ok).toBe(true);
    const tooDeep = importMarkdown(outline(IMPORT_LIMITS.depth + 1));
    expect(tooDeep.ok).toBe(false);
    if (!tooDeep.ok) expect(tooDeep.error).toMatch(/maximum depth/i);
  });

  it("rejects oversized files, node counts, and labels", () => {
    const tooLarge = importMarkdown(`# Root\n${"x".repeat(IMPORT_LIMITS.bytes)}`);
    expect(tooLarge.ok).toBe(false);
    if (!tooLarge.ok) expect(tooLarge.error).toMatch(/5 MB/);

    const tooMany = importMarkdown(
      `# Root\n\n${Array.from({ length: IMPORT_LIMITS.nodes }, (_, index) => `- Node ${index}`).join("\n")}\n`
    );
    expect(tooMany.ok).toBe(false);
    if (!tooMany.ok) expect(tooMany.error).toMatch(/maximum.*nodes/i);

    const longLabel = importMarkdown(`# ${"字".repeat(IMPORT_LIMITS.labelCodePoints + 1)}\n`);
    expect(longLabel.ok).toBe(false);
    if (!longLabel.ok) expect(longLabel.error).toMatch(/root label/i);
  });
});

describe("export filename (storage-export.md §11.3)", () => {
  it("removes filesystem-forbidden characters and collapses whitespace", () => {
    expect(sanitizeFilename('my/map: "draft"  v2')).toBe("my map draft v2");
  });

  it("falls back for an empty title", () => {
    expect(sanitizeFilename("   ")).toBe("mind-map");
  });

  it("avoids Windows reserved device names", () => {
    expect(sanitizeFilename("CON")).toBe("mind-map");
    expect(sanitizeFilename("nul")).toBe("mind-map");
  });

  it("keeps CJK titles intact", () => {
    expect(sanitizeFilename("前行引导文 科判")).toBe("前行引导文 科判");
  });

  it("names downloads from the root label with a safe fallback", () => {
    expect(exportFilename('根/节点: "草稿"', "md")).toBe("根 节点 草稿.md");
    expect(exportFilename("   ", ".svg")).toBe("mind-map.svg");
  });
});
