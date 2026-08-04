import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Connector, LayoutResult, NodeBox } from "../layout/layout";
import {
  getNode,
  subtreeIds,
  visibleNodes,
  type BranchSide,
  type MindMapDocument,
  type NodeId
} from "../model/types";
import { resolveDropTarget, type DropZone } from "../model/commands";
import { pan, screenToDocument, toViewBox, zoomAbout, type Viewport, type ViewportSize } from "./viewport";
import { branchColorFor, connectorColorFor } from "../theme/branch-colors";
import type { MindMapTheme, NodeStyleTokens } from "../theme/types";
import { autopanDelta, crossedDragThreshold, sideDropTarget } from "./drag";

/**
 * SVG rendering of a computed layout.
 *
 * **Node coordinates never enter React state.** `spec/product-specification.md` §19 requires
 * typing to stay responsive at 500 nodes and forbids a full-document rerender on every caret
 * movement. Layout is computed outside the component tree and handed in whole; each node is a
 * memoised component keyed on its own box, so editing one label re-renders one node rather than
 * the map. Spike 3 measured layout itself at 0.70 ms for 500 nodes — reconciliation, not
 * geometry, is the budget that needs defending.
 *
 * **Colours come from the theme object, not from CSS.** The same tokens feed the SVG exporter,
 * so what is on screen and what lands in a file cannot diverge (theme.md §2.7). A `var(--x)`
 * here would render fine and export unstyled — see D-05.
 */

/** §6 — root, first level, and everything deeper. Not a style per depth. */
function roleTokens(theme: MindMapTheme, depth: number): NodeStyleTokens {
  if (depth === 0) return theme.nodes.root;
  if (depth === 1) return theme.nodes.level1;
  return theme.nodes.default;
}

function roleTypography(theme: MindMapTheme, depth: number) {
  const t = theme.typography;
  if (depth === 0) return { size: t.rootFontSize, weight: t.rootFontWeight };
  if (depth === 1) return { size: t.level1FontSize, weight: t.level1FontWeight };
  return { size: t.nodeFontSize, weight: t.nodeFontWeight };
}

interface NodeProps {
  box: NodeBox;
  theme: MindMapTheme;
  selected: boolean;
  /** §7.2/§7.3 — dimmed while it is the node being dragged, so the drop indicator reads clearly. */
  dragging: boolean;
  positionInSet: number;
  setSize: number;
  onSelect: (id: NodeId) => void;
  onEdit: (id: NodeId) => void;
  onToggleCollapse: (id: NodeId) => void;
  onNodePointerDown: (id: NodeId, event: React.PointerEvent<SVGGElement>) => void;
}

