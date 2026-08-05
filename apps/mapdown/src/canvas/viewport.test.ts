import { describe, expect, it } from "vitest";
import type { NodeBox } from "../layout/layout";
import {
  IDENTITY,
  MAX_SCALE,
  MIN_SCALE,
  centerOn,
  clampScale,
  fitMap,
  isVisible,
  pan,
  revealNode,
  resetZoom,
  screenToDocument,
  visibleRect,
  zoomAbout,
  zoomPercent,
  zoomToCenter,
  type Viewport
} from "./viewport";

const SIZE = { width: 1000, height: 600 };

function box(x: number, y: number, width = 100, height = 40): NodeBox {
  return {
    nodeId: "n",
    x,
    y,
    width,
    height,
    depth: 1,
    side: "right",
    lines: [""],
    directChildCount: 0,
    collapsed: false,
    outwardEdgeX: x + width,
    inwardEdgeX: x
  };
}

describe("§12.1 — pan", () => {
  it("moves the map with the pointer, not against it", () => {
    // Dragging right by 100 screen units should reveal content to the *left*.
    const after = pan(IDENTITY, 100, 0);
    expect(after.centerX).toBe(-100);
  });

  it("pans in document units, so a zoomed-in drag covers less ground", () => {
    const zoomed: Viewport = { scale: 2, centerX: 0, centerY: 0 };
    expect(pan(zoomed, 100, 0).centerX).toBe(-50);
  });

  it("never changes scale", () => {
    const zoomed: Viewport = { scale: 1.5, centerX: 10, centerY: 20 };
    expect(pan(zoomed, 33, -17).scale).toBe(1.5);
  });
});

