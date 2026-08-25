import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { layout, layoutOptionsForTheme, type LayoutResult, type NodeBox } from "../layout/layout";
import { getNode, visibleNodes, type MindMapDocument, type NodeId } from "../model/types";
import { connectorColorFor, nodeFillAndTextFor } from "../theme/branch-colors";
import { resolveTheme } from "../theme/presets";
import { roleTokens, roleTypography } from "../theme/roles";
import type { MindMapTheme } from "../theme/types";
import {
  fitMap,
  IDENTITY,
  pan,
  toViewBox,
  zoomAbout,
  zoomToCenter,
  type Viewport,
  type ViewportSize
} from "../canvas/viewport";

/**
 * The read-only renderer for a published map.
 *
 * It deliberately does **not** reuse `MapCanvas.tsx`. That component carries drag-and-drop,
 * selection, IME handling and command dispatch; importing it here would ship the editing system
 * to every reader and put a mutation path inside a public page. What matters for fidelity is
 * shared instead — `layout/`, `theme/` and the measurement path are the same modules the author
 * ran, and Phase 0 spike 2 established that canvas measurement and SVG layout agree to 0.000 px,
 * so the live render and the frozen SVG describe the same geometry.
 *
 * Node text reaches the DOM only as React text children. There is no `innerHTML`, no
 * `foreignObject`, and no attribute built from user text — a published label containing markup
 * is inert here for the same structural reason it is inert in the SVG export (§12.6).
 */

/** The imperative surface the server-rendered header controls drive. */
export interface MapCommands {
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
}

interface PublishedMapProps {
  document: MindMapDocument;
  onToggleCollapse: (id: NodeId) => void;
  /**
   * The zoom capsule is rendered by the Pages Function, not by React, because it has to exist
   * and read correctly before this bundle loads. The map publishes its commands here so those
   * existing buttons can drive it.
   */
  commandRef: { current: MapCommands | null };
  onZoomChange: (scale: number) => void;
}

function Connector({
  path,
  color,
  width,
  opacity
}: {
  path: LayoutResult["connectors"][number]["path"];
  color: string;
  width: number;
  opacity: number;
}) {
  const { x1, y1, c1x, c1y, c2x, c2y, x2, y2 } = path;
  return (
    <path
      d={`M${x1},${y1} C${c1x},${c1y} ${c2x},${c2y} ${x2},${y2}`}
      fill="none"
      stroke={color}
      strokeWidth={width}
      opacity={opacity}
    />
  );
}

