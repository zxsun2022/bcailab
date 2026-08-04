import { describe, expect, it } from "vitest";
import {
  AUTOPAN_MAX_STEP_PX,
  autopanDelta,
  crossedDragThreshold,
  sideDropTarget
} from "./drag";

describe("node drag gesture boundaries", () => {
  it("requires four CSS pixels before a click becomes a drag", () => {
    expect(crossedDragThreshold(10, 10, 13, 12)).toBe(false);
    expect(crossedDragThreshold(10, 10, 14, 10)).toBe(true);
  });

  it("does not autopan in the safe centre region", () => {
    expect(autopanDelta(200, 150, 400, 300)).toEqual({ x: 0, y: 0 });
  });

  it("ramps toward each edge with a bounded speed", () => {
    expect(autopanDelta(0, 0, 400, 300)).toEqual({
      x: AUTOPAN_MAX_STEP_PX,
      y: AUTOPAN_MAX_STEP_PX
    });
    expect(autopanDelta(400, 300, 400, 300)).toEqual({
      x: -AUTOPAN_MAX_STEP_PX,
      y: -AUTOPAN_MAX_STEP_PX
    });
    expect(autopanDelta(24, 150, 400, 300)).toEqual({
      x: AUTOPAN_MAX_STEP_PX / 2,
      y: 0
    });
  });

  it("offers a side drop only across the root band for a first-level branch", () => {
    const root = { x: 100, y: 80, width: 80, height: 40 };
    expect(sideDropTarget("right", true, true, { x: 90, y: 100 }, root)).toBe("left");
    expect(sideDropTarget("left", true, true, { x: 190, y: 100 }, root)).toBe("right");
    expect(sideDropTarget("right", false, true, { x: 90, y: 100 }, root)).toBeNull();
    expect(sideDropTarget("right", true, false, { x: 90, y: 100 }, root)).toBeNull();
    expect(sideDropTarget("right", true, true, { x: 90, y: 200 }, root)).toBeNull();
  });
});