const Node = memo(function Node({
  box,
  theme,
  selected,
  dragging,
  positionInSet,
  setSize,
  onSelect,
  onEdit,
  onToggleCollapse,
  onNodePointerDown
}: NodeProps) {
  const tokens = roleTokens(theme, box.depth);
  const { size, weight } = roleTypography(theme, box.depth);
  const { lineHeight } = theme.typography;
  const { paddingX, paddingY } = tokens;
  const accessibleLabel = [
    box.lines.join(" ").trim() || theme.nodes.emptyPlaceholderText,
    `level ${box.depth + 1}`,
    box.depth === 1 ? `${box.side} side` : null,
    box.directChildCount > 0 ? (box.collapsed ? "collapsed" : "expanded") : "leaf",
    box.directChildCount > 0
      ? `${box.directChildCount} direct ${box.directChildCount === 1 ? "child" : "children"}`
      : null,
    selected ? "selected" : null
  ].filter(Boolean).join(", ");

  return (
    <g
      id={`map-node-${box.nodeId}`}
      role="treeitem"
      aria-label={accessibleLabel}
      aria-level={box.depth + 1}
      aria-selected={selected}
      aria-expanded={box.directChildCount > 0 ? !box.collapsed : undefined}
      aria-posinset={positionInSet}
      aria-setsize={setSize}
      onPointerDown={(event) => {
        event.stopPropagation();
        // The browser's own default action for a mousedown/pointerdown is to move focus to the
        // clicked element or, since none of the SVG content here is focusable, to blur to body —
        // and it runs *after* this handler, so without preventDefault it wins over the surface's
        // own `.focus()` call in `onSelect`. Same reason the toolbar buttons below do this.
        event.preventDefault();
        onSelect(box.nodeId);
        onNodePointerDown(box.nodeId, event);
      }}
      onDoubleClick={(event) => {
        event.stopPropagation();
        event.preventDefault();
        onEdit(box.nodeId);
      }}
      style={{ cursor: "default", opacity: dragging ? 0.4 : 1 }}
    >
      <rect
        x={box.x}
        y={box.y}
        width={box.width}
        height={box.height}
        rx={tokens.radius}
        fill={tokens.background}
        stroke={tokens.border}
        strokeWidth={tokens.borderWidth}
      />
      {selected && (
        <rect
          x={box.x - 3}
          y={box.y - 3}
          width={box.width + 6}
          height={box.height + 6}
          rx={tokens.radius + 3}
          fill="none"
          stroke={theme.interaction.selectedOutline}
          strokeWidth={theme.interaction.selectedOutlineWidth}
          pointerEvents="none"
        />
      )}
      <text
        x={box.x + paddingX}
        y={box.y + paddingY + (size * lineHeight) / 2}
        fontFamily={theme.typography.fontFamily}
        fontSize={size}
        fontWeight={weight}
        fill={tokens.text}
        dominantBaseline="central"
      >
        {box.lines.map((line, index) => (
          // Wrapping is decided by the measurement layer, so the renderer only positions the
          // lines it was given — the two can never disagree about where a break went.
          <tspan key={index} x={box.x + paddingX} dy={index === 0 ? 0 : size * lineHeight}>
            {line === "" ? " " : line}
          </tspan>
        ))}
      </text>

      {/*
        §9.1 — only a node with children has a control, **and the root never does**: "The root
        remains expanded in MVP." Rendering one on the root was visible in the very first
        two-sided screenshot; it offers an action the model refuses to perform.
      */}
      {box.directChildCount > 0 && box.depth > 0 && (
        <CollapseControl box={box} theme={theme} onToggle={onToggleCollapse} />
      )}
    </g>
  );
});

/**
 * §9.2–§9.4 — the control sits on the outward edge, in the lane layout reserved for it, so
 * showing it on hover cannot change the node's width. A collapsed node shows its direct-child
 * count; an expanded one shows a minus.
 */
function CollapseControl({
  box,
  theme,
  onToggle
}: {
  box: NodeBox;
  theme: MindMapTheme;
  onToggle: (id: NodeId) => void;
}) {
  // §9.2 — the control sits on the *outward* edge, which points away from the root. On the left
  // side that is the node's left edge, so the offset has to mirror or the badge lands inside
  // the node.
  const cx = box.outwardEdgeX + (box.side === "left" ? -8 : 8);
  const cy = box.y + box.height / 2;
  const nodeLabel = box.lines.join(" ").trim() || theme.nodes.emptyPlaceholderText;
  const label = box.collapsed
    ? `Expand '${nodeLabel}', ${box.directChildCount} direct ${box.directChildCount === 1 ? "child" : "children"}`
    : `Collapse '${nodeLabel}', ${box.directChildCount} direct ${box.directChildCount === 1 ? "child" : "children"}`;

  return (
    <g
      onPointerDown={(event) => {
        // Without this the click would fall through to the node and enter selection/editing —
        // `vision.md` §9 lists that exact confusion as a product regression.
        event.stopPropagation();
        // See the Node handler above: without this the browser's default focus/blur action
        // fires after `onToggle` and undoes the surface's own `.focus()` call.
        event.preventDefault();
        onToggle(box.nodeId);
      }}
      onDoubleClick={(event) => {
        // A double-click on the collapse affordance remains a collapse gesture; it must not
        // bubble to the node and unexpectedly open text editing.
        event.stopPropagation();
        event.preventDefault();
      }}
      style={{ cursor: "pointer" }}
      role="button"
      aria-label={label}
    >
      <circle cx={cx} cy={cy} r={12} fill="transparent" />
      <circle
        cx={cx}
        cy={cy}
        r={theme.controls.collapseSize / 2}
        fill={theme.controls.collapseBackground}
        stroke={theme.controls.collapseBorder}
        strokeWidth={1.25}
      />
      {box.collapsed ? (
        <text
          x={cx}
          y={cy}
          fontFamily={theme.typography.fontFamily}
          fontSize={theme.controls.collapseFontSize}
          fill={theme.controls.collapseText}
          textAnchor="middle"
          dominantBaseline="central"
        >
          {box.directChildCount > 99 ? "99+" : box.directChildCount}
        </text>
      ) : (
        <line
          x1={cx - 3.5}
          y1={cy}
          x2={cx + 3.5}
          y2={cy}
          stroke={theme.controls.collapseText}
          strokeWidth={1.5}
        />
      )}
    </g>
  );
}

