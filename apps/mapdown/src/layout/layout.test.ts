import { beforeEach, describe, expect, it } from "vitest";
import kepanSource from "../fixtures/kepan.md?raw";
import { importMarkdown } from "../markdown/parse";
import { applyCommand } from "../model/commands";
import { createDocument, getNode, resetIdCounterForTests, type MindMapDocument } from "../model/types";
import { MINIMAL_LIGHT, SHAPES, resolveTheme } from "../theme/presets";
import { roleTokens, roleTypography } from "../theme/roles";
import {
  DEFAULT_SPACING,
  DEFAULT_TYPOGRAPHY,
  diffLayouts,
  layout,
  layoutOptionsForTheme,
  rootCentre
} from "./layout";
import { clearMeasurementCache, measureNode, measurementCacheSize, wrapText } from "./measure";

/** Every shape resolved with its own default palette — the legacy theme pairings (D-24). */
const THEMES = SHAPES.map((shape) => resolveTheme(shape.id, shape.defaultPaletteId));

beforeEach(() => {
  resetIdCounterForTests();
  clearMeasurementCache();
});

function build(labels: [string, number][]): MindMapDocument {
  let doc = createDocument(labels[0]![0]);
  const atDepth: string[] = [doc.rootId];
  for (const [text, depth] of labels.slice(1)) {
    const result = applyCommand(doc, { type: "CreateChild", parentId: atDepth[depth - 1]!, text });
    doc = result.doc;
    atDepth[depth] = result.selection!;
    atDepth.length = depth + 1;
  }
  return doc;
}

const kepan = () => {
  const result = importMarkdown(kepanSource);
  if (!result.ok) throw new Error(result.error);
  return result.doc;
};

/**
 * §3 first. Every other stability assertion is meaningless if the origin moves — that is the
 * lesson spike 3 paid for, and this ordering is deliberate.
 */
describe("§3 — the root centre is the document origin", () => {
  it("puts the root centre at (0, 0) for a single node", () => {
    const result = layout(createDocument("Root"));
    expect(rootCentre(result, "n1")).toEqual({ x: 0, y: 0 });
  });

  it("keeps it there no matter how lopsided the tree is", () => {
    const doc = build([
      ["Root", 0],
      ["A", 1],
      ["A1", 2],
      ["A2", 2],
      ["A3", 2],
      ["A4", 2],
      ["B", 1]
    ]);
    const centre = rootCentre(layout(doc), doc.rootId);
    expect(Math.abs(centre.x)).toBeLessThan(0.001);
    expect(Math.abs(centre.y)).toBeLessThan(0.001);
  });

  it("produces signed bounds — the map extends above and left of the origin", () => {
    const result = layout(kepan());
    expect(result.bounds.minY).toBeLessThan(0);
    expect(result.bounds.maxY).toBeGreaterThan(0);
    expect(result.bounds.minX).toBeLessThan(0);
  });
});

