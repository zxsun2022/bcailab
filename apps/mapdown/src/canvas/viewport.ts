import type { LayoutResult, NodeBox } from "../layout/layout";
import type { NodeId } from "../model/types";

/**
 * Viewport state and the operations on it, per `product-specification.md` §12.
 *
 * Kept as pure functions of (viewport, geometry) so every rule is testable without a DOM. The
 * viewport is **not** part of the document: `data-model.md` §8.5 excludes pan and zoom from
 * semantic history, and `markdown-format.md` §8 excludes them from export. Panning is not an
 * edit and must never land in undo.
 */

export interface Viewport {
  /** Document units per screen unit. 1 = actual size. */
  scale: number;
  /** Document coordinate at the centre of the visible area. */
  centerX: number;
  centerY: number;
}

export interface ViewportSize {
  width: number;
  height: number;
}

/** §12.2 — "a practical range such as 25% to 400%". */
export const MIN_SCALE = 0.25;
export const MAX_SCALE = 4;

export const IDENTITY: Viewport = { scale: 1, centerX: 0, centerY: 0 };

export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/** The document-coordinate rectangle currently visible. */
export function visibleRect(viewport: Viewport, size: ViewportSize) {
  const width = size.width / viewport.scale;
  const height = size.height / viewport.scale;
  return {
    minX: viewport.centerX - width / 2,
    minY: viewport.centerY - height / 2,
    maxX: viewport.centerX + width / 2,
    maxY: viewport.centerY + height / 2,
    width,
    height
  };
}

export function toViewBox(viewport: Viewport, size: ViewportSize): string {
  const rect = visibleRect(viewport, size);
  return `${rect.minX} ${rect.minY} ${rect.width} ${rect.height}`;
}

/** Screen point → document point. Needed to zoom about the pointer (§12.2). */
export function screenToDocument(
  viewport: Viewport,
  size: ViewportSize,
  screenX: number,
  screenY: number
) {
  const rect = visibleRect(viewport, size);
  return {
    x: rect.minX + (screenX / size.width) * rect.width,
    y: rect.minY + (screenY / size.height) * rect.height
  };
}

/** §12.1 — a drag of `dx, dy` screen units moves the map with the pointer. */
export function pan(viewport: Viewport, dx: number, dy: number): Viewport {
  return {
    ...viewport,
    centerX: viewport.centerX - dx / viewport.scale,
    centerY: viewport.centerY - dy / viewport.scale
  };
}

/**
 * §12.2 — zoom about a fixed screen point.
 *
 * The anchor is what makes wheel and pinch zoom feel right: the document point under the
 * cursor must stay under the cursor. Zooming about the viewport centre instead makes the
 * content the user is looking at slide away, which reads as the map moving on its own.
 */
export function zoomAbout(
  viewport: Viewport,
  size: ViewportSize,
  factor: number,
  screenX: number,
  screenY: number
): Viewport {
  const scale = clampScale(viewport.scale * factor);
  if (scale === viewport.scale) return viewport;

  const anchor = screenToDocument(viewport, size, screenX, screenY);
  const next: Viewport = { ...viewport, scale };
  const after = screenToDocument(next, size, screenX, screenY);

  return { scale, centerX: viewport.centerX + (anchor.x - after.x), centerY: viewport.centerY + (anchor.y - after.y) };
}

export function zoomToCenter(viewport: Viewport, factor: number): Viewport {
  return { ...viewport, scale: clampScale(viewport.scale * factor) };
}

/**
 * §12.3 — show every visible node with comfortable margins.
 *
 * **Fit is allowed below the interactive zoom floor, and that is a deliberate reading of two
 * rules that conflict.** §12.2 asks for "a practical range such as 25% to 400%"; §12.3 says fit
 * "MUST calculate a scale and pan position that shows all currently visible nodes". A map more
 * than 4x the viewport cannot satisfy both. §12.3 is a MUST and §12.2 is a SHOULD offering an
 * example range, so fit wins: the 25% floor governs *manual* zoom, where it stops a user
 * zooming into nothing, while fit is a computed answer that must actually fit.
 *
 * The top is still clamped, so a one-node map is not blown up to 8x — that reads as a bug
 * rather than as fitting.
 */
export const MIN_FIT_SCALE = 0.02;

export function fitMap(
  bounds: LayoutResult["bounds"],
  size: ViewportSize,
  margin = 48
): Viewport {
  const width = Math.max(bounds.maxX - bounds.minX, 1) + margin * 2;
  const height = Math.max(bounds.maxY - bounds.minY, 1) + margin * 2;
  const raw = Math.min(size.width / width, size.height / height);
  const scale = Math.min(MAX_SCALE, Math.max(MIN_FIT_SCALE, raw));
  return {
    scale,
    centerX: (bounds.minX + bounds.maxX) / 2,
    centerY: (bounds.minY + bounds.maxY) / 2
  };
}

/** §12.4 — centre a node without changing zoom or the document. */
export function centerOn(viewport: Viewport, box: NodeBox): Viewport {
  return { ...viewport, centerX: box.x + box.width / 2, centerY: box.y + box.height / 2 };
}

/**
 * §12.5 — reveal the selection by panning **only as far as needed**, and not at all if it is
 * already comfortably visible.
 *
 * This is the rule that keeps typing from feeling like the map is chasing the cursor: §12.5
 * says the viewport "SHOULD not recenter the entire map after each edit", so a node that is
 * already on screen produces no movement whatsoever — the function returns the same object,
 * which callers can compare by identity.
 */
export function revealNode(
  viewport: Viewport,
  size: ViewportSize,
  box: NodeBox,
  margin = 64
): Viewport {
  const rect = visibleRect(viewport, size);
  const marginX = margin / viewport.scale;
  const marginY = margin / viewport.scale;

  let dx = 0;
  let dy = 0;

  if (box.x - marginX < rect.minX) dx = box.x - marginX - rect.minX;
  else if (box.x + box.width + marginX > rect.maxX) dx = box.x + box.width + marginX - rect.maxX;

  if (box.y - marginY < rect.minY) dy = box.y - marginY - rect.minY;
  else if (box.y + box.height + marginY > rect.maxY) dy = box.y + box.height + marginY - rect.maxY;

  if (dx === 0 && dy === 0) return viewport;
  return { ...viewport, centerX: viewport.centerX + dx, centerY: viewport.centerY + dy };
}

export function isVisible(viewport: Viewport, size: ViewportSize, box: NodeBox): boolean {
  const rect = visibleRect(viewport, size);
  return (
    box.x + box.width > rect.minX &&
    box.x < rect.maxX &&
    box.y + box.height > rect.minY &&
    box.y < rect.maxY
  );
}

export function zoomPercent(viewport: Viewport): string {
  return `${Math.round(viewport.scale * 100)}%`;
}

/** Convenience for the editor: reveal whichever node is selected, if any. */
export function revealSelection(
  viewport: Viewport,
  size: ViewportSize,
  result: LayoutResult,
  selection: NodeId | null
): Viewport {
  if (!selection) return viewport;
  const box = result.boxes[selection];
  return box ? revealNode(viewport, size, box) : viewport;
}