const Edge = memo(function Edge({
  connector,
  color,
  width,
  opacity
}: {
  connector: Connector;
  color: string;
  width: number;
  opacity: number;
}) {
  const { x1, y1, c1x, c1y, c2x, c2y, x2, y2 } = connector.path;
  return (
    <path
      d={`M${x1},${y1} C${c1x},${c1y} ${c2x},${c2y} ${x2},${y2}`}
      fill="none"
      stroke={color}
      strokeWidth={width}
      opacity={opacity}
    />
  );
});

/**
 * §7.2/§7.3 — the target indicator that "MUST distinguish 'before,' 'after,' and 'inside as
 * child.'" Before/after is a line at the edge the node will land on; inside is an outline around
 * the whole box, since that is the shape a new child's parent takes. Interaction tokens per
 * design-tokens.md §2/§6: excluded from export, defined per document theme so they stay legible
 * against whichever canvas/node colours that theme picked.
 */
function DropIndicator({
  box,
  zone,
  valid,
  theme
}: {
  box: NodeBox;
  zone: DropZone;
  valid: boolean;
  theme: MindMapTheme;
}) {
  const gap = 6;
  const stroke = valid ? theme.interaction.dropIndicator : theme.interaction.invalidDropIndicator;
  if (zone === "inside") {
    return (
      <g>
        <rect
          x={box.x - gap}
          y={box.y - gap}
          width={box.width + gap * 2}
          height={box.height + gap * 2}
          rx={(roleTokens(theme, box.depth).radius ?? 6) + gap}
          fill="none"
          stroke={stroke}
          strokeWidth={2}
          strokeDasharray={valid ? "4 3" : "2 3"}
        />
        {!valid && (
          <>
            <line
              x1={box.x - gap}
              y1={box.y - gap}
              x2={box.x + box.width + gap}
              y2={box.y + box.height + gap}
              stroke={stroke}
              strokeWidth={2}
            />
            <line
              x1={box.x + box.width + gap}
              y1={box.y - gap}
              x2={box.x - gap}
              y2={box.y + box.height + gap}
              stroke={stroke}
              strokeWidth={2}
            />
          </>
        )}
      </g>
    );
  }
  const y = zone === "before" ? box.y - gap : box.y + box.height + gap;
  return (
    <g>
      <line
        x1={box.x}
        y1={y}
        x2={box.x + box.width}
        y2={y}
        stroke={stroke}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeDasharray={valid ? undefined : "3 3"}
      />
      {!valid && (
        <line
          x1={box.x + box.width / 2 - 5}
          y1={y - 5}
          x2={box.x + box.width / 2 + 5}
          y2={y + 5}
          stroke={stroke}
          strokeWidth={2}
        />
      )}
    </g>
  );
}