describe("§6 — right-only placement", () => {
  it("puts every child to the right of its parent's outward edge", () => {
    const doc = kepan();
    const result = layout(doc);
    for (const box of Object.values(result.boxes)) {
      const parentId = getNode(doc, box.nodeId).parentId;
      if (!parentId) continue;
      expect(box.x).toBeGreaterThan(result.boxes[parentId]!.outwardEdgeX);
    }
  });

  it("places children by their parent's edge, exactly as §6.1 specifies", () => {
    const doc = kepan();
    const result = layout(doc);
    const expected = (parentId: string) =>
      result.boxes[parentId]!.outwardEdgeX + DEFAULT_SPACING.collapseLane + DEFAULT_SPACING.horizontalGap;

    for (const box of Object.values(result.boxes)) {
      const parentId = getNode(doc, box.nodeId).parentId;
      if (parentId) expect(box.x).toBeCloseTo(expected(parentId), 6);
    }
  });

  it("centres a parent on the vertical span of its children, not on the first one", () => {
    const doc = build([
      ["Root", 0],
      ["Parent", 1],
      ["First", 2],
      ["Second", 2],
      ["Third", 2]
    ]);
    const result = layout(doc);
    const parentId = getNode(doc, doc.rootId).childIds[0]!;
    const childIds = getNode(doc, parentId).childIds;

    const parent = result.boxes[parentId]!;
    const first = result.boxes[childIds[0]!]!;
    const last = result.boxes[childIds[2]!]!;

    const parentMid = parent.y + parent.height / 2;
    const spanMid = (first.y + (last.y + last.height)) / 2;
    expect(Math.abs(parentMid - spanMid)).toBeLessThan(0.001);
  });

  /**
   * The case the obvious test misses. With several children the child block is taller than the
   * parent, so the centring offset is zero and a broken implementation still passes. Only when
   * the *parent* is taller — a long wrapping label above one short child — does §6.2's "subtree
   * height is the maximum of the two" actually do any work.
   */
  it("centres a short child block against a parent taller than it (§6.2)", () => {
    const doc = build([
      ["Root", 0],
      ["思维死缘无定而修无常，思维猛励希求而修无常，思维各种喻义而修无常，思维本性闲暇", 1],
      ["短", 2]
    ]);
    const result = layout(doc);
    const parentId = getNode(doc, doc.rootId).childIds[0]!;
    const childId = getNode(doc, parentId).childIds[0]!;

    const parent = result.boxes[parentId]!;
    const child = result.boxes[childId]!;
    expect(parent.height).toBeGreaterThan(child.height);

    const parentMid = parent.y + parent.height / 2;
    const childMid = child.y + child.height / 2;
    expect(Math.abs(parentMid - childMid)).toBeLessThan(0.001);
  });

  it("does NOT force uniform columns — §6.1 is edge-based, so widths make them ragged", () => {
    const doc = kepan();
    const result = layout(doc);
    const xsAtDepth3 = new Set(
      Object.values(result.boxes)
        .filter((b) => b.depth === 3)
        .map((b) => Math.round(b.x * 100))
    );
    // Recorded as an expectation rather than left implicit: an implementation that produced
    // one column per depth would have stopped following §6.1 and started using a depth grid.
    expect(xsAtDepth3.size).toBeGreaterThan(1);
  });
});

describe("§5 — collapsed nodes leave layout entirely", () => {
  it("omits descendants of a collapsed node but keeps its child count for the badge", () => {
    const doc = build([
      ["Root", 0],
      ["Branch", 1],
      ["Hidden A", 2],
      ["Hidden B", 2]
    ]);
    const branchId = getNode(doc, doc.rootId).childIds[0]!;
    const collapsed = applyCommand(doc, { type: "SetCollapsed", nodeId: branchId, collapsed: true }).doc;

    const result = layout(collapsed);
    expect(Object.keys(result.boxes)).toHaveLength(2);
    expect(result.boxes[branchId]!.collapsed).toBe(true);
    expect(result.boxes[branchId]!.directChildCount).toBe(2);
  });

  it("emits no connector into a hidden node", () => {
    const doc = build([
      ["Root", 0],
      ["Branch", 1],
      ["Hidden", 2]
    ]);
    const branchId = getNode(doc, doc.rootId).childIds[0]!;
    const collapsed = applyCommand(doc, { type: "SetCollapsed", nodeId: branchId, collapsed: true }).doc;
    const result = layout(collapsed);
    expect(result.connectors).toHaveLength(1);
    expect(result.connectors[0]!.toId).toBe(branchId);
  });
});

describe("determinism and non-overlap", () => {
  it("gives identical geometry for identical input", () => {
    const doc = kepan();
    expect(diffLayouts(layout(doc), layout(doc)).moved).toBe(0);
  });

  it("never overlaps two boxes, across the whole 科判 fixture", () => {
    const boxes = Object.values(layout(kepan()).boxes);
    let overlaps = 0;
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const p = boxes[i]!;
        const q = boxes[j]!;
        if (
          p.x < q.x + q.width &&
          q.x < p.x + p.width &&
          p.y < q.y + q.height &&
          q.y < p.y + p.height
        ) {
          overlaps++;
        }
      }
    }
    expect(overlaps).toBe(0);
  });

  it("connects every visible non-root node exactly once", () => {
    const result = layout(kepan());
    expect(result.connectors).toHaveLength(Object.keys(result.boxes).length - 1);
    expect(new Set(result.connectors.map((c) => c.toId)).size).toBe(result.connectors.length);
  });
});

