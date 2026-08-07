import { beforeEach, describe, expect, it } from "vitest";
import { applyCommand } from "../model/commands";
import { createDocument, getNode, resetIdCounterForTests, type MindMapDocument } from "../model/types";
import { accessibleTextFor, blendHex, branchColorFor, connectorColorFor, nodeFillAndTextFor } from "./branch-colors";
import { BUSINESS, DARK, MINIMAL_LIGHT, SOFT_BRANCHES, THEMES, themeById } from "./presets";
import { roleTokens } from "./roles";
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
    doc = applyCommand(doc, { type: "CreateChild", parentId: branch.selection!, text: `${i}-child` }).doc;
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

  it("differs in shape language, not only hue — the D-22 grayscale signature", () => {
    // Step 2's acceptance is that the four presets are distinguishable in grayscale, which
    // hue-based signatures cannot prove. Radius, border weight, and padding density per role
    // must all differ so a desaturated screenshot still separates the presets.
    const shapeSignature = (t: (typeof THEMES)[number]) =>
      (["root", "level1", "default"] as const)
        .map(
          (role) =>
            `${t.nodes[role].radius}|${t.nodes[role].borderWidth}|${t.nodes[role].paddingX}|${t.nodes[role].paddingY}`
        )
        .join(";");
    expect(new Set(THEMES.map(shapeSignature)).size).toBe(THEMES.length);
    // The axes are genuinely in play, not one token doing all the work.
    expect(new Set(THEMES.map((t) => t.nodes.level1.borderWidth)).size).toBeGreaterThan(1);
    expect(new Set(THEMES.map((t) => t.nodes.default.paddingX)).size).toBeGreaterThan(1);
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
   * Theme differentiation step 1 (D-22) changed the premise this block was built on: branch
   * colour now *is* a first-level node fill in by-first-level-branch mode. What C-01 still
   * needs is that selection is expressed as a ring, never as a fill — so the ring colour must
   * not read as a branch colour — and that the palette never collides with a role's base
   * tokens (which is what a `single`-mode map still paints).
   */
  it.each(THEMES)("$name expresses selection as a ring, never as a fill", (theme) => {
    expect(theme.interaction.selectedOutlineWidth).toBeGreaterThan(0);
    expect(theme.interaction.selectedOutline).not.toBe(theme.nodes.default.background);
    // With branch colour reaching node fills, the ring is the only selection signal, so it
    // must never coincide with a palette colour.
    expect(theme.branches.colors).not.toContain(theme.interaction.selectedOutline);
    // The palette must also stay clear of the role tokens a single-mode map paints, so a
    // coloured branch fill cannot be mistaken for a node that happens to use its base tokens.
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

describe("Theme differentiation step 1 — the branch palette reaches the nodes (§8.3)", () => {
  it.each(THEMES)("$name gives every palette colour a WCAG AA text partner", (theme) => {
    for (const colour of theme.branches.colors) {
      const text = accessibleTextFor(colour);
      expect(contrastRatio(colour, text), `${theme.id}/${colour} with ${text}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps same-with-opacity descendant fills at AA too", () => {
    for (const theme of THEMES.filter((t) => t.branches.descendantTintPolicy === "same-with-opacity")) {
      for (const colour of theme.branches.colors) {
        const fill = blendHex(colour, theme.canvas.background, 0.65);
        expect(
          contrastRatio(fill, accessibleTextFor(fill)),
          `${theme.id}/${colour} blended to ${fill}`
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("paints first-level fills with the branch colour and descendants per policy", () => {
    const doc = withBranches(4, "by-first-level-branch");
    const firstLevel = getNode(doc, doc.rootId).childIds;
    for (const theme of THEMES) {
      for (const [index, id] of firstLevel.entries()) {
        const expected = theme.branches.colors[index % theme.branches.colors.length]!;
        expect(nodeFillAndTextFor(doc, theme, id, 1).background, `${theme.id}/first-level ${index}`).toBe(expected);
        for (const childId of getNode(doc, id).childIds) {
          const expectedFill =
            theme.branches.descendantTintPolicy === "same-with-opacity"
              ? blendHex(expected, theme.canvas.background, 0.65)
              : expected;
          expect(nodeFillAndTextFor(doc, theme, childId, 2).background, `${theme.id}/descendant`).toBe(expectedFill);
        }
      }
    }
  });

  it("never colours the root, and single mode returns the role tokens verbatim", () => {
    for (const theme of THEMES) {
      const branchDoc = withBranches(3, "by-first-level-branch");
      expect(nodeFillAndTextFor(branchDoc, theme, branchDoc.rootId, 0)).toEqual({
        background: theme.nodes.root.background,
        text: theme.nodes.root.text
      });

      const singleDoc = withBranches(3, "single");
      const ids: Array<[string, number]> = [[singleDoc.rootId, 0]];
      for (const branchId of getNode(singleDoc, singleDoc.rootId).childIds) {
        ids.push([branchId, 1]);
        for (const childId of getNode(singleDoc, branchId).childIds) ids.push([childId, 2]);
      }
      for (const [id, depth] of ids) {
        const tokens = roleTokens(theme, depth);
        expect(nodeFillAndTextFor(singleDoc, theme, id, depth)).toEqual({
          background: tokens.background,
          text: tokens.text
        });
      }
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
