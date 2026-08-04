/** Pure drag-gesture helpers, kept out of React so the interaction boundaries are testable. */

import type { BranchSide } from "../model/types";

export const DRAG_THRESHOLD_PX = 4;
export const AUTOPAN_EDGE_PX = 48;
export const AUTOPAN_MAX_STEP_PX = 12;

export function crossedDragThreshold(
  startX: number,
  startY: number,
  currentX: number,
  currentY: number
): boolean {
  return Math.hypot(currentX - startX, currentY - startY) >= DRAG_THRESHOLD_PX;
}

/**
 * Returns the screen-space delta to feed to `pan()`.
 *
 * `pan` moves the document with the pointer, so the signs are deliberately opposite the
 * viewport direction: near the right edge it receives a negative x delta and reveals content
 * farther right. Speed ramps linearly and is capped.
 */
export function autopanDelta(
  x: number,
  y: number,
  width: number,
  height: number
): { x: number; y: number } {
  const axis = (position: number, length: number): number => {
    if (position < AUTOPAN_EDGE_PX) {
      return AUTOPAN_MAX_STEP_PX * Math.min(1, (AUTOPAN_EDGE_PX - position) / AUTOPAN_EDGE_PX);
    }
    if (position > length - AUTOPAN_EDGE_PX) {
      return -AUTOPAN_MAX_STEP_PX *
        Math.min(1, (position - (length - AUTOPAN_EDGE_PX)) / AUTOPAN_EDGE_PX);
    }
    return 0;
  };

  return { x: axis(x, width), y: axis(y, height) };
}

export function sideDropTarget(
  sourceSide: BranchSide | null,
  isFirstLevel: boolean,
  twoSided: boolean,
  point: { x: number; y: number },
  root: { x: number; y: number; width: number; height: number },
  verticalMargin = 48
): BranchSide | null {
  if (!twoSided || !isFirstLevel || sourceSide === null) return null;
  if (
    point.y < root.y - verticalMargin ||
    point.y > root.y + root.height + verticalMargin
  ) {
    return null;
  }
  if (sourceSide === "right" && point.x < root.x) return "left";
  if (sourceSide === "left" && point.x > root.x + root.width) return "right";
  return null;
}
