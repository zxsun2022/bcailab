import { measureNode, type Typography } from "./measure";
import { getNode, type MindMapDocument, type NodeId } from "../model/types";

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
  typography?: Typography;
  spacing?: LayoutSpacing;
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

/** Pass 1 — §8 measure. */
function measureTree(
  doc: MindMapDocument,
  typography: Typography,
  spacing: LayoutSpacing
): Record<NodeId, Measured> {
  const out: Record<NodeId, Measured> = {};

  const visit = (id: NodeId): Measured => {
    const node = getNode(doc, id);
    const { width, height, lines } = measureNode(node.text, typography);
    const childIds = layoutChildren(doc, id);
    for (const childId of childIds) visit(childId);

    const block = childBlockHeight(doc, childIds, out, spacing);
    // §6.2 — a subtree is as tall as the taller of the node itself and its children's block.
    const measured: Measured = { width, height, lines, subtreeHeight: Math.max(height, block) };
    out[id] = measured;
    return measured;
  };

  visit(doc.rootId);
  return out;
}

export function layout(doc: MindMapDocument, options: LayoutOptions = {}): LayoutResult {
  const typography = options.typography ?? DEFAULT_TYPOGRAPHY;
  const spacing = options.spacing ?? DEFAULT_SPACING;

  const measured = measureTree(doc, typography, spacing);
  const boxes: Record<NodeId, NodeBox> = {};
  const order: NodeId[] = [];
  const connectors: Connector[] = [];

  const rootMeasured = measured[doc.rootId]!;

  /**
   * `top` is the top of this node's *subtree span*, not of the node box. The node is centred
   * within that span, which is what makes a parent sit level with the middle of its children
   * rather than with the first one (§6.2).
   */
  const place = (id: NodeId, left: number, top: number, depth: number) => {
    const node = getNode(doc, id);
    const m = measured[id]!;
    const y = top + (m.subtreeHeight - m.height) / 2;

    boxes[id] = {
      nodeId: id,
      x: left,
      y,
      width: m.width,
      height: m.height,
      depth,
      lines: m.lines,
      directChildCount: node.childIds.length,
      collapsed: node.collapsed,
      outwardEdgeX: left + m.width,
      inwardEdgeX: left
    };
    order.push(id);

    const childIds = layoutChildren(doc, id);
    if (childIds.length === 0) return;

    // §6.1 — edge-based placement, with the collapse lane reserved so hover never resizes.
    const childLeft = left + m.width + spacing.collapseLane + spacing.horizontalGap;
    const block = childBlockHeight(doc, childIds, measured, spacing);
    let cursor = top + (m.subtreeHeight - block) / 2;

    for (let i = 0; i < childIds.length; i++) {
      const childId = childIds[i]!;
      place(childId, childLeft, cursor, depth + 1);

      // §10.3 — a horizontal-tangent cubic, so the curve leaves and arrives flat.
      const parentBox = boxes[id]!;
      const childBox = boxes[childId]!;
      const x1 = parentBox.outwardEdgeX;
      const y1 = parentBox.y + parentBox.height / 2;
      const x2 = childBox.inwardEdgeX;
      const y2 = childBox.y + childBox.height / 2;
      const midX = (x1 + x2) / 2;
      connectors.push({
        fromId: id,
        toId: childId,
        path: { x1, y1, c1x: midX, c1y: y1, c2x: midX, c2y: y2, x2, y2 }
      });

      cursor += measured[childId]!.subtreeHeight + gapAfter(doc, childIds, i, spacing);
    }
  };

  // §3 — the root *centre* is the origin. `place` takes the top of the subtree span, so the
  // offset is half the span, and the node ends up centred on zero regardless of tree shape.
  place(doc.rootId, -rootMeasured.width / 2, -rootMeasured.subtreeHeight / 2, 0);

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
