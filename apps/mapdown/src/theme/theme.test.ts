import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { applyCommand } from "../model/commands";
import { createDocument, getNode, resetIdCounterForTests, type MindMapDocument } from "../model/types";
import { branchColorFor, connectorColorFor, nodeFillAndTextFor } from "./branch-colors";
import {
  BUSINESS,
  DARK,
  MINIMAL_LIGHT,
  PALETTES,
  SHAPES,
  SOFT_BRANCHES,
  initialThemeSelection,
  isKnownPaletteId,
  isKnownShapeId,
  normalizeThemeSelection,
  paletteById,
  resolveTheme,
  shapeById
} from "./presets";
import { roleTokens } from "./roles";
import { contrastRatio, type MindMapTheme, type ShapeTokens } from "./types";

beforeEach(() => resetIdCounterForTests());

/** The chrome accent from src/styles/base.css, which C-01 says branch palettes must avoid. */
const CHROME_ACCENT_LIGHT = "#2f6feb";
const CHROME_ACCENT_DARK = "#5b8def";

/** Every resolved combo ships as a shape × its own default palette (the legacy pairings). */
const DEFAULT_THEMES: MindMapTheme[] = SHAPES.map((shape) =>
  resolveTheme(shape.id, shape.defaultPaletteId)
);

function withBranches(
  count: number,
  mode: "single" | "by-first-level-branch",
  paletteId = "soft-spectrum"
): MindMapDocument {
  let doc: MindMapDocument = {
    ...createDocument("Root"),
    layout: { mode: "two-sided" },
    theme: { shapeId: "soft-branches", paletteId, branchColorMode: mode }
  };
  for (let i = 0; i < count; i++) {
    const branch = applyCommand(doc, { type: "CreateChild", parentId: doc.rootId, text: `B${i}` });
    doc = branch.doc;
    doc = applyCommand(doc, { type: "CreateChild", parentId: branch.selection!, text: `${i}-child` }).doc;
  }
  return doc;
}

/** Every literal colour value in a token set, so a stray CSS variable cannot hide in a corner. */
function colorValues(value: unknown): string[] {
  const out: string[] = [];
  const walk = (entry: unknown) => {
    if (typeof entry === "string") out.push(entry);
    else if (entry && typeof entry === "object") Object.values(entry).forEach(walk);
  };
  walk(value);
  return out;
}