describe("§11 — a local edit disturbs a bounded region", () => {
  it("leaves an unrelated sibling branch untouched when a leaf grows", () => {
    const doc = build([
      ["Root", 0],
      ["Branch A", 1],
      ["A leaf", 2],
      ["Branch B", 1],
      ["B leaf", 2]
    ]);
    const [branchA, branchB] = getNode(doc, doc.rootId).childIds as [string, string];
    const aLeaf = getNode(doc, branchA).childIds[0]!;

    const before = layout(doc);
    const edited = applyCommand(doc, {
      type: "RenameNode",
      nodeId: aLeaf,
      text: "A leaf with a considerably longer label than before"
    }).doc;
    const after = layout(edited);

    // Branch B sits below A, so it shifts; what must not happen is its *internal* geometry
    // changing. Its child stays at the same offset from it.
    const bBefore = before.boxes[branchB]!;
    const bAfter = after.boxes[branchB]!;
    const bChildBefore = before.boxes[getNode(doc, branchB).childIds[0]!]!;
    const bChildAfter = after.boxes[getNode(edited, branchB).childIds[0]!]!;

    expect(bChildAfter.x - bAfter.x).toBeCloseTo(bChildBefore.x - bBefore.x, 6);
    expect(bChildAfter.y - bAfter.y).toBeCloseTo(bChildBefore.y - bBefore.y, 6);
  });

  it("moves nothing at all when the edit does not change measured size", () => {
    const doc = build([
      ["Root", 0],
      ["Alpha", 1],
      ["Beta", 1]
    ]);
    const before = layout(doc);
    const alphaId = getNode(doc, doc.rootId).childIds[0]!;
    // Same character count and script, so the measured width is identical.
    const edited = applyCommand(doc, { type: "RenameNode", nodeId: alphaId, text: "Alpho" }).doc;
    expect(diffLayouts(before, layout(edited)).moved).toBe(0);
  });
});

describe("§4.2 — wrapping", () => {
  const typography = { ...DEFAULT_TYPOGRAPHY, maxWidth: 120 };

  it("wraps Chinese without needing spaces", () => {
    const lines = wrapText("暇满难得寿命无常轮回过患因果不虚解脱利益依止上师", typography);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join("")).toBe("暇满难得寿命无常轮回过患因果不虚解脱利益依止上师");
  });

  it("does not split a Latin word across lines", () => {
    const lines = wrapText("alpha beta gamma delta epsilon zeta", typography);
    expect(lines.length).toBeGreaterThan(1);
    for (const word of ["alpha", "beta", "gamma", "delta", "epsilon", "zeta"]) {
      expect(lines.some((line) => line.includes(word))).toBe(true);
    }
  });

  it("emergency-breaks a single token longer than the line rather than overflowing", () => {
    const lines = wrapText("A".repeat(200), typography);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join("")).toBe("A".repeat(200));
  });

  it("keeps a grapheme cluster intact when emergency breaking", () => {
    const lines = wrapText("👨‍👩‍👧‍👦".repeat(30), typography);
    // A split inside the family emoji would leave a lone person or ZWJ on a line boundary.
    for (const line of lines) expect(line.startsWith("‍")).toBe(false);
    expect(lines.join("")).toBe("👨‍👩‍👧‍👦".repeat(30));
  });

  it("returns one line for text that fits", () => {
    expect(wrapText("short", typography)).toEqual(["short"]);
  });

  it("gives an empty label one empty line, so its box still has height", () => {
    expect(wrapText("", typography)).toEqual([""]);
    expect(measureNode("", typography).height).toBeGreaterThan(0);
  });

  it("never exceeds the maximum width", () => {
    const long = "思维死缘无定而修无常思维猛励希求而修无常思维各种喻义而修无常";
    expect(measureNode(long, typography).width).toBeLessThanOrEqual(typography.maxWidth);
  });
});