function DragPreview({
  x,
  y,
  label,
  count,
  theme
}: {
  x: number;
  y: number;
  label: string;
  count: number;
  theme: MindMapTheme;
}) {
  const displayLabel = label.trim() || theme.nodes.emptyPlaceholderText;
  const clipped = displayLabel.length > 32 ? `${displayLabel.slice(0, 31)}…` : displayLabel;
  const width = Math.max(112, Math.min(300, clipped.length * 8 + 28));
  return (
    <g transform={`translate(${x + 14} ${y + 14})`} pointerEvents="none">
      <rect
        width={width}
        height={48}
        rx={8}
        fill={theme.interaction.dragPreviewBackground}
        stroke={theme.interaction.dropIndicator}
        strokeWidth={1.5}
      />
      <text
        x={12}
        y={18}
        fill={theme.nodes.default.text}
        fontFamily={theme.typography.fontFamily}
        fontSize={theme.typography.nodeFontSize}
        fontWeight={600}
      >
        {clipped}
      </text>
      <text
        x={12}
        y={37}
        fill={theme.nodes.default.text}
        opacity={0.75}
        fontFamily={theme.typography.fontFamily}
        fontSize={11}
      >
        {count} {count === 1 ? "node" : "nodes"}
      </text>
    </g>
  );
}

