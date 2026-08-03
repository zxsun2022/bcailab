import { measureText } from "../svg-export/measure";
import type { Node, Tree } from "./tree";

/*
 * Phase 0 spike 3 — variable-size tidy-tree layout.
 *
 * Implements the two-pass shape layout-engine.md §8 prescribes:
 *   pass 1, bottom-up  measure each node box, then each subtree's height
 *   pass 2, top-down   place boxes at direction-appropriate X, assign Y from measured offsets
 *
 * Deliberately the simple contour-free variant. §8 permits "a more advanced contour-based
 * collision algorithm ... to reduce excess whitespace" but requires deterministic behaviour
 * first. Whitespace is a cosmetic problem; non-determinism would break exports, tests and
 * undo, so the spike establishes the deterministic baseline and measures what it costs.
 */

export type Spacing = {
  fontSize: number;
  paddingX: number;
  paddingY: number;
  horizontalGap: number;
  siblingGap: number;
  subtreeGap: number;
  maxNodeWidth: number;
};

export const DEFAULT_SPACING: Spacing = {
  fontSize: 14,
  paddingX: 12,
  paddingY: 8,
  horizontalGap: 48,
  siblingGap: 10,
  subtreeGap: 18,
  maxNodeWidth: 260
};

export type Box = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  depth: number;
  side: "root" | "left" | "right";
};

