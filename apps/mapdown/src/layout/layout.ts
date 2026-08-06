import { measureNode, type Typography } from "./measure";
import { getNode, type BranchSide, type MindMapDocument, type NodeId } from "../model/types";
import type { MindMapTheme } from "../theme/types";

/**
 * Right-only automatic layout, per `layout-engine.md` §6 and §8.
 *
 * Two passes, as §8 prescribes: measure bottom-up, then place top-down. Deliberately the
 * contour-free variant — §8 permits a contour-based collision pass to reduce whitespace but
 * requires deterministic behaviour first, and whitespace is cosmetic where non-determinism
 * would break exports, tests and undo alike.
 *
 * **The origin is the load-bearing detail.** §3 fixes the root *centre* at `(0, 0)`, so bounds
 * are signed and the map extends into negative coordinates. This is not a convention: geometry
 * expressed against any other origin turns a growing branch into a global translation, and a
 * stability metric then cannot tell that apart from a real reflow. Phase 0's spike 3 spent its
 * whole budget rediscovering that (`spikes/03-variable-size-layout-20260802.md` Finding 2), so
 * the invariant is asserted here and tested first.
 */

export interface LayoutSpacing {
  horizontalGap: number;
  siblingGap: number;
  /** Cousins get more room than siblings, or deep branches read as one mass (§9). */
  subtreeGap: number;
  /** §4.3 — an outward lane for the collapse control, so hover cannot resize a node. */
  collapseLane: number;
}

export const DEFAULT_TYPOGRAPHY: Typography = {
  fontSize: 14,
  fontWeight: 400,
  lineHeight: 1.45,
  maxWidth: 260,
  paddingX: 12,
  paddingY: 8
};

export const DEFAULT_SPACING: LayoutSpacing = {
  horizontalGap: 48,
  siblingGap: 10,
  subtreeGap: 18,
  collapseLane: 16
};

export interface NodeBox {
  nodeId: NodeId;
  x: number;
  y: number;
  width: number;
  height: number;
  depth: number;
  /** The side this node renders on. Root reports "right" in right-only mode; see §10. */
  side: BranchSide;
  lines: string[];
  /** §5 — retained so a collapsed badge can show its direct-child count without a tree walk. */
  directChildCount: number;
  collapsed: boolean;
  /** The edge the collapse control sits on, and where a child connector leaves from. */
  outwardEdgeX: number;
  inwardEdgeX: number;
}

export interface Connector {
  fromId: NodeId;
  toId: NodeId;
  /** Cubic bezier control points, in document coordinates. */
  path: { x1: number; y1: number; c1x: number; c1y: number; c2x: number; c2y: number; x2: number; y2: number };
}