function CollapseControl({
  box,
  theme,
  onToggle
}: {
  box: NodeBox;
  theme: MindMapTheme;
  onToggle: (id: NodeId) => void;
}) {
  const cx = box.outwardEdgeX + (box.side === "left" ? -8 : 8);
  const cy = box.y + box.height / 2;
  const label = box.lines.join(" ").trim() || theme.nodes.emptyPlaceholderText;
  const children = `${box.directChildCount} direct ${box.directChildCount === 1 ? "child" : "children"}`;
  return (
    <g
      role="button"
      aria-label={`${box.collapsed ? "Expand" : "Collapse"} '${label}', ${children}`}
      style={{ cursor: "pointer" }}
      onPointerDown={(event) => {
        // Without this the press starts a canvas pan and the reader drags the map instead of
        // toggling the branch they aimed at.
        event.stopPropagation();
        event.preventDefault();
        onToggle(box.nodeId);
      }}
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

function Node({
  document,
  box,
  theme,
  focused,
  onFocus,
  onToggle
}: {
  document: MindMapDocument;
  box: NodeBox;
  theme: MindMapTheme;
  focused: boolean;
  onFocus: (id: NodeId) => void;
  onToggle: (id: NodeId) => void;
}) {
  const tokens = roleTokens(theme, box.depth);
  const { size, weight } = roleTypography(theme, box.depth);
  const { lineHeight } = theme.typography;
  const { background: fill, text: textColor } = nodeFillAndTextFor(
    document,
    theme,
    box.nodeId,
    box.depth
  );
  const hasChildren = box.directChildCount > 0 && box.depth > 0;
  const accessibleLabel = [
    box.lines.join(" ").trim() || theme.nodes.emptyPlaceholderText,
    `level ${box.depth + 1}`,
    box.directChildCount > 0 ? (box.collapsed ? "collapsed" : "expanded") : "leaf"
  ].join(", ");

  return (
    <g
      id={`published-node-${box.nodeId}`}
      role="treeitem"
      aria-label={accessibleLabel}
      aria-level={box.depth + 1}
      aria-expanded={box.directChildCount > 0 ? !box.collapsed : undefined}
      onPointerDown={(event) => {
        event.stopPropagation();
        onFocus(box.nodeId);
      }}
      onDoubleClick={(event) => {
        event.stopPropagation();
        if (hasChildren) onToggle(box.nodeId);
      }}
    >
      <rect
        x={box.x}
        y={box.y}
        width={box.width}
        height={box.height}
        rx={tokens.radius}
        fill={fill}
        stroke={tokens.border}
        strokeWidth={tokens.borderWidth}
      />
      {focused && (
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
        x={box.x + tokens.paddingX}
        y={box.y + tokens.paddingY + (size * lineHeight) / 2}
        fontFamily={theme.typography.fontFamily}
        fontSize={size}
        fontWeight={weight}
        fill={textColor}
        dominantBaseline="central"
      >
        {box.lines.map((line, index) => (
          <tspan
            key={index}
            x={box.x + tokens.paddingX}
            dy={index === 0 ? 0 : size * lineHeight}
          >
            {line === "" ? " " : line}
          </tspan>
        ))}
      </text>
      {hasChildren && <CollapseControl box={box} theme={theme} onToggle={onToggle} />}
    </g>
  );
}

export function PublishedMap({
  document,
  onToggleCollapse,
  commandRef,
  onZoomChange
}: PublishedMapProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<ViewportSize>({ width: 1, height: 1 });
  const [viewport, setViewport] = useState<Viewport>(IDENTITY);
  const [focusedId, setFocusedId] = useState<NodeId>(document.rootId);
  const panRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);

  const theme = useMemo(
    () => resolveTheme(document.theme.shapeId, document.theme.paletteId),
    [document.theme.paletteId, document.theme.shapeId]
  );
  const computed = useMemo(
    () => layout(document, layoutOptionsForTheme(theme)),
    [document, theme]
  );
  const order = useMemo(() => visibleNodes(document), [document]);

  useEffect(() => {
    const element = surfaceRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const rect = entry?.contentRect;
      if (rect && rect.width > 0 && rect.height > 0) {
        setSize({ width: rect.width, height: rect.height });
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Fit is what a reader arriving from a link needs first: the whole map at once, matching the
  // frozen image they would have seen without JavaScript. It happens once — a reader who has
  // zoomed in must not be dragged back out by a window resize or by collapsing a branch.
  const fittedRef = useRef(false);
  useEffect(() => {
    if (fittedRef.current || size.width <= 1 || size.height <= 1) return;
    fittedRef.current = true;
    setViewport(fitMap(computed.bounds, size));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.width, size.height]);

  useEffect(() => {
    commandRef.current = {
      zoomIn: () => setViewport((current) => zoomToCenter(current, 1.25)),
      zoomOut: () => setViewport((current) => zoomToCenter(current, 1 / 1.25)),
      fit: () => setViewport(fitMap(computed.bounds, size))
    };
    return () => {
      commandRef.current = null;
    };
  }, [commandRef, computed.bounds, size]);

  useEffect(() => {
    onZoomChange(viewport.scale);
  }, [onZoomChange, viewport.scale]);

  const onWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey && !event.metaKey && Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    setViewport((current) =>
      zoomAbout(
        current,
        { width: rect.width, height: rect.height },
        event.clientX - rect.left,
        event.clientY - rect.top,
        Math.exp(-event.deltaY / 400)
      )
    );
  }, []);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const node = document.nodes[focusedId];
    if (!node) return;
    const move = (id: NodeId | null | undefined) => {
      if (!id) return;
      event.preventDefault();
      setFocusedId(id);
      const box = computed.boxes[id];
      if (box) setViewport((current) => ({ ...current, centerX: box.x + box.width / 2, centerY: box.y + box.height / 2 }));
    };
    switch (event.key) {
      case "ArrowRight":
        return move(node.childIds.find((id) => getNode(document, id).side !== "left") ?? node.childIds[0]);
      case "ArrowLeft":
        return move(node.parentId);
      case "ArrowDown":
      case "ArrowUp": {
        const parent = node.parentId ? getNode(document, node.parentId) : null;
        if (!parent) return;
        const index = parent.childIds.indexOf(focusedId);
        return move(parent.childIds[index + (event.key === "ArrowDown" ? 1 : -1)]);
      }
      case "Enter":
      case " ":
        if (node.childIds.length > 0 && focusedId !== document.rootId) {
          event.preventDefault();
          onToggleCollapse(focusedId);
        }
        return;
      case "0":
        event.preventDefault();
        return setViewport(fitMap(computed.bounds, size));
      case "+":
      case "=":
        event.preventDefault();
        return setViewport((current) => zoomToCenter(current, 1.25));
      case "-":
        event.preventDefault();
        return setViewport((current) => zoomToCenter(current, 1 / 1.25));
      default:
    }
  };

  return (
    <div
      ref={surfaceRef}
      className="published-surface"
      tabIndex={0}
      role="tree"
      aria-label={`${document.title} — published mind map`}
      onWheel={onWheel}
      onKeyDown={onKeyDown}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        panRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
        event.currentTarget.setPointerCapture(event.pointerId);
        // Focus is left to the browser's own mousedown behaviour: calling `.focus()` here makes
        // Chrome treat a pointer press as keyboard focus and paint the focus ring around the
        // whole map on every drag.
      }}
      onPointerMove={(event) => {
        const active = panRef.current;
        if (!active || active.pointerId !== event.pointerId) return;
        const dx = event.clientX - active.x;
        const dy = event.clientY - active.y;
        panRef.current = { ...active, x: event.clientX, y: event.clientY };
        setViewport((current) => pan(current, dx, dy));
      }}
      onPointerUp={(event) => {
        if (panRef.current?.pointerId === event.pointerId) panRef.current = null;
      }}
      onPointerCancel={() => {
        panRef.current = null;
      }}
      style={{
        background: theme.canvas.background,
        touchAction: "none",
        cursor: "grab",
        // A pan is a drag across text; without this every pan highlights node labels.
        userSelect: "none",
        WebkitUserSelect: "none"
      }}
    >
      <svg
        width={size.width}
        height={size.height}
        viewBox={toViewBox(viewport, size)}
        role="presentation"
      >
        {computed.connectors.map((connector) => (
          <Connector
            key={`${connector.fromId}->${connector.toId}`}
            path={connector.path}
            color={connectorColorFor(document, theme, connector.toId)}
            width={
              connector.fromId === document.rootId
                ? theme.connectors.rootWidth
                : theme.connectors.width
            }
            opacity={theme.connectors.opacity}
          />
        ))}
        {order.map((id) => {
          const box = computed.boxes[id];
          if (!box) return null;
          return (
            <Node
              key={id}
              document={document}
              box={box}
              theme={theme}
              focused={id === focusedId}
              onFocus={setFocusedId}
              onToggle={onToggleCollapse}
            />
          );
        })}
      </svg>
    </div>
  );
}