describe("§4.4 — measurement caching", () => {
  it("reuses a measurement for the same text and typography", () => {
    clearMeasurementCache();
    measureNode("暇满难得", DEFAULT_TYPOGRAPHY);
    expect(measurementCacheSize()).toBe(1);
    measureNode("暇满难得", DEFAULT_TYPOGRAPHY);
    expect(measurementCacheSize()).toBe(1);
  });

  it("keys on typography, so a theme change invalidates without anyone clearing the cache", () => {
    clearMeasurementCache();
    const a = measureNode("暇满难得", DEFAULT_TYPOGRAPHY);
    const b = measureNode("暇满难得", { ...DEFAULT_TYPOGRAPHY, fontSize: 20 });
    expect(measurementCacheSize()).toBe(2);
    expect(b.width).toBeGreaterThan(a.width);
  });

  it("measures root and descendant roles with their rendered typography", () => {
    let doc = createDocument("WWWWWWWW");
    doc = applyCommand(doc, {
      type: "CreateChild",
      parentId: doc.rootId,
      text: "WWWWWWWW"
    }).doc;
    const childId = getNode(doc, doc.rootId).childIds[0]!;

    const result = layout(doc, {
      typography: (depth) => ({
        ...DEFAULT_TYPOGRAPHY,
        fontSize: depth === 0 ? 20 : 12,
        fontWeight: depth === 0 ? 700 : 400
      })
    });

    expect(result.boxes[doc.rootId]!.width).toBeGreaterThan(result.boxes[childId]!.width);
    expect(result.boxes[doc.rootId]!.height).toBeGreaterThan(result.boxes[childId]!.height);
  });

  it("uses the selected theme's rendered root metrics", () => {
    const doc = createDocument("Root");
    const theme = resolveTheme(MINIMAL_LIGHT.id, MINIMAL_LIGHT.defaultPaletteId);
    const result = layout(doc, layoutOptionsForTheme(theme));

    expect(result.boxes[doc.rootId]!.height).toBeCloseTo(
      theme.typography.rootFontSize * theme.typography.lineHeight +
        theme.nodes.root.paddingY * 2
    );
  });

  it("measures first-level nodes with the rendered level1 font weight, not the default", () => {
    const theme = resolveTheme(MINIMAL_LIGHT.id, MINIMAL_LIGHT.defaultPaletteId);
    const options = layoutOptionsForTheme(theme);
    const level1 = typeof options.typography === "function" ? options.typography(1) : options.typography;

    expect(level1?.fontWeight).toBe(theme.typography.level1FontWeight);
    expect(level1?.fontWeight).not.toBe(theme.typography.nodeFontWeight);
  });

  /**
   * The c55276c regression, guarded structurally: the weight mismatch happened because the
   * measurement path re-derived role tokens with its own ternaries. Both the renderer and
   * the editing overlay read `roles.ts`; if measurement drifts again, this fails for every
   * theme and depth instead of only the one fixture that happened to be measured.
   */
  it("measures with the same role typography and tokens the renderer and editor use", () => {
    for (const theme of THEMES) {
      const options = layoutOptionsForTheme(theme);
      for (const depth of [0, 1, 2, 5]) {
        const measured = typeof options.typography === "function" ? options.typography(depth) : options.typography;
        const { size, weight } = roleTypography(theme, depth);
        const tokens = roleTokens(theme, depth);
        expect(measured, `${theme.id}/depth ${depth}`).toMatchObject({
          fontSize: size,
          fontWeight: weight,
          lineHeight: theme.typography.lineHeight,
          maxWidth: tokens.maxWidth,
          paddingX: tokens.paddingX,
          paddingY: tokens.paddingY
        });
      }
    }
  });

  it("keeps the type hierarchy to three tiers with a 13px floor and the owner-approved root padding", () => {
    for (const theme of THEMES) {
      // Depth is unbounded, so everything from depth 2 down must clamp to the same size —
      // never a per-depth step that would make deep outlines unreadable (D-21).
      const sizes = [0, 1, 2, 3, 10].map((depth) => roleTypography(theme, depth).size);
      expect(sizes[0]).toBeGreaterThan(sizes[1]!);
      expect(sizes[1]).toBeGreaterThan(sizes[2]!);
      expect(sizes.slice(2)).toEqual(Array(sizes.length - 2).fill(theme.typography.nodeFontSize));
      expect(theme.typography.nodeFontSize).toBeGreaterThanOrEqual(13);
      // D-21: the root grew to 18px, so no preset may drop below the 10px vertical padding
      // that keeps it uncramped; D-22 varies density upward per preset (Soft Branch Colors
      // uses 12).
      expect(theme.nodes.root.paddingY).toBeGreaterThanOrEqual(10);
    }
  });
});