export interface LayoutResult {
  /** The document revision this was computed from; stale results are detectable. */
  revision: number;
  boxes: Record<NodeId, NodeBox>;
  order: NodeId[];
  connectors: Connector[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

export interface LayoutOptions {
  typography?: Typography | ((depth: number) => Typography);
  spacing?: LayoutSpacing;
}

/** Keep measurement and rendered theme roles on the same font, padding and spacing contract. */
export function layoutOptionsForTheme(theme: MindMapTheme): LayoutOptions {
  return {
    typography: (depth) => {
      const role =
        depth === 0 ? theme.nodes.root : depth === 1 ? theme.nodes.level1 : theme.nodes.default;
      return {
        fontSize:
          depth === 0
            ? theme.typography.rootFontSize
            : depth === 1
              ? theme.typography.level1FontSize
              : theme.typography.nodeFontSize,
        fontWeight:
          depth === 0
            ? theme.typography.rootFontWeight
            : depth === 1
              ? theme.typography.level1FontWeight
              : theme.typography.nodeFontWeight,
        lineHeight: theme.typography.lineHeight,
        maxWidth: role.maxWidth,
        paddingX: role.paddingX,
        paddingY: role.paddingY
      };
    },
    spacing: {
      horizontalGap: theme.layout.parentChildGap,
      siblingGap: theme.layout.siblingGap,
      subtreeGap: theme.layout.subtreeGap,
      collapseLane: theme.layout.collapseLane
    }
  };
}

interface Measured {
  width: number;
  height: number;
  lines: string[];
  subtreeHeight: number;
}

/** §5 — a collapsed node contributes no descendants to layout. */
function layoutChildren(doc: MindMapDocument, id: NodeId): NodeId[] {
  const node = getNode(doc, id);
  return node.collapsed ? [] : node.childIds;
}

/** Gap after child `index`: a child that has children of its own gets the wider subtree gap. */
function gapAfter(doc: MindMapDocument, childIds: NodeId[], index: number, spacing: LayoutSpacing): number {
  if (index >= childIds.length - 1) return 0;
  return getNode(doc, childIds[index]!).childIds.length > 0 ? spacing.subtreeGap : spacing.siblingGap;
}

function childBlockHeight(
  doc: MindMapDocument,
  childIds: NodeId[],
  measured: Record<NodeId, Measured>,
  spacing: LayoutSpacing
): number {
  let total = 0;
  for (let i = 0; i < childIds.length; i++) {
    total += measured[childIds[i]!]!.subtreeHeight + gapAfter(doc, childIds, i, spacing);
  }
  return total;
}

/**
 * §7.2 — which side a new first-level branch should take.
 *
 * Lives here rather than in the command layer because the rule is defined in terms of *visible
 * aggregate subtree heights*, which is layout's knowledge. The command layer accepts a side and
 * has its own deterministic fallback, so the two layers stay separable: commands never import
 * layout.
 *
 * The assignment is sticky (§7.2.5) — computed once, persisted, and never revised to rebalance.
 */
export function chooseSideForNewBranch(
  doc: MindMapDocument,
  options: LayoutOptions = {}
): BranchSide {
  const typography = options.typography ?? DEFAULT_TYPOGRAPHY;
  const spacing = options.spacing ?? DEFAULT_SPACING;
  const measured = measureTree(doc, typography, spacing);
  const firstLevel = getNode(doc, doc.rootId).childIds;

  const aggregate = (side: BranchSide) =>
    firstLevel
      .filter((id) => getNode(doc, id).side === side)
      .reduce((sum, id) => sum + (measured[id]?.subtreeHeight ?? 0), 0);

  const left = aggregate("left");
  const right = aggregate("right");
  if (right < left) return "right";
  if (left < right) return "left";

  // §7.2.3 tie-break: first branch right, second left, then alternate from the most recently
  // assigned side. Deterministic, which vision.md §4.10 requires of the whole engine.
  const assigned = firstLevel.map((id) => getNode(doc, id).side).filter((s): s is BranchSide => s !== null);
  const last = assigned.at(-1);
  if (!last) return "right";
  return last === "right" ? "left" : "right";
}

/**
 * §12 (amended) — the first-level side assignments to apply when entering two-sided layout.
 *
 * Right-only mode stores a placeholder `"right"` on every first-level branch, so a naive mode
 * switch renders the map exactly as before and reads as "nothing happened". When every
 * first-level branch shares one side there has never been a real side choice to preserve, so
 * they are rebalanced by the §7.2 measured-height rule (greedy, semantic order, height ties
 * alternate). Once branches exist on both sides the arrangement is treated as a user choice and
 * an empty map is returned — the caller then keeps every stored side verbatim.
 */
export function planTwoSidedSides(
  doc: MindMapDocument,
  options: LayoutOptions = {}
): Record<NodeId, BranchSide | null> {
  const firstLevel = getNode(doc, doc.rootId).childIds;
  if (firstLevel.length === 0) return {};

  const distinct = new Set(firstLevel.map((id) => getNode(doc, id).side));
  if (distinct.size > 1) return {};

  const typography = options.typography ?? DEFAULT_TYPOGRAPHY;
  const spacing = options.spacing ?? DEFAULT_SPACING;
  const measured = measureTree(doc, typography, spacing);

  const aggregate = { left: 0, right: 0 };
  let last: BranchSide | null = null;
  const sides: Record<NodeId, BranchSide> = {};
  for (const id of firstLevel) {
    const height = measured[id]?.subtreeHeight ?? 0;
    let side: BranchSide;
    if (aggregate.right < aggregate.left) side = "right";
    else if (aggregate.left < aggregate.right) side = "left";
    else side = !last ? "right" : last === "right" ? "left" : "right";
    sides[id] = side;
    aggregate[side] += height;
    last = side;
  }
  return sides;
}

/** Pass 1 — §8 measure. */
function measureTree(
  doc: MindMapDocument,
  typography: Typography | ((depth: number) => Typography),
  spacing: LayoutSpacing
): Record<NodeId, Measured> {
  const out: Record<NodeId, Measured> = {};

  const visit = (id: NodeId, depth: number): Measured => {
    const node = getNode(doc, id);
    const roleTypography = typeof typography === "function" ? typography(depth) : typography;
    const { width, height, lines } = measureNode(node.text, roleTypography);
    const childIds = layoutChildren(doc, id);
    for (const childId of childIds) visit(childId, depth + 1);

    const block = childBlockHeight(doc, childIds, out, spacing);
    // §6.2 — a subtree is as tall as the taller of the node itself and its children's block.
    const measured: Measured = { width, height, lines, subtreeHeight: Math.max(height, block) };
    out[id] = measured;
    return measured;
  };

  visit(doc.rootId, 0);
  return out;
}

/**
 * §10.1 — a horizontal-tangent cubic between two boxes, so the curve leaves the parent's
 * outward edge and arrives at the child's inward edge flat. Works unchanged on both sides
 * because "outward" and "inward" already encode the direction — except for the root in
 * two-sided mode, which faces both sides at once (§10.2).
 */
function connect(
  boxes: Record<NodeId, NodeBox>,
  connectors: Connector[],
  fromId: NodeId,
  toId: NodeId
): void {
  const from = boxes[fromId]!;
  const to = boxes[toId]!;
  // Only the root straddles both sides in two-sided mode; its stored outwardEdgeX is a single
  // value (the right edge), so it cannot face a left first-level branch. Every other node has
  // exactly one outward side, so its stored edge remains the source of truth. Pick the root
  // edge facing this child by comparing the child's inward edge with the root centre — the
  // horizontal gap guarantees the comparison is strict on either side.
  const fromCentreX = from.x + from.width / 2;
  const x1 = from.depth === 0 && to.inwardEdgeX < fromCentreX ? from.x : from.outwardEdgeX;
  const y1 = from.y + from.height / 2;
  const x2 = to.inwardEdgeX;
  const y2 = to.y + to.height / 2;
  const midX = (x1 + x2) / 2;
  connectors.push({ fromId, toId, path: { x1, y1, c1x: midX, c1y: y1, c2x: midX, c2y: y2, x2, y2 } });
}

/**
 * Builds the recursive placer shared by both layout modes.
 *
 * `dir` is +1 for the right side and -1 for the left. `anchorX` is the edge the node grows
 * *away* from, so a caller never has to know which end of the box it is handing over.
 *
 * §7.5 is the rule that survives the sign flip: within a side, siblings still render
 * top-to-bottom in semantic order. Left-side arrays are **not** reversed merely because the
 * geometry extends leftward — that would make the map disagree with its own Markdown.
 */
function makePlacer(
  doc: MindMapDocument,
  measured: Record<NodeId, Measured>,
  spacing: LayoutSpacing,
  boxes: Record<NodeId, NodeBox>,
  order: NodeId[],
  connectors: Connector[]
) {
  const place = (id: NodeId, anchorX: number, top: number, depth: number, dir: 1 | -1, side: BranchSide) => {
    const node = getNode(doc, id);
    const m = measured[id]!;
    // `top` is the top of this node's *subtree span*, not of its box: the node is centred
    // within that span, which is what makes a parent sit level with the middle of its children
    // rather than with the first one (§6.2).
    const y = top + (m.subtreeHeight - m.height) / 2;
    const left = dir === 1 ? anchorX : anchorX - m.width;

    boxes[id] = {
      nodeId: id,
      x: left,
      y,
      width: m.width,
      height: m.height,
      depth,
      side,
      lines: m.lines,
      directChildCount: node.childIds.length,
      collapsed: node.collapsed,
      // Outward is away from the root: the right edge on the right, the left edge on the left.
      outwardEdgeX: dir === 1 ? left + m.width : left,
      inwardEdgeX: dir === 1 ? left : left + m.width
    };
    order.push(id);

    const childIds = layoutChildren(doc, id);
    if (childIds.length === 0) return;

    // §6.1 / §7.4 — edge-based placement in whichever direction this side runs, with the
    // collapse lane reserved so hover never resizes a node.
    const childAnchor =
      dir === 1
        ? left + m.width + spacing.collapseLane + spacing.horizontalGap
        : left - spacing.collapseLane - spacing.horizontalGap;
    const block = childBlockHeight(doc, childIds, measured, spacing);
    let cursor = top + (m.subtreeHeight - block) / 2;

    for (let i = 0; i < childIds.length; i++) {
      const childId = childIds[i]!;
      place(childId, childAnchor, cursor, depth + 1, dir, side);
      connect(boxes, connectors, id, childId);
      cursor += measured[childId]!.subtreeHeight + gapAfter(doc, childIds, i, spacing);
    }
  };
  return place;
}

function finish(
  doc: MindMapDocument,
  boxes: Record<NodeId, NodeBox>,
  order: NodeId[],
  connectors: Connector[]
): LayoutResult {
  const all = Object.values(boxes);
  return {
    revision: doc.revision,
    boxes,
    order,
    connectors,
    bounds: {
      minX: Math.min(...all.map((b) => b.x)),
      minY: Math.min(...all.map((b) => b.y)),
      maxX: Math.max(...all.map((b) => b.x + b.width)),
      maxY: Math.max(...all.map((b) => b.y + b.height))
    }
  };
}

function layoutRightOnly(doc: MindMapDocument, options: LayoutOptions = {}): LayoutResult {
  const typography = options.typography ?? DEFAULT_TYPOGRAPHY;
  const spacing = options.spacing ?? DEFAULT_SPACING;

  const measured = measureTree(doc, typography, spacing);
  const boxes: Record<NodeId, NodeBox> = {};
  const order: NodeId[] = [];
  const connectors: Connector[] = [];
  const rootMeasured = measured[doc.rootId]!;

  // §3 — the root *centre* is the origin. `place` takes the top of the subtree span, so the
  // offset is half the span, and the node ends up centred on zero whatever the tree's shape.
  makePlacer(doc, measured, spacing, boxes, order, connectors)(
    doc.rootId,
    -rootMeasured.width / 2,
    -rootMeasured.subtreeHeight / 2,
    0,
    1,
    "right"
  );

  return finish(doc, boxes, order, connectors);
}

/** The §3 invariant, exposed so tests and a development build can assert it directly. */
export function rootCentre(result: LayoutResult, rootId: NodeId): { x: number; y: number } {
  const box = result.boxes[rootId];
  if (!box) throw new Error("Layout has no box for the root");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Geometry difference between two layouts — the stability measurement of §11. */
export function diffLayouts(
  a: LayoutResult,
  b: LayoutResult,
  only?: (id: NodeId) => boolean
): { shared: number; moved: number; maxShift: number } {
  const shared = Object.keys(a.boxes).filter((id) => id in b.boxes && (!only || only(id)));
  let moved = 0;
  let maxShift = 0;
  for (const id of shared) {
    const p = a.boxes[id]!;
    const q = b.boxes[id]!;
    const distance = Math.hypot(p.x - q.x, p.y - q.y);
    if (distance > 0.01) {
      moved++;
      maxShift = Math.max(maxShift, distance);
    }
  }
  return { shared: shared.length, moved, maxShift };
}

/**
 * §7 — two-sided layout.
 *
 * First-level branches are partitioned by their **persisted** side (§7.1); descendants inherit
 * it. Each side's block is centred on the root centre, which §3 fixes at the origin — so a
 * branch growing on one side does not translate the other, and §7.6 and §11.5 hold together.
 * (Phase 0 spike 3 got that wrong by centring on the combined extent instead; see its Finding 2.)
 */
function layoutTwoSided(doc: MindMapDocument, options: LayoutOptions = {}): LayoutResult {
  const typography = options.typography ?? DEFAULT_TYPOGRAPHY;
  const spacing = options.spacing ?? DEFAULT_SPACING;

  const measured = measureTree(doc, typography, spacing);
  const boxes: Record<NodeId, NodeBox> = {};
  const order: NodeId[] = [];
  const connectors: Connector[] = [];
  const rootMeasured = measured[doc.rootId]!;
  const root = getNode(doc, doc.rootId);

  // §3 — root centre at the origin.
  boxes[doc.rootId] = {
    nodeId: doc.rootId,
    x: -rootMeasured.width / 2,
    y: -rootMeasured.height / 2,
    width: rootMeasured.width,
    height: rootMeasured.height,
    depth: 0,
    side: "right",
    lines: rootMeasured.lines,
    directChildCount: root.childIds.length,
    collapsed: false,
    outwardEdgeX: rootMeasured.width / 2,
    inwardEdgeX: -rootMeasured.width / 2
  };
  order.push(doc.rootId);

  const place = makePlacer(doc, measured, spacing, boxes, order, connectors);

  for (const side of ["right", "left"] as const) {
    const dir = side === "right" ? 1 : -1;
    // §7.1 + §7.5 — filter to the side, preserving semantic order. No reversal.
    const ids = layoutChildren(doc, doc.rootId).filter((id) => getNode(doc, id).side === side);
    if (ids.length === 0) continue;

    let block = 0;
    for (let i = 0; i < ids.length; i++) {
      block += measured[ids[i]!]!.subtreeHeight + gapAfter(doc, ids, i, spacing);
    }

    const anchorX =
      dir === 1
        ? rootMeasured.width / 2 + spacing.collapseLane + spacing.horizontalGap
        : -rootMeasured.width / 2 - spacing.collapseLane - spacing.horizontalGap;

    // Each side is centred on the root centre independently, which is what keeps the sides
    // from moving each other.
    let cursor = -block / 2;
    for (let i = 0; i < ids.length; i++) {
      place(ids[i]!, anchorX, cursor, 1, dir, side);
      connect(boxes, connectors, doc.rootId, ids[i]!);
      cursor += measured[ids[i]!]!.subtreeHeight + gapAfter(doc, ids, i, spacing);
    }
  }

  return finish(doc, boxes, order, connectors);
}

/** Dispatches on the document's own layout mode, so callers never choose. */
export function layout(doc: MindMapDocument, options: LayoutOptions = {}): LayoutResult {
  return doc.layout.mode === "two-sided" ? layoutTwoSided(doc, options) : layoutRightOnly(doc, options);
}
