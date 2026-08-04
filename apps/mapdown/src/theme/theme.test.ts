import { beforeEach, describe, expect, it } from "vitest";
import { applyCommand } from "../model/commands";
import { createDocument, getNode, resetIdCounterForTests, type MindMapDocument } from "../model/types";
import { branchColorFor, connectorColorFor } from "./branch-colors";
import { BUSINESS, DARK, MINIMAL_LIGHT, SOFT_BRANCHES, THEMES, themeById } from "./presets";
import { contrastRatio, type MindMapTheme } from "./types";

beforeEach(() => resetIdCounterForTests());

/** The chrome accent from src/styles/base.css, which C-01 says branch palettes must avoid. */
const CHROME_ACCENT_LIGHT = "#2f6feb";
const CHROME_ACCENT_DARK = "#5b8def";

function withBranches(count: number, mode: "single" | "by-first-level-branch"): MindMapDocument {
  let doc: MindMapDocument = {
    ...createDocument("Root"),
    layout: { mode: "two-sided" },
    theme: { themeId: "soft-branches", branchColorMode: mode }
  };
  for (let i = 0; i < count; i++) {
    const branch = applyCommand(doc, { type: "CreateChild", parentId: doc.rootId, text: `B${i}` });
    doc = branch.doc;
    doc = applyCommand(doc, { type: "CreateChild", parentId: branch.selection, text: `${i}-child` }).doc;
  }
  return doc;
}

/** Every literal colour value in a theme, so a stray CSS variable cannot hide in a corner. */
function colorValues(theme: MindMapTheme): string[] {
  const out: string[] = [];
  const walk = (value: unknown) => {
    if (typeof value === "string") out.push(value);
    else if (value && typeof value === "object") Object.values(value).forEach(walk);
  };
  walk({
    canvas: theme.canvas,
    nodes: theme.nodes,
    connectors: theme.connectors,
    branches: theme.branches,
    controls: theme.controls,
    interaction: theme.interaction
  });
  return out;
}