export type LayoutResult = {
  boxes: Record<string, Box>;
  order: string[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  ms: number;
};

type Measured = { w: number; h: number; subtreeH: number; lines: number };

/** Visible = root, or every ancestor expanded. Hidden nodes leave layout entirely (§5). */
function visibleChildren(node: Node): string[] {
  return node.collapsed ? [] : node.childIds;
}

/**
 * Pass 1 — measure bottom-up.
 *
 * Wrapping is approximated by dividing measured width by maxNodeWidth. The real engine must
 * break on grapheme clusters (§4.2); for CJK that is nearly per-character, which is why the
 * approximation is close enough to size boxes here but not close enough to ship.
 */
function measure(tree: Tree, spacing: Spacing): Record<string, Measured> {
  const out: Record<string, Measured> = {};

  const walk = (id: string): Measured => {
    const node = tree.nodes[id]!;
    const textW = measureText(node.text, spacing.fontSize);
    const lines = Math.max(1, Math.ceil(textW / spacing.maxNodeWidth));
    const w = Math.min(textW, spacing.maxNodeWidth) + spacing.paddingX * 2;
    const h = spacing.fontSize * 1.5 * lines + spacing.paddingY * 2;

    const kids = visibleChildren(node);
    let childBlock = 0;
    for (let i = 0; i < kids.length; i++) {
      const m = walk(kids[i]!);
      childBlock += m.subtreeH;
      if (i < kids.length - 1) {
        // Cousins get more room than siblings: a gap that ignores subtree depth makes deep
        // branches read as one mass (§9).
        const deeper = tree.nodes[kids[i]!]!.childIds.length > 0;
        childBlock += deeper ? spacing.subtreeGap : spacing.siblingGap;
      }
    }

    const result: Measured = { w, h, lines, subtreeH: Math.max(h, childBlock) };
    out[id] = result;
    return result;
  };

  walk(tree.rootId);
  return out;
}

/** Pass 2 — place top-down. */
function place(
  tree: Tree,
  m: Record<string, Measured>,
  spacing: Spacing,
  boxes: Record<string, Box>,
  order: string[],
  id: string,
  left: number,
  top: number,
  side: "root" | "left" | "right",
  dir: 1 | -1
) {
  const node = tree.nodes[id]!;
  const me = m[id]!;
  const x = dir === 1 ? left : left - me.w;

  boxes[id] = { id, x, y: top + (me.subtreeH - me.h) / 2, w: me.w, h: me.h, depth: node.depth, side };
  order.push(id);

  const kids = visibleChildren(node);
  if (kids.length === 0) return;

  const childLeft = dir === 1 ? x + me.w + spacing.horizontalGap : x - spacing.horizontalGap;

  let cursor = top;
  // Children are centred as a block against the parent's own subtree span, which is what makes
  // a parent sit level with the middle of its children rather than with the first one.
  let block = 0;
  for (let i = 0; i < kids.length; i++) {
    block += m[kids[i]!]!.subtreeH;
    if (i < kids.length - 1) {
      block += tree.nodes[kids[i]!]!.childIds.length > 0 ? spacing.subtreeGap : spacing.siblingGap;
    }
  }
  cursor = top + (me.subtreeH - block) / 2;

  for (let i = 0; i < kids.length; i++) {
    const kid = kids[i]!;
    place(tree, m, spacing, boxes, order, kid, childLeft, cursor, side === "root" ? (dir === 1 ? "right" : "left") : side, dir);
    cursor += m[kid]!.subtreeH;
    if (i < kids.length - 1) {
      cursor += tree.nodes[kid]!.childIds.length > 0 ? spacing.subtreeGap : spacing.siblingGap;
    }
  }
}

export function layoutRightOnly(tree: Tree, spacing = DEFAULT_SPACING): LayoutResult {
  const t0 = performance.now();
  const m = measure(tree, spacing);
  const boxes: Record<string, Box> = {};
  const order: string[] = [];
  place(tree, m, spacing, boxes, order, tree.rootId, 0, 0, "root", 1);
  return finish(boxes, order, performance.now() - t0);
}

/**
 * Two-sided. First-level branches are partitioned by *stored* side, and any node without one
 * gets a deterministic assignment — §7.2 requires the assignment be sticky, so it is computed
 * once and written back, never recomputed from current heights on every layout.
 */
export function layoutTwoSided(
  tree: Tree,
  spacing = DEFAULT_SPACING,
  /**
   * `centered` follows §7.6: root Y aligns with the centre of the combined left/right extents.
   * `anchored` pins the root instead and lets each side hang from it.
   *
   * The option exists because §7.6 and §11.5 cannot both hold. Centring on the *combined*
   * extent means growing either side moves the root, and moving the root moves the other side —
   * so "preserve unaffected side geometry" is unreachable while the root centres. The spike
   * measures the cost of each so the choice is made on numbers.
   */
  rootPolicy: "centered" | "anchored" = "centered"
): LayoutResult {
  const t0 = performance.now();
  const root = tree.nodes[tree.rootId]!;
  const m = measure(tree, spacing);

  for (const id of root.childIds) {
    const node = tree.nodes[id]!;
    if (node.side === null) {
      // Deterministic tie-break: assign to whichever side is currently shorter, walking
      // children in semantic order. Same input, same result, every time.
      const rightH = root.childIds
        .filter((c) => tree.nodes[c]!.side === "right")
        .reduce((s, c) => s + m[c]!.subtreeH, 0);
      const leftH = root.childIds
        .filter((c) => tree.nodes[c]!.side === "left")
        .reduce((s, c) => s + m[c]!.subtreeH, 0);
      node.side = rightH <= leftH ? "right" : "left";
    }
  }

  const boxes: Record<string, Box> = {};
  const order: string[] = [];
  const rootM = m[tree.rootId]!;

  const sideHeight = (side: "left" | "right") => {
    const ids = root.childIds.filter((c) => tree.nodes[c]!.side === side);
    return ids.reduce(
      (sum, c, i) => sum + m[c]!.subtreeH + (i < ids.length - 1 ? spacing.subtreeGap : 0),
      0
    );
  };

  const tallest = Math.max(sideHeight("left"), sideHeight("right"), rootM.h);
  // Centred: the root floats to the middle of whatever the two sides currently span, so any
  // growth on either side moves it. Anchored: the root is fixed and only its own side reflows.
  const rootY = rootPolicy === "centered" ? (tallest - rootM.h) / 2 : 0;

  boxes[tree.rootId] = {
    id: tree.rootId,
    x: -rootM.w / 2,
    y: rootY,
    w: rootM.w,
    h: rootM.h,
    depth: 0,
    side: "root"
  };
  order.push(tree.rootId);

  for (const side of ["right", "left"] as const) {
    const dir = side === "right" ? 1 : -1;
    const ids = root.childIds.filter((c) => tree.nodes[c]!.side === side);
    const startLeft = dir === 1 ? rootM.w / 2 + spacing.horizontalGap : -rootM.w / 2 - spacing.horizontalGap;
    let cursor =
      rootPolicy === "centered"
        ? (tallest - sideHeight(side)) / 2
        : rootY + rootM.h / 2 - sideHeight(side) / 2;
    for (let i = 0; i < ids.length; i++) {
      place(tree, m, spacing, boxes, order, ids[i]!, startLeft, cursor, side, dir);
      cursor += m[ids[i]!]!.subtreeH + spacing.subtreeGap;
    }
  }

  return finish(boxes, order, performance.now() - t0);
}

function finish(boxes: Record<string, Box>, order: string[], ms: number): LayoutResult {
  const all = Object.values(boxes);
  return {
    boxes,
    order,
    ms,
    bounds: {
      minX: Math.min(...all.map((b) => b.x)),
      minY: Math.min(...all.map((b) => b.y)),
      maxX: Math.max(...all.map((b) => b.x + b.w)),
      maxY: Math.max(...all.map((b) => b.y + b.h))
    }
  };
}

/**
 * How much did geometry move between two layouts? The stability measurement (§11).
 *
 * `only` restricts the comparison to a subset — used to ask the sharper question: did the side
 * the user did *not* touch move at all?
 */
export function diffLayouts(a: LayoutResult, b: LayoutResult, only?: (id: string) => boolean) {
  let moved = 0;
  let maxShift = 0;
  let totalShift = 0;
  const shared = Object.keys(a.boxes).filter((id) => id in b.boxes && (!only || only(id)));
  for (const id of shared) {
    const p = a.boxes[id]!;
    const q = b.boxes[id]!;
    const d = Math.hypot(p.x - q.x, p.y - q.y);
    if (d > 0.01) {
      moved++;
      totalShift += d;
      maxShift = Math.max(maxShift, d);
    }
  }
  return {
    shared: shared.length,
    moved,
    movedPct: shared.length ? (moved / shared.length) * 100 : 0,
    maxShift,
    meanShift: moved ? totalShift / moved : 0
  };
}
