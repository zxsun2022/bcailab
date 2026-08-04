import { memo } from "react";
import { FONT_STACK } from "../layout/measure";
import { DEFAULT_TYPOGRAPHY, type Connector, type LayoutResult, type NodeBox } from "../layout/layout";
import type { NodeId } from "../model/types";

/**
 * SVG rendering of a computed layout.
 *
 * **Node coordinates never enter React state.** `spec/product-specification.md` §19 requires
 * typing to stay responsive at 500 nodes and forbids a full-document rerender on every caret
 * movement. Layout is computed outside the component tree and handed in whole; each node is a
 * memoised component keyed on its own box, so editing one label re-renders one node rather than
 * the map. Spike 3 measured layout itself at 0.70 ms for 500 nodes — reconciliation, not
 * geometry, is the budget that needs defending.
 */

interface NodeProps {
  box: NodeBox;
  selected: boolean;
  onSelect: (id: NodeId) => void;
  onToggleCollapse: (id: NodeId) => void;
}

const Node = memo(function Node({ box, selected, onSelect, onToggleCollapse }: NodeProps) {
  const { fontSize, lineHeight, paddingX, paddingY } = DEFAULT_TYPOGRAPHY;
  const isRoot = box.depth === 0;

  return (
    <g
      onPointerDown={(event) => {
        event.stopPropagation();
        event.preventDefault();
        onSelect(box.nodeId);
      }}
      style={{ cursor: "default" }}
    >
      <rect
        x={box.x}
        y={box.y}
        width={box.width}
        height={box.height}
        rx={6}
        fill={isRoot ? "var(--node-root-fill)" : "var(--node-fill)"}
        stroke={selected ? "var(--node-selected-stroke)" : "var(--node-stroke)"}
        strokeWidth={selected ? 2 : 1}
      />
      <text
        x={box.x + paddingX}
        y={box.y + paddingY + (fontSize * lineHeight) / 2}
        fontFamily={FONT_STACK}
        fontSize={fontSize}
        fontWeight={isRoot ? 600 : 400}
        fill={isRoot ? "var(--node-root-text)" : "var(--node-text)"}
        dominantBaseline="central"
      >
        {box.lines.map((line, index) => (
          // Wrapping is decided by the measurement layer, so the renderer only positions the
          // lines it was given — the two can never disagree about where a break went.
          <tspan key={index} x={box.x + paddingX} dy={index === 0 ? 0 : fontSize * lineHeight}>
            {line === "" ? " " : line}
          </tspan>
        ))}
      </text>

      {box.directChildCount > 0 && box.depth > 0 && (
        <CollapseControl box={box} onToggle={onToggleCollapse} />
      )}
    </g>
  );
});

/**
 * §9.2–§9.4 — the control sits on the outward edge, in the lane layout reserved for it, so
 * showing it on hover cannot change the node's width. A collapsed node shows its direct-child
 * count; an expanded one shows a minus.
 */
function CollapseControl({ box, onToggle }: { box: NodeBox; onToggle: (id: NodeId) => void }) {
  const cx = box.outwardEdgeX + 8;
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
        event.preventDefault();
        onToggle(box.nodeId);
      }}
      style={{ cursor: "pointer" }}
      role="button"
      aria-label={label}
    >
      <circle cx={cx} cy={cy} r={7} fill="var(--control-fill)" stroke="var(--control-stroke)" />
      {box.collapsed ? (
        <text
          x={cx}
          y={cy}
          fontFamily={FONT_STACK}
          fontSize={9}
          fill="var(--control-text)"
          textAnchor="middle"
          dominantBaseline="central"
        >
          {box.directChildCount > 99 ? "99+" : box.directChildCount}
        </text>
      ) : (
        <line x1={cx - 3.5} y1={cy} x2={cx + 3.5} y2={cy} stroke="var(--control-text)" strokeWidth={1.5} />
      )}
    </g>
  );
}

const Edge = memo(function Edge({ connector }: { connector: Connector }) {
  const { x1, y1, c1x, c1y, c2x, c2y, x2, y2 } = connector.path;
  return (
    <path
      d={`M${x1},${y1} C${c1x},${c1y} ${c2x},${c2y} ${x2},${y2}`}
      fill="none"
      stroke="var(--connector)"
      strokeWidth={1.4}
    />
  );
});

export interface MapCanvasProps {
  layout: LayoutResult;
  selection: NodeId | null;
  onSelect: (id: NodeId) => void;
  onSelectNone: () => void;
  onToggleCollapse: (id: NodeId) => void;
}

/**
 * The visible region, in document coordinates.
 *
 * A small map must not be blown up to fill the viewport — a single node at 8x reads as a bug,
 * not as a feature. A minimum span keeps a new document at a sane scale; real pan and zoom
 * (§12) arrive in Phase 2 and will replace this with a viewport transform.
 */
export function viewBoxBounds(bounds: LayoutResult["bounds"]) {
  const padding = 48;
  const MIN_SPAN_X = 900;
  const MIN_SPAN_Y = 560;

  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  const spanX = Math.max(bounds.maxX - bounds.minX + padding * 2, MIN_SPAN_X);
  const spanY = Math.max(bounds.maxY - bounds.minY + padding * 2, MIN_SPAN_Y);

  return { minX: cx - spanX / 2, minY: cy - spanY / 2, maxX: cx + spanX / 2, maxY: cy + spanY / 2 };
}

export const MapCanvas = memo(function MapCanvas({
  layout,
  selection,
  onSelect,
  onSelectNone,
  onToggleCollapse
}: MapCanvasProps) {
  const { minX, minY, maxX, maxY } = viewBoxBounds(layout.bounds);
  const viewBox = `${minX} ${minY} ${maxX - minX} ${maxY - minY}`;

  return (
    <svg
      viewBox={viewBox}
      width="100%"
      height="100%"
      onPointerDown={(event) => {
        event.preventDefault();
        onSelectNone();
      }}
      style={{ display: "block", touchAction: "none" }}
      role="tree"
      aria-label="Mind map"
    >
      {/* Connectors first so nodes paint over them. */}
      {layout.connectors.map((connector) => (
        <Edge key={`${connector.fromId}->${connector.toId}`} connector={connector} />
      ))}
      {layout.order.map((id) => (
        <Node
          key={id}
          box={layout.boxes[id]!}
          selected={id === selection}
          onSelect={onSelect}
          onToggleCollapse={onToggleCollapse}
        />
      ))}
    </svg>
  );
});