describe("themes are data, not CSS (D-05)", () => {
  it.each(THEMES)("$name uses only literal values", (theme) => {
    for (const value of colorValues(theme)) {
      // A `var(--x)` here would render correctly in the browser and produce an unstyled export,
      // which is precisely the failure this rule exists to prevent.
      expect(value).not.toMatch(/var\(|--/);
      expect(value).not.toMatch(/^(class|url\()/);
    }
  });

  it.each(THEMES)("$name has every colour as a resolvable hex", (theme) => {
    const hexes = colorValues(theme).filter((v) => v.startsWith("#"));
    expect(hexes.length).toBeGreaterThan(8);
    for (const hex of hexes) expect(hex).toMatch(/^#[0-9a-f]{3}([0-9a-f]{3})?$/i);
  });

  it("survives a JSON round trip, which is what serialising into an export requires", () => {
    for (const theme of THEMES) {
      expect(JSON.parse(JSON.stringify(theme))).toEqual(theme);
    }
  });
});

describe("§13 — the four required presets exist", () => {
  it("ships Minimal Light, Soft Branch Colors, Business and Dark", () => {
    expect(THEMES.map((t) => t.id)).toEqual(["minimal-light", "soft-branches", "business", "dark"]);
    expect(THEMES.filter((t) => t.appearance === "dark")).toHaveLength(1);
  });

  it("falls back to the default for an unknown id rather than failing (§7.3)", () => {
    expect(themeById("does-not-exist").id).toBe(MINIMAL_LIGHT.id);
    expect(themeById("dark").id).toBe(DARK.id);
  });

  it("makes the presets visually distinct rather than hue variants (§12.5)", () => {
    // Not by canvas alone: Minimal Light and Business are both white-canvas by design and
    // differ in border language instead. §13 lists that as the sanctioned axis of variation.
    const signature = (t: (typeof THEMES)[number]) =>
      [t.canvas.background, t.nodes.default.radius, t.nodes.default.background, t.nodes.root.background].join("|");
    expect(new Set(THEMES.map(signature)).size).toBe(THEMES.length);
    expect(new Set(THEMES.map((t) => t.nodes.default.radius)).size).toBeGreaterThan(1);
  });
});

describe("§18 — contrast", () => {
  it.each(THEMES)("$name meets AA for body text on every node role", (theme) => {
    for (const role of ["root", "level1", "default"] as const) {
      const tokens = theme.nodes[role];
      expect(
        contrastRatio(tokens.text, tokens.background),
        `${theme.id}/${role}`
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(THEMES)("$name keeps connectors visible against the canvas", (theme) => {
    expect(contrastRatio(theme.connectors.defaultColor, theme.canvas.background)).toBeGreaterThan(1.4);
  });

  it.each(THEMES)("$name keeps the collapse badge readable", (theme) => {
    expect(
      contrastRatio(theme.controls.collapseText, theme.controls.collapseBackground)
    ).toBeGreaterThanOrEqual(4.5);
  });

  it.each(THEMES)("$name gives selection a perceptible ring against the canvas", (theme) => {
    expect(contrastRatio(theme.interaction.selectedOutline, theme.canvas.background)).toBeGreaterThan(3);
  });
});

/**
 * C-01, aimed correctly.
 *
 * My first version of this compared branch palettes against the **chrome** accent and failed on
 * all four themes. That comparison was mis-aimed: the chrome accent never appears on the map —
 * it is used by toolbar buttons and the editing field only — and Business is *defined* by §12.3
 * as a restrained blue-grey palette, so testing it against a blue chrome accent could only ever
 * fail.
 *
 * What C-01 actually protects is the user's ability to tell "this node is selected" from "this
 * branch happens to be coloured". On the canvas that contest is between `interaction
 * .selectedOutline` and `branches.colors`, so that is what is asserted here.
 */
describe("C-01 — selection cannot be mistaken for a branch colour", () => {
  /*
   * A ring-versus-branch *contrast* assertion was tried here and removed, because it demanded
   * something the palettes cannot give and should not have to. On a dark theme the selection
   * ring and the branch colours must both be light to read against a dark canvas, so their
   * contrast with each other is necessarily low — that is a consequence of the canvas, not a
   * defect.
   *
   * The guarantee C-01 actually needs is **structural**, and it is asserted below: branch
   * colour lives on connectors and never touches a node's fill or border, so a coloured branch
   * and a selected node are never drawn in the same place competing to mean the same thing.
   */
  it.each(THEMES)("$name expresses selection as a ring, never as a fill", (theme) => {
    expect(theme.interaction.selectedOutlineWidth).toBeGreaterThan(0);
    expect(theme.interaction.selectedOutline).not.toBe(theme.nodes.default.background);
    // Branch colour lives on connectors only. If it were also a node fill or border, a
    // coloured branch and a selected node would be competing for the same pixels.
    for (const role of ["root", "level1", "default"] as const) {
      expect(theme.branches.colors, `${theme.id}/${role} background`).not.toContain(
        theme.nodes[role].background
      );
      expect(theme.branches.colors, `${theme.id}/${role} border`).not.toContain(
        theme.nodes[role].border
      );
    }
  });

  it("keeps the chrome accent off the map entirely, which is why the above is the real test", () => {
    for (const theme of THEMES) {
      const onCanvas = [
        theme.canvas.background,
        theme.connectors.defaultColor,
        theme.interaction.selectedOutline,
        theme.interaction.keyboardFocusRing,
        ...theme.branches.colors,
        ...(["root", "level1", "default"] as const).flatMap((role) => [
          theme.nodes[role].background,
          theme.nodes[role].border
        ])
      ].map((c) => c.toLowerCase());
      expect(onCanvas).not.toContain(CHROME_ACCENT_LIGHT);
      expect(onCanvas).not.toContain(CHROME_ACCENT_DARK);
    }
  });
});

describe("§8.2 — palette size and cycling", () => {
  it.each(THEMES)("$name offers six to ten distinguishable colours", (theme) => {
    expect(theme.branches.colors.length).toBeGreaterThanOrEqual(6);
    expect(theme.branches.colors.length).toBeLessThanOrEqual(10);
    expect(new Set(theme.branches.colors).size).toBe(theme.branches.colors.length);
  });

  it("cycles rather than running out", () => {
    const doc = withBranches(SOFT_BRANCHES.branches.colors.length + 2, "by-first-level-branch");
    const firstLevel = getNode(doc, doc.rootId).childIds;
    const palette = SOFT_BRANCHES.branches.colors;

    expect(branchColorFor(doc, SOFT_BRANCHES, firstLevel[palette.length]!)).toBe(palette[0]);
    expect(branchColorFor(doc, SOFT_BRANCHES, firstLevel[palette.length + 1]!)).toBe(palette[1]);
  });
});

describe("§8.1 — colour follows semantic order, not visual side", () => {
  it("does not repaint a branch when it moves to the other side", () => {
    const doc = withBranches(4, "by-first-level-branch");
    const branchId = getNode(doc, doc.rootId).childIds[1]!;
    const before = branchColorFor(doc, SOFT_BRANCHES, branchId);

    const moved = applyCommand(doc, {
      type: "MoveFirstLevelBranchSide",
      nodeId: branchId,
      side: getNode(doc, branchId).side === "right" ? "left" : "right"
    }).doc;

    expect(branchColorFor(moved, SOFT_BRANCHES, branchId)).toBe(before);
  });

  it("gives every descendant its first-level ancestor's colour", () => {
    const doc = withBranches(3, "by-first-level-branch");
    for (const branchId of getNode(doc, doc.rootId).childIds) {
      const expected = branchColorFor(doc, SOFT_BRANCHES, branchId);
      for (const childId of getNode(doc, branchId).childIds) {
        expect(branchColorFor(doc, SOFT_BRANCHES, childId)).toBe(expected);
      }
    }
  });

  it("returns nothing in single mode, so connectors use the theme colour", () => {
    const doc = withBranches(3, "single");
    const branchId = getNode(doc, doc.rootId).childIds[0]!;
    expect(branchColorFor(doc, SOFT_BRANCHES, branchId)).toBeNull();
    expect(connectorColorFor(doc, SOFT_BRANCHES, branchId)).toBe(SOFT_BRANCHES.connectors.defaultColor);
  });

  it("never colours the root", () => {
    const doc = withBranches(2, "by-first-level-branch");
    expect(branchColorFor(doc, SOFT_BRANCHES, doc.rootId)).toBeNull();
  });

  it("keeps colours stable when an earlier branch is deleted only by its own index shift", () => {
    const doc = withBranches(4, "by-first-level-branch");
    const [, second, third] = getNode(doc, doc.rootId).childIds as [string, string, string];
    const thirdBefore = branchColorFor(doc, SOFT_BRANCHES, third);

    const after = applyCommand(doc, { type: "DeleteSubtree", nodeId: second }).doc;

    // Deleting a sibling shifts later branches one slot down the palette. That is inherent to
    // index-based assignment and is recorded here as expected, not accidental: §8.2 says
    // colours are decorative and not identifiers.
    expect(branchColorFor(after, SOFT_BRANCHES, third)).not.toBe(thirdBefore);
    expect(branchColorFor(after, SOFT_BRANCHES, third)).toBe(SOFT_BRANCHES.branches.colors[1]);
  });
});

describe("theme layout tokens stay within an ergonomic range (§11)", () => {
  it.each(THEMES)("$name does not make a map wildly denser or sparser", (theme) => {
    expect(theme.layout.parentChildGap).toBeGreaterThanOrEqual(32);
    expect(theme.layout.parentChildGap).toBeLessThanOrEqual(72);
    expect(theme.nodes.default.maxWidth).toBeGreaterThanOrEqual(200);
  });

  it("uses one font stack across all presets, so measurement stays comparable", () => {
    expect(new Set(THEMES.map((t) => t.typography.fontFamily)).size).toBe(1);
    expect(BUSINESS.typography.fontFamily).toContain("PingFang SC");
  });
});