describe("§12.2 — zoom", () => {
  it("keeps the document point under the cursor fixed", () => {
    const before = screenToDocument(IDENTITY, SIZE, 800, 100);
    const zoomed = zoomAbout(IDENTITY, SIZE, 2, 800, 100);
    const after = screenToDocument(zoomed, SIZE, 800, 100);

    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  it("holds the centre when zooming about the viewport centre", () => {
    const zoomed = zoomAbout(IDENTITY, SIZE, 2, SIZE.width / 2, SIZE.height / 2);
    expect(zoomed.centerX).toBeCloseTo(0, 6);
    expect(zoomed.centerY).toBeCloseTo(0, 6);
    expect(zoomed.scale).toBe(2);
  });

  it("clamps to the 25%–400% range", () => {
    expect(clampScale(0.01)).toBe(MIN_SCALE);
    expect(clampScale(99)).toBe(MAX_SCALE);
    expect(zoomToCenter({ scale: MAX_SCALE, centerX: 0, centerY: 0 }, 2).scale).toBe(MAX_SCALE);
    expect(zoomToCenter({ scale: MIN_SCALE, centerX: 0, centerY: 0 }, 0.5).scale).toBe(MIN_SCALE);
  });

  it("returns the same viewport when already at the limit, so a no-op cannot drift the centre", () => {
    const atMax: Viewport = { scale: MAX_SCALE, centerX: 42, centerY: 7 };
    expect(zoomAbout(atMax, SIZE, 2, 900, 500)).toBe(atMax);
  });

  it("reports a readable percentage for the status area (§2.1)", () => {
    expect(zoomPercent(IDENTITY)).toBe("100%");
    expect(zoomPercent({ scale: 0.25, centerX: 0, centerY: 0 })).toBe("25%");
  });

  it("resets to 100% without moving the viewport centre", () => {
    expect(resetZoom({ scale: 2.5, centerX: 42, centerY: -17 })).toEqual({
      scale: 1,
      centerX: 42,
      centerY: -17
    });
    expect(resetZoom(IDENTITY)).toBe(IDENTITY);
  });
});

describe("§12.3 — fit map", () => {
  it("shows the whole map with margins", () => {
    const bounds = { minX: -400, minY: -200, maxX: 400, maxY: 200 };
    const viewport = fitMap(bounds, SIZE);
    const rect = visibleRect(viewport, SIZE);

    expect(rect.minX).toBeLessThanOrEqual(bounds.minX);
    expect(rect.maxX).toBeGreaterThanOrEqual(bounds.maxX);
    expect(rect.minY).toBeLessThanOrEqual(bounds.minY);
    expect(rect.maxY).toBeGreaterThanOrEqual(bounds.maxY);
  });

  it("centres on the map's own centre, not the origin", () => {
    const bounds = { minX: 100, minY: 50, maxX: 500, maxY: 250 };
    const viewport = fitMap(bounds, SIZE);
    expect(viewport.centerX).toBe(300);
    expect(viewport.centerY).toBe(150);
  });

  it("does not magnify a tiny map to 8×, which reads as a bug rather than as fitting", () => {
    const viewport = fitMap({ minX: -40, minY: -12, maxX: 40, maxY: 12 }, SIZE);
    expect(viewport.scale).toBeLessThanOrEqual(MAX_SCALE);
  });

  /**
   * The one place two spec rules genuinely conflict, resolved in favour of the MUST.
   * A map more than 4x the viewport cannot both fit and respect the 25% interactive floor.
   */
  it("goes below the interactive zoom floor rather than clipping a huge map", () => {
    const bounds = { minX: -4000, minY: -3000, maxX: 4000, maxY: 3000 };
    const viewport = fitMap(bounds, SIZE);

    expect(viewport.scale).toBeLessThan(MIN_SCALE);
    const rect = visibleRect(viewport, SIZE);
    expect(rect.width).toBeGreaterThanOrEqual(bounds.maxX - bounds.minX);
    expect(rect.height).toBeGreaterThanOrEqual(bounds.maxY - bounds.minY);
  });

  it("still applies the 25% floor to manual zoom, which is what that floor is for", () => {
    expect(zoomToCenter({ scale: MIN_SCALE, centerX: 0, centerY: 0 }, 0.5).scale).toBe(MIN_SCALE);
  });
});

describe("§12.4 — centre a node without touching zoom", () => {
  it("puts the node's centre at the viewport centre", () => {
    const viewport = centerOn({ scale: 1.75, centerX: 0, centerY: 0 }, box(200, 100));
    expect(viewport.centerX).toBe(250);
    expect(viewport.centerY).toBe(120);
    expect(viewport.scale).toBe(1.75);
  });
});

/**
 * §12.5 is the rule that decides whether typing feels calm or frantic, so it gets the most
 * attention: "the viewport SHOULD pan only enough to reveal the selected node… It SHOULD not
 * recenter the entire map after each edit."
 */
describe("§12.5 — reveal the selection, minimally", () => {
  it("does not move at all when the node is already comfortably visible", () => {
    const viewport = IDENTITY;
    // Identity comparison, not deep equality: an unchanged viewport must be the same object so
    // callers can skip a re-render entirely.
    expect(revealNode(viewport, SIZE, box(0, 0))).toBe(viewport);
  });

  it("pans just far enough to bring an off-screen node into the margin", () => {
    const target = box(900, 0);
    const after = revealNode(IDENTITY, SIZE, target, 64);

    expect(isVisible(after, SIZE, target)).toBe(true);
    // Minimal: the node's right edge plus the margin now sits exactly on the right boundary.
    const rect = visibleRect(after, SIZE);
    expect(rect.maxX).toBeCloseTo(target.x + target.width + 64, 6);
  });

  it("never recentres the map on the node (that is what §12.4 is for)", () => {
    const target = box(900, 0);
    const revealed = revealNode(IDENTITY, SIZE, target);
    const centred = centerOn(IDENTITY, target);
    expect(revealed.centerX).not.toBeCloseTo(centred.centerX, 1);
  });

  it("moves on both axes only when both are out of view", () => {
    const target = box(900, 500);
    const after = revealNode(IDENTITY, SIZE, target);
    expect(after.centerX).toBeGreaterThan(0);
    expect(after.centerY).toBeGreaterThan(0);

    const onlyX = revealNode(IDENTITY, SIZE, box(900, 0));
    expect(onlyX.centerY).toBe(IDENTITY.centerY);
  });

  it("works when the node is off the top or left", () => {
    const target = box(-900, -500);
    const after = revealNode(IDENTITY, SIZE, target);
    expect(after.centerX).toBeLessThan(0);
    expect(after.centerY).toBeLessThan(0);
    expect(isVisible(after, SIZE, target)).toBe(true);
  });

  it("scales the margin with zoom, so it stays constant on screen", () => {
    const zoomed: Viewport = { scale: 2, centerX: 0, centerY: 0 };
    const target = box(400, 0);
    const after = revealNode(zoomed, SIZE, target, 64);
    const rect = visibleRect(after, SIZE);
    // 64 screen units is 32 document units at 2x.
    expect(rect.maxX).toBeCloseTo(target.x + target.width + 32, 6);
  });

  it("never changes zoom while revealing", () => {
    const zoomed: Viewport = { scale: 3, centerX: 0, centerY: 0 };
    expect(revealNode(zoomed, SIZE, box(5000, 5000)).scale).toBe(3);
  });
});

describe("viewport is not document state", () => {
  it("carries nothing that belongs in a snapshot or an export", () => {
    // A guard against someone adding a node id or a document field to Viewport later:
    // data-model.md §8.5 keeps pan and zoom out of semantic history entirely.
    expect(Object.keys(IDENTITY).sort()).toEqual(["centerX", "centerY", "scale"]);
  });
});