function SideDropIndicator({
  root,
  side,
  theme
}: {
  root: NodeBox;
  side: BranchSide;
  theme: MindMapTheme;
}) {
  const width = Math.max(96, root.width * 0.9);
  const x = side === "left" ? root.x - width - 22 : root.x + root.width + 22;
  return (
    <g pointerEvents="none">
      <rect
        x={x}
        y={root.y - 18}
        width={width}
        height={root.height + 36}
        rx={10}
        fill={theme.interaction.dragPreviewBackground}
        stroke={theme.interaction.dropIndicator}
        strokeWidth={2}
        strokeDasharray="6 4"
      />
      <text
        x={x + width / 2}
        y={root.y + root.height / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fill={theme.nodes.root.text}
        fontFamily={theme.typography.fontFamily}
        fontSize={12}
        fontWeight={600}
      >
        Move {side}
      </text>
    </g>
  );
}

export interface MapCanvasProps {
  doc: MindMapDocument;
  theme: MindMapTheme;
  layout: LayoutResult;
  selection: NodeId | null;
  viewport: Viewport;
  /**
   * An updater, not a value. Several `pointermove` events can land in one React batch, and a
   * value-taking callback makes each of them read the same stale viewport — so a fast drag
   * applies only its last step and loses the rest. Found by dispatching two moves in one tick.
   */
  onViewport: (update: (current: Viewport) => Viewport) => void;
  /** Reported upward so commands like fit and reveal can use the real pixel size. */
  onSize: (size: ViewportSize) => void;
  onSelect: (id: NodeId) => void;
  /** Double-click edits without replacing the existing label. */
  onEdit: (id: NodeId) => void;
  onSelectNone: () => void;
  onToggleCollapse: (id: NodeId) => void;
  /** §7.2/§7.3 — the drop, already resolved to a legal `{ parentId, index }` by `resolveDropTarget`. */
  onReparent: (nodeId: NodeId, parentId: NodeId, index: number) => void;
  /** §11.2 — first-level branches may cross the root without changing parent/order. */
  onMoveSide: (nodeId: NodeId, side: BranchSide) => void;
  onInvalidDrop: () => void;
}

/** Tracks the element's pixel size, which every viewport calculation needs. */
function useElementSize(ref: React.RefObject<Element | null>): ViewportSize {
  const [size, setSize] = useState<ViewportSize>({ width: 1000, height: 600 });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const rect = entry?.contentRect;
      if (rect && rect.width > 0 && rect.height > 0) setSize({ width: rect.width, height: rect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

interface NodeDropPreview {
  kind: "node";
  targetId: NodeId;
  zone: DropZone;
  valid: boolean;
  parentId?: NodeId;
  index?: number;
}

interface SideDropPreview {
  kind: "side";
  side: BranchSide;
}

type DropPreview = NodeDropPreview | SideDropPreview;

export const MapCanvas = memo(function MapCanvas({
  doc,
  theme,
  layout,
  selection,
  viewport,
  onViewport,
  onSize,
  onSelect,
  onEdit,
  onSelectNone,
  onToggleCollapse,
  onReparent,
  onMoveSide,
  onInvalidDrop
}: MapCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const size = useElementSize(svgRef);
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;
  const drag = useRef<{ pointerId: number; x: number; y: number; moved: boolean } | null>(null);
  /**
   * A separate gesture from canvas pan, tracked in its own ref for the same reason `drag` is a
   * ref and not state: a fast pointermove can deliver several events in one React batch, and
   * only a ref reads back the value written a moment ago rather than the one from render start.
   */
  const nodeDrag = useRef<{
    pointerId: number;
    nodeId: NodeId;
    startX: number;
    startY: number;
    clientX: number;
    clientY: number;
    moved: boolean;
  } | null>(null);
  const dropPreviewRef = useRef<DropPreview | null>(null);
  const autopanFrame = useRef<number | null>(null);
  const [draggingId, setDraggingId] = useState<NodeId | null>(null);
  const [dropPreview, setDropPreview] = useState<DropPreview | null>(null);
  const [dragPoint, setDragPoint] = useState<{ x: number; y: number } | null>(null);
  const semanticOrder = useMemo(
    () => visibleNodes(doc).filter((nodeId) => layout.boxes[nodeId] !== undefined),
    [doc, layout.boxes]
  );

  useEffect(() => onSize(size), [size, onSize]);

  /**
   * §7.2/§7.3 — which node is under a document-space point, and which of its three zones (top
   * "before", middle "inside", bottom "after") the point falls in. Root is excluded from
   * before/after: it has no parent, so only "inside" — becoming first-level — is meaningful for
   * it (matching `resolveDropTarget`'s own guard, so a caller cannot reach a target this rejects
   * anyway).
   */
  const hitTest = useCallback(
    (docX: number, docY: number): { nodeId: NodeId; zone: DropZone } | null => {
      for (const nodeId of semanticOrder) {
        const box = layout.boxes[nodeId]!;
        if (docX < box.x || docX > box.x + box.width || docY < box.y || docY > box.y + box.height) continue;
        if (nodeId === doc.rootId) return { nodeId, zone: "inside" };
        const relY = (docY - box.y) / box.height;
        const zone: DropZone = relY < 0.3 ? "before" : relY > 0.7 ? "after" : "inside";
        return { nodeId, zone };
      }
      return null;
    },
    [layout.boxes, semanticOrder, doc.rootId]
  );

  const updateDropPreview = useCallback(
    (nodeId: NodeId, clientX: number, clientY: number) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const point = screenToDocument(
        viewportRef.current,
        size,
        clientX - rect.left,
        clientY - rect.top
      );
      setDragPoint(point);

      const source = getNode(doc, nodeId);
      const root = layout.boxes[doc.rootId];
      let next: DropPreview | null = null;
      const side =
        root &&
        sideDropTarget(
          source.side,
          source.parentId === doc.rootId,
          doc.layout.mode === "two-sided",
          point,
          root
        );
      if (side) {
        next = { kind: "side", side };
      } else {
        const hit = hitTest(point.x, point.y);
        if (hit) {
          const resolved = resolveDropTarget(doc, nodeId, hit.nodeId, hit.zone);
          next = resolved
            ? {
                kind: "node",
                targetId: hit.nodeId,
                zone: hit.zone,
                valid: true,
                parentId: resolved.parentId,
                index: resolved.index
              }
            : {
                kind: "node",
                targetId: hit.nodeId,
                zone: hit.zone,
                valid: false
              };
        }
      }

      dropPreviewRef.current = next;
      setDropPreview(next);
    },
    [doc, hitTest, layout.boxes, size]
  );

  const onNodePointerDown = useCallback((nodeId: NodeId, event: React.PointerEvent<SVGGElement>) => {
    if (event.button !== 0) return;
    nodeDrag.current = {
      pointerId: event.pointerId,
      nodeId,
      startX: event.clientX,
      startY: event.clientY,
      clientX: event.clientX,
      clientY: event.clientY,
      moved: false
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const stopAutopan = useCallback(() => {
    if (autopanFrame.current !== null) {
      cancelAnimationFrame(autopanFrame.current);
      autopanFrame.current = null;
    }
  }, []);

  const scheduleAutopan = useCallback(() => {
    if (autopanFrame.current !== null) return;

    const tick = () => {
      const state = nodeDrag.current;
      const svg = svgRef.current;
      if (!state?.moved || !svg) {
        autopanFrame.current = null;
        return;
      }
      const rect = svg.getBoundingClientRect();
      const delta = autopanDelta(
        state.clientX - rect.left,
        state.clientY - rect.top,
        rect.width,
        rect.height
      );
      if (delta.x === 0 && delta.y === 0) {
        autopanFrame.current = null;
        return;
      }
      onViewport((current) => pan(current, delta.x, delta.y));
      updateDropPreview(state.nodeId, state.clientX, state.clientY);
      autopanFrame.current = requestAnimationFrame(tick);
    };

    autopanFrame.current = requestAnimationFrame(tick);
  }, [onViewport, updateDropPreview]);

  const finishNodeDrag = useCallback(
    (commit: boolean) => {
      const state = nodeDrag.current;
      const preview = dropPreviewRef.current;
      nodeDrag.current = null;
      stopAutopan();

      if (commit && state?.moved && preview) {
        if (preview.kind === "side") {
          onMoveSide(state.nodeId, preview.side);
        } else if (
          preview.valid &&
          preview.parentId !== undefined &&
          preview.index !== undefined
        ) {
          onReparent(state.nodeId, preview.parentId, preview.index);
        } else if (!preview.valid) {
          onInvalidDrop();
        }
      }

      dropPreviewRef.current = null;
      setDraggingId(null);
      setDropPreview(null);
      setDragPoint(null);
    },
    [onInvalidDrop, onMoveSide, onReparent, stopAutopan]
  );

  useEffect(() => {
    if (!draggingId) return;
    const cancelOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      finishNodeDrag(false);
    };
    window.addEventListener("keydown", cancelOnEscape, true);
    return () => window.removeEventListener("keydown", cancelOnEscape, true);
  }, [draggingId, finishNodeDrag]);

  useEffect(() => () => stopAutopan(), [stopAutopan]);

  /**
   * §12.1 — a drag on blank canvas pans, and "starting a pan MUST not clear selection until the
   * gesture is interpreted as a blank click rather than a drag". So selection is cleared on
   * pointer *up*, and only if the pointer never moved past the threshold.
   */
  const onPointerDown = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 && event.button !== 1) return;
    // See the Node handler above: nothing in the SVG is a focusable target, so without this the
    // browser's default action blurs focus to body between this event and the `onSelectNone`
    // call on pointer-up that is meant to keep it on the surface.
    event.preventDefault();
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const onPointerMove = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      const nodeState = nodeDrag.current;
      if (nodeState && nodeState.pointerId === event.pointerId) {
        nodeState.clientX = event.clientX;
        nodeState.clientY = event.clientY;
        if (
          !nodeState.moved &&
          !crossedDragThreshold(
            nodeState.startX,
            nodeState.startY,
            event.clientX,
            event.clientY
          )
        ) {
          return;
        }
        nodeState.moved = true;
        setDraggingId((current) => (current === nodeState.nodeId ? current : nodeState.nodeId));
        updateDropPreview(nodeState.nodeId, event.clientX, event.clientY);
        scheduleAutopan();
        return;
      }

      const state = drag.current;
      if (!state || state.pointerId !== event.pointerId) return;
      const dx = event.clientX - state.x;
      const dy = event.clientY - state.y;
      // A few pixels of slop, so a click with a shaky hand is still a click.
      if (!state.moved && !crossedDragThreshold(state.x, state.y, event.clientX, event.clientY)) {
        return;
      }
      state.moved = true;
      state.x = event.clientX;
      state.y = event.clientY;
      onViewport((current) => pan(current, dx, dy));
    },
    [onViewport, scheduleAutopan, updateDropPreview]
  );

  const onPointerUp = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      const nodeState = nodeDrag.current;
      if (nodeState && nodeState.pointerId === event.pointerId) {
        finishNodeDrag(true);
        return;
      }

      const state = drag.current;
      drag.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      if (state && !state.moved) onSelectNone();
    },
    [finishNodeDrag, onSelectNone]
  );

  const onPointerCancel = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (nodeDrag.current?.pointerId === event.pointerId) {
        finishNodeDrag(false);
        return;
      }
      if (drag.current?.pointerId === event.pointerId) drag.current = null;
    },
    [finishNodeDrag]
  );

  /**
   * §12.2 — Ctrl/Cmd+wheel zooms, as does a trackpad pinch, which browsers deliver as a wheel
   * event with ctrlKey set. A plain wheel scrolls the map instead, which is what a two-finger
   * swipe should do.
   */
  const onWheel = useCallback(
    (event: React.WheelEvent<SVGSVGElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      if (event.ctrlKey || event.metaKey) {
        const factor = Math.exp(-event.deltaY / 200);
        onViewport((current) => zoomAbout(current, size, factor, x, y));
      } else {
        onViewport((current) => pan(current, -event.deltaX, -event.deltaY));
      }
    },
    [size, onViewport]
  );
  return (
    <svg
      ref={svgRef}
      viewBox={toViewBox(viewport, size)}
      width="100%"
      height="100%"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onWheel={onWheel}
      style={{ display: "block", touchAction: "none", background: theme.canvas.background }}
      role="group"
      aria-label="Mind map drawing"
    >
      {/* Connectors first so nodes paint over them. */}
      {layout.connectors.map((connector) => (
        <Edge
          key={`${connector.fromId}->${connector.toId}`}
          connector={connector}
          // §8.1 — a connector takes its branch's colour, so a subtree reads as one limb.
          color={connectorColorFor(doc, theme, connector.toId)}
          width={connector.fromId === doc.rootId ? theme.connectors.rootWidth : theme.connectors.width}
          opacity={
            theme.branches.descendantTintPolicy === "same-with-opacity" &&
            branchColorFor(doc, theme, connector.toId) !== null &&
            layout.boxes[connector.toId]!.depth > 1
              ? 0.65
              : theme.connectors.opacity
          }
        />
      ))}
      {semanticOrder.map((id) => {
        const node = getNode(doc, id);
        const siblings =
          node.parentId === null ? [id] : getNode(doc, node.parentId).childIds;
        return (
          <Node
            key={id}
            box={layout.boxes[id]!}
            theme={theme}
            selected={id === selection}
            dragging={id === draggingId}
            positionInSet={siblings.indexOf(id) + 1}
            setSize={siblings.length}
            onSelect={onSelect}
            onEdit={onEdit}
            onToggleCollapse={onToggleCollapse}
            onNodePointerDown={onNodePointerDown}
          />
        );
      })}
      {/* Drawn last so the indicator paints over both nodes and connectors. */}
      {dropPreview?.kind === "node" && layout.boxes[dropPreview.targetId] && (
        <DropIndicator
          box={layout.boxes[dropPreview.targetId]!}
          zone={dropPreview.zone}
          valid={dropPreview.valid}
          theme={theme}
        />
      )}
      {dropPreview?.kind === "side" && layout.boxes[doc.rootId] && (
        <SideDropIndicator
          root={layout.boxes[doc.rootId]!}
          side={dropPreview.side}
          theme={theme}
        />
      )}
      {draggingId && dragPoint && doc.nodes[draggingId] && (
        <DragPreview
          x={dragPoint.x}
          y={dragPoint.y}
          label={doc.nodes[draggingId]!.text}
          count={subtreeIds(doc, draggingId).length}
          theme={theme}
        />
      )}
    </svg>
  );
});
