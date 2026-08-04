import { memo, useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_TYPOGRAPHY, type Connector, type LayoutResult, type NodeBox } from "../layout/layout";
import type { MindMapDocument, NodeId } from "../model/types";
import { resolveDropTarget, type DropZone } from "../model/commands";
import { pan, screenToDocument, toViewBox, zoomAbout, type Viewport, type ViewportSize } from "./viewport";
import { branchColorFor, connectorColorFor } from "../theme/branch-colors";
import type { MindMapTheme, NodeStyleTokens } from "../theme/types";

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
  onSelect: (id: NodeId) => void;
  onToggleCollapse: (id: NodeId) => void;
  onNodePointerDown: (id: NodeId, event: React.PointerEvent<SVGGElement>) => void;
}

const Node = memo(function Node({
  box,
  theme,
  selected,
  dragging,
  onSelect,
  onToggleCollapse,
  onNodePointerDown
}: NodeProps) {
  const tokens = roleTokens(theme, box.depth);
  const { size, weight } = roleTypography(theme, box.depth);
  const { lineHeight } = theme.typography;
  const { paddingX, paddingY } = DEFAULT_TYPOGRAPHY;

  return (
    <g
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
      style={{ cursor: "default", opacity: dragging ? 0.4 : 1 }}
    >
      <rect
        x={box.x}
        y={box.y}
        width={box.width}
        height={box.height}
        rx={tokens.radius}
        fill={tokens.background}
        stroke={selected ? theme.interaction.selectedOutline : tokens.border}
        strokeWidth={selected ? theme.interaction.selectedOutlineWidth : tokens.borderWidth}
      />
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
  const label = box.collapsed
    ? `Expand branch with ${box.directChildCount} direct ${box.directChildCount === 1 ? "child" : "children"}`
    : `Collapse branch with ${box.directChildCount} direct ${box.directChildCount === 1 ? "child" : "children"}`;

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
      style={{ cursor: "pointer" }}
      role="button"
      aria-label={label}
    >
      <circle
        cx={cx}
        cy={cy}
        r={theme.controls.collapseSize / 2}
        fill={theme.controls.collapseBackground}
        stroke={theme.controls.collapseBorder}
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
function DropIndicator({ box, zone, theme }: { box: NodeBox; zone: DropZone; theme: MindMapTheme }) {
  const gap = 6;
  if (zone === "inside") {
    return (
      <rect
        x={box.x - gap}
        y={box.y - gap}
        width={box.width + gap * 2}
        height={box.height + gap * 2}
        rx={(roleTokens(theme, box.depth).radius ?? 6) + gap}
        fill="none"
        stroke={theme.interaction.dropIndicator}
        strokeWidth={2}
        strokeDasharray="4 3"
      />
    );
  }
  const y = zone === "before" ? box.y - gap : box.y + box.height + gap;
  return (
    <line
      x1={box.x}
      y1={y}
      x2={box.x + box.width}
      y2={y}
      stroke={theme.interaction.dropIndicator}
      strokeWidth={2.5}
      strokeLinecap="round"
    />
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
  onSelectNone: () => void;
  onToggleCollapse: (id: NodeId) => void;
  /** §7.2/§7.3 — the drop, already resolved to a legal `{ parentId, index }` by `resolveDropTarget`. */
  onReparent: (nodeId: NodeId, parentId: NodeId, index: number) => void;
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

interface DropPreview {
  targetId: NodeId;
  zone: DropZone;
  parentId: NodeId;
  index: number;
}

export function MapCanvas({
  doc,
  theme,
  layout,
  selection,
  viewport,
  onViewport,
  onSize,
  onSelect,
  onSelectNone,
  onToggleCollapse,
  onReparent
}: MapCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const size = useElementSize(svgRef);
  const drag = useRef<{ pointerId: number; x: number; y: number; moved: boolean } | null>(null);
  /**
   * A separate gesture from canvas pan, tracked in its own ref for the same reason `drag` is a
   * ref and not state: a fast pointermove can deliver several events in one React batch, and
   * only a ref reads back the value written a moment ago rather than the one from render start.
   */
  const nodeDrag = useRef<{ pointerId: number; nodeId: NodeId; moved: boolean } | null>(null);
  const [draggingId, setDraggingId] = useState<NodeId | null>(null);
  const [dropPreview, setDropPreview] = useState<DropPreview | null>(null);

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
      for (const nodeId of layout.order) {
        const box = layout.boxes[nodeId]!;
        if (docX < box.x || docX > box.x + box.width || docY < box.y || docY > box.y + box.height) continue;
        if (nodeId === doc.rootId) return { nodeId, zone: "inside" };
        const relY = (docY - box.y) / box.height;
        const zone: DropZone = relY < 0.3 ? "before" : relY > 0.7 ? "after" : "inside";
        return { nodeId, zone };
      }
      return null;
    },
    [layout, doc.rootId]
  );

  const onNodePointerDown = useCallback((nodeId: NodeId, event: React.PointerEvent<SVGGElement>) => {
    nodeDrag.current = { pointerId: event.pointerId, nodeId, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

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
        nodeState.moved = true;
        setDraggingId((current) => (current === nodeState.nodeId ? current : nodeState.nodeId));

        const rect = event.currentTarget.getBoundingClientRect();
        const point = screenToDocument(viewport, size, event.clientX - rect.left, event.clientY - rect.top);
        const hit = hitTest(point.x, point.y);
        const resolved = hit ? resolveDropTarget(doc, nodeState.nodeId, hit.nodeId, hit.zone) : null;
        setDropPreview((current) => {
          if (!hit || !resolved) return current === null ? current : null;
          if (current?.targetId === hit.nodeId && current.zone === hit.zone) return current;
          return { targetId: hit.nodeId, zone: hit.zone, parentId: resolved.parentId, index: resolved.index };
        });
        return;
      }

      const state = drag.current;
      if (!state || state.pointerId !== event.pointerId) return;
      const dx = event.clientX - state.x;
      const dy = event.clientY - state.y;
      // A few pixels of slop, so a click with a shaky hand is still a click.
      if (!state.moved && Math.hypot(dx, dy) < 4) return;
      state.moved = true;
      state.x = event.clientX;
      state.y = event.clientY;
      onViewport((current) => pan(current, dx, dy));
    },
    [onViewport, doc, viewport, size, hitTest]
  );

  const onPointerUp = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      const nodeState = nodeDrag.current;
      if (nodeState && nodeState.pointerId === event.pointerId) {
        nodeDrag.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        if (nodeState.moved && dropPreview) {
          onReparent(nodeState.nodeId, dropPreview.parentId, dropPreview.index);
        }
        setDraggingId(null);
        setDropPreview(null);
        return;
      }

      const state = drag.current;
      drag.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      if (state && !state.moved) onSelectNone();
    },
    [onSelectNone, dropPreview, onReparent]
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
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
      style={{ display: "block", touchAction: "none", background: theme.canvas.background }}
      role="tree"
      aria-label="Mind map"
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
      {layout.order.map((id) => (
        <Node
          key={id}
          box={layout.boxes[id]!}
          theme={theme}
          selected={id === selection}
          dragging={id === draggingId}
          onSelect={onSelect}
          onToggleCollapse={onToggleCollapse}
          onNodePointerDown={onNodePointerDown}
        />
      ))}
      {/* Drawn last so the indicator paints over both nodes and connectors. */}
      {dropPreview && layout.boxes[dropPreview.targetId] && (
        <DropIndicator box={layout.boxes[dropPreview.targetId]!} zone={dropPreview.zone} theme={theme} />
      )}
    </svg>
  );
}