describe("themes are data, not CSS (D-05)", () => {
  it.each(SHAPES)("shape $name uses only literal values", (shape) => {
    for (const value of colorValues(shape)) {
      // A `var(--x)` here would render correctly in the browser and produce an unstyled export,
      // which is precisely the failure this rule exists to prevent.
      expect(value).not.toMatch(/var\(|--/);
      expect(value).not.toMatch(/^(class|url\()/);
    }
  });

  it.each(PALETTES)("palette $name uses only literal values", (palette) => {
    for (const entry of palette.entries) {
      expect(entry.fill).toMatch(/^#[0-9a-f]{6}$/i);
      expect(entry.text).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it.each(SHAPES)("shape $name has every colour as a resolvable hex", (shape) => {
    const hexes = colorValues(shape).filter((v) => v.startsWith("#"));
    expect(hexes.length).toBeGreaterThan(8);
    for (const hex of hexes) expect(hex).toMatch(/^#[0-9a-f]{3}([0-9a-f]{3})?$/i);
  });

  it("survives a JSON round trip, which is what serialising into an export requires", () => {
    for (const shape of SHAPES) {
      expect(JSON.parse(JSON.stringify(shape))).toEqual(shape);
    }
    for (const palette of PALETTES) {
      expect(JSON.parse(JSON.stringify(palette))).toEqual(palette);
    }
  });
});

describe("D-24 — the theme is two orthogonal axes, not one id", () => {
  it("ships four shapes and ten palettes", () => {
    expect(SHAPES.map((s) => s.id)).toEqual(["minimal-light", "soft-branches", "business", "dark"]);
    expect(SHAPES.filter((s) => s.appearance === "dark")).toHaveLength(1);
    expect(PALETTES.map((p) => p.id)).toEqual([
      "slate",
      "soft-spectrum",
      "corporate",
      "night-glow",
      "ember",
      "glacier",
      "forest",
      "mono",
      "vivid",
      "earth"
    ]);
    // The legacy single-theme ids all still resolve as shape ids, so old documents map 1:1.
    for (const shape of SHAPES) expect(isKnownShapeId(shape.id)).toBe(true);
    expect(new Set(SHAPES.map((s) => s.defaultPaletteId)).size).toBe(SHAPES.length);
  });

  it("falls back to defaults for an unknown shape or palette rather than failing (§7.3)", () => {
    expect(shapeById("does-not-exist").id).toBe(MINIMAL_LIGHT.id);
    expect(shapeById("dark").id).toBe(DARK.id);
    expect(paletteById("does-not-exist").id).toBe("slate");
    expect(paletteById("night-glow").id).toBe("night-glow");
    expect(isKnownShapeId("does-not-exist")).toBe(false);
    expect(isKnownPaletteId("does-not-exist")).toBe(false);
  });

  it("resolves a shape and palette into the theme the renderer reads", () => {
    const theme = resolveTheme("business", "night-glow");
    expect(theme.canvas).toEqual(BUSINESS.canvas);
    expect(theme.nodes).toEqual(BUSINESS.nodes);
    expect(theme.typography).toEqual(BUSINESS.typography);
    expect(theme.branches.id).toBe("night-glow");
    expect(theme.branches.entries).toEqual(resolveTheme("business", "night-glow").branches.entries);
  });

  it("falls an unknown palette back to the shape's own default so the map keeps its identity", () => {
    const theme = resolveTheme("dark", "does-not-exist");
    expect(theme.branches.id).toBe("night-glow");
    const unknown = resolveTheme("does-not-exist", "does-not-exist");
    expect(unknown.id).toBe(MINIMAL_LIGHT.id);
    expect(unknown.branches.id).toBe(MINIMAL_LIGHT.defaultPaletteId);
  });

  it("maps the system colour scheme onto the initial selection (Canvas affordances c)", () => {
    expect(initialThemeSelection(false)).toEqual({
      shapeId: "minimal-light",
      paletteId: "slate",
      branchColorMode: "single"
    });
    expect(initialThemeSelection(true)).toEqual({
      shapeId: "dark",
      paletteId: "night-glow",
      branchColorMode: "single"
    });
  });

  it("maps a legacy single themeId onto its shape + default palette (step 3 back-compat)", () => {
    expect(
      normalizeThemeSelection({ themeId: "soft-branches", branchColorMode: "by-first-level-branch" })
    ).toEqual({
      shapeId: "soft-branches",
      paletteId: "soft-spectrum",
      branchColorMode: "by-first-level-branch"
    });
    expect(normalizeThemeSelection({ themeId: "dark" })).toEqual({
      shapeId: "dark",
      paletteId: "night-glow",
      branchColorMode: "single"
    });
  });

  it("lets an explicit axis win over the legacy theme, per axis", () => {
    expect(normalizeThemeSelection({ themeId: "dark", shapeId: "business" })).toEqual({
      shapeId: "business",
      paletteId: "night-glow",
      branchColorMode: "single"
    });
    expect(normalizeThemeSelection({ themeId: "dark", paletteId: "slate" })).toEqual({
      shapeId: "dark",
      paletteId: "slate",
      branchColorMode: "single"
    });
  });

  it("normalises unknown ids to defaults", () => {
    expect(normalizeThemeSelection({ themeId: "bogus", branchColorMode: "nope" as never })).toEqual({
      shapeId: "minimal-light",
      paletteId: "slate",
      branchColorMode: "single"
    });
    expect(normalizeThemeSelection({ shapeId: "business", paletteId: "bogus" })).toEqual({
      shapeId: "business",
      paletteId: "corporate",
      branchColorMode: "single"
    });
  });
});

describe("§13 — the four required shape presets exist", () => {
  it("makes the shapes visually distinct rather than hue variants (§12.5)", () => {
    // Not by canvas alone: Minimal Light and Business are both white-canvas by design and
    // differ in border language instead. §13 lists that as the sanctioned axis of variation.
    const signature = (t: ShapeTokens) =>
      [t.canvas.background, t.nodes.default.radius, t.nodes.default.background, t.nodes.root.background].join("|");
    expect(new Set(SHAPES.map(signature)).size).toBe(SHAPES.length);
    expect(new Set(SHAPES.map((t) => t.nodes.default.radius)).size).toBeGreaterThan(1);
  });

  it("differs in shape language, not only hue — the D-22 grayscale signature", () => {
    // Step 2's acceptance is that the four shapes are distinguishable in grayscale, which
    // hue-based signatures cannot prove. Radius, border weight, and padding density per role
    // must all differ so a desaturated screenshot still separates the presets.
    const shapeSignature = (t: ShapeTokens) =>
      (["root", "level1", "default"] as const)
        .map(
          (role) =>
            `${t.nodes[role].radius}|${t.nodes[role].borderWidth}|${t.nodes[role].paddingX}|${t.nodes[role].paddingY}`
        )
        .join(";");
    expect(new Set(SHAPES.map(shapeSignature)).size).toBe(SHAPES.length);
    // The axes are genuinely in play, not one token doing all the work.
    expect(new Set(SHAPES.map((t) => t.nodes.level1.borderWidth)).size).toBeGreaterThan(1);
    expect(new Set(SHAPES.map((t) => t.nodes.default.paddingX)).size).toBeGreaterThan(1);
  });
});

describe("§18 — contrast", () => {
  it.each(DEFAULT_THEMES)("$name meets AA for body text on every node role", (theme) => {
    for (const role of ["root", "level1", "default"] as const) {
      const tokens = theme.nodes[role];
      expect(
        contrastRatio(tokens.text, tokens.background),
        `${theme.id}/${role}`
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(DEFAULT_THEMES)("$name keeps connectors visible against the canvas", (theme) => {
    expect(contrastRatio(theme.connectors.defaultColor, theme.canvas.background)).toBeGreaterThan(1.4);
  });

  it.each(DEFAULT_THEMES)("$name keeps the collapse badge readable", (theme) => {
    expect(
      contrastRatio(theme.controls.collapseText, theme.controls.collapseBackground)
    ).toBeGreaterThanOrEqual(4.5);
  });

  it.each(DEFAULT_THEMES)("$name gives selection a perceptible ring against the canvas", (theme) => {
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
 * .selectedOutline` and the palette fills, so that is what is asserted here — across every
 * shape × palette combo, since a palette can now be paired with any shape.
 */
describe("C-01 — selection cannot be mistaken for a branch colour", () => {
  it.each(SHAPES)("$name expresses selection as a ring, never as a fill", (shape) => {
    expect(shape.interaction.selectedOutlineWidth).toBeGreaterThan(0);
    expect(shape.interaction.selectedOutline).not.toBe(shape.nodes.default.background);
  });

  it("keeps every shape's ring and role tokens clear of every palette's fills", () => {
    for (const shape of SHAPES) {
      for (const palette of PALETTES) {
        const fills = palette.entries.map((entry) => entry.fill);
        // With branch colour reaching node fills, the ring is the only selection signal, so it
        // must never coincide with a palette fill on any shape the palette can pair with.
        expect(fills, `${shape.id} × ${palette.id} selectedOutline`).not.toContain(
          shape.interaction.selectedOutline
        );
        // The palette must also stay clear of the role tokens a single-mode map paints, so a
        // coloured branch fill cannot be mistaken for a node that happens to use its base tokens.
        for (const role of ["root", "level1", "default"] as const) {
          expect(fills, `${shape.id} × ${palette.id}/${role} background`).not.toContain(
            shape.nodes[role].background
          );
          expect(fills, `${shape.id} × ${palette.id}/${role} border`).not.toContain(
            shape.nodes[role].border
          );
        }
      }
    }
  });

  it("keeps the chrome accent off the map entirely, which is why the above is the real test", () => {
    for (const shape of SHAPES) {
      for (const palette of PALETTES) {
        const onCanvas = [
          shape.canvas.background,
          shape.connectors.defaultColor,
          shape.interaction.selectedOutline,
          shape.interaction.keyboardFocusRing,
          ...palette.entries.map((entry) => entry.fill),
          ...(["root", "level1", "default"] as const).flatMap((role) => [
            shape.nodes[role].background,
            shape.nodes[role].border
          ])
        ].map((c) => c.toLowerCase());
        expect(onCanvas, `${shape.id} × ${palette.id}`).not.toContain(CHROME_ACCENT_LIGHT);
        expect(onCanvas, `${shape.id} × ${palette.id}`).not.toContain(CHROME_ACCENT_DARK);
      }
    }
  });
});

describe("D-24 — palette entries are authored { fill, text } pairs, not runtime derivations (§8.3)", () => {
  it.each(PALETTES)("$name: every entry clears WCAG AA 4.5:1 with its authored text", (palette) => {
    for (const entry of palette.entries) {
      expect(
        contrastRatio(entry.text, entry.fill),
        `${palette.id}/${entry.fill} with ${entry.text}`
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(PALETTES)("$name: all entries share one text colour", (palette) => {
    expect(new Set(palette.entries.map((entry) => entry.text)).size).toBe(1);
  });

  it.each(PALETTES)("$name: offers six to ten distinguishable fills", (palette) => {
    expect(palette.entries.length).toBeGreaterThanOrEqual(6);
    expect(palette.entries.length).toBeLessThanOrEqual(10);
    const fills = palette.entries.map((entry) => entry.fill);
    expect(new Set(fills).size).toBe(fills.length);
  });

  it("no runtime text picker survives — accessibleTextFor is deleted, not merely unused", () => {
    const source = readFileSync(new URL("./branch-colors.ts", import.meta.url), "utf8");
    expect(source).not.toContain("accessibleTextFor");
    expect(source).not.toContain("blendHex");
    expect(source).not.toContain("descendantTintPolicy");
  });
});

describe("Theme differentiation step 1 + step 3 — branch fills come from the palette entry (§8.3)", () => {
  it("paints first-level fills with the authored pair and returns deeper nodes to role tokens", () => {
    const doc = withBranches(4, "by-first-level-branch");
    const firstLevel = getNode(doc, doc.rootId).childIds;
    for (const shape of SHAPES) {
      const theme = resolveTheme(shape.id, shape.defaultPaletteId);
      for (const [index, id] of firstLevel.entries()) {
        const entry = theme.branches.entries[index % theme.branches.entries.length]!;
        expect(nodeFillAndTextFor(doc, theme, id, 1), `${shape.id}/first-level ${index}`).toEqual({
          background: entry.fill,
          text: entry.text
        });
        // D-24 — the XMind model: deeper nodes carry no tint; only the connector is coloured.
        for (const childId of getNode(doc, id).childIds) {
          expect(
            nodeFillAndTextFor(doc, theme, childId, 2),
            `${shape.id}/descendant`
          ).toEqual({ background: theme.nodes.default.background, text: theme.nodes.default.text });
        }
      }
    }
  });

  it("never colours the root, and single mode returns the role tokens verbatim", () => {
    for (const shape of SHAPES) {
      const theme = resolveTheme(shape.id, shape.defaultPaletteId);
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
  it.each(PALETTES)("$name: cycling happens per palette", (palette) => {
    const doc = withBranches(palette.entries.length + 2, "by-first-level-branch", palette.id);
    const firstLevel = getNode(doc, doc.rootId).childIds;
    const theme = resolveTheme("soft-branches", palette.id);

    expect(branchColorFor(doc, theme, firstLevel[palette.entries.length]!)).toBe(
      palette.entries[0]!.fill
    );
    expect(branchColorFor(doc, theme, firstLevel[palette.entries.length + 1]!)).toBe(
      palette.entries[1]!.fill
    );
  });
});

describe("§8.1 — colour follows semantic order, not visual side", () => {
  const soft = resolveTheme(SOFT_BRANCHES.id, "soft-spectrum");

  it("does not repaint a branch when it moves to the other side", () => {
    const doc = withBranches(4, "by-first-level-branch");
    const branchId = getNode(doc, doc.rootId).childIds[1]!;
    const before = branchColorFor(doc, soft, branchId);

    const moved = applyCommand(doc, {
      type: "MoveFirstLevelBranchSide",
      nodeId: branchId,
      side: getNode(doc, branchId).side === "right" ? "left" : "right"
    }).doc;

    expect(branchColorFor(moved, soft, branchId)).toBe(before);
  });

  it("gives every descendant its first-level ancestor's colour", () => {
    const doc = withBranches(3, "by-first-level-branch");
    for (const branchId of getNode(doc, doc.rootId).childIds) {
      const expected = branchColorFor(doc, soft, branchId);
      for (const childId of getNode(doc, branchId).childIds) {
        expect(branchColorFor(doc, soft, childId)).toBe(expected);
      }
    }
  });

  it("returns nothing in single mode, so connectors use the theme colour", () => {
    const doc = withBranches(3, "single");
    const branchId = getNode(doc, doc.rootId).childIds[0]!;
    expect(branchColorFor(doc, soft, branchId)).toBeNull();
    expect(connectorColorFor(doc, soft, branchId)).toBe(soft.connectors.defaultColor);
  });

  it("never colours the root", () => {
    const doc = withBranches(2, "by-first-level-branch");
    expect(branchColorFor(doc, soft, doc.rootId)).toBeNull();
  });

  it("keeps colours stable when an earlier branch is deleted only by its own index shift", () => {
    const doc = withBranches(4, "by-first-level-branch");
    const [, second, third] = getNode(doc, doc.rootId).childIds as [string, string, string];
    const thirdBefore = branchColorFor(doc, soft, third);

    const after = applyCommand(doc, { type: "DeleteSubtree", nodeId: second }).doc;

    // Deleting a sibling shifts later branches one slot down the palette. That is inherent to
    // index-based assignment and is recorded here as expected, not accidental: §8.2 says
    // colours are decorative and not identifiers.
    expect(branchColorFor(after, soft, third)).not.toBe(thirdBefore);
    expect(branchColorFor(after, soft, third)).toBe(soft.branches.entries[1]!.fill);
  });
});

describe("theme layout tokens stay within an ergonomic range (§11)", () => {
  it.each(SHAPES)("$name does not make a map wildly denser or sparser", (shape) => {
    expect(shape.layout.parentChildGap).toBeGreaterThanOrEqual(32);
    expect(shape.layout.parentChildGap).toBeLessThanOrEqual(72);
    expect(shape.nodes.default.maxWidth).toBeGreaterThanOrEqual(200);
  });

  it("uses one font stack across all shapes, so measurement stays comparable", () => {
    expect(new Set(SHAPES.map((t) => t.typography.fontFamily)).size).toBe(1);
    expect(BUSINESS.typography.fontFamily).toContain("PingFang SC");
  });
});
