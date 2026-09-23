import { describe, expect, it } from "vitest";
import { canOpen, frontierOf, returnTargetOf, stepsFor, viewModeOf } from "./dictation-steps";

const checkedSet = (...indexes: number[]) => (index: number) => indexes.includes(index);

describe("frontierOf", () => {
  it("is the first unchecked sentence", () => {
    expect(frontierOf(5, checkedSet())).toBe(0);
    expect(frontierOf(5, checkedSet(0, 1, 2))).toBe(3);
  });

  it("is the total once every sentence is checked", () => {
    expect(frontierOf(3, checkedSet(0, 1, 2))).toBe(3);
  });
});

describe("stepsFor", () => {
  it("marks checked, current and locked steps around the frontier", () => {
    expect(stepsFor(5, 2, 2).map((step) => step.state)).toEqual([
      "checked",
      "checked",
      "current",
      "locked",
      "locked"
    ]);
  });

  it("marks which step is on screen, including a reviewed one", () => {
    const steps = stepsFor(5, 3, 1);
    expect(steps.filter((step) => step.viewing).map((step) => step.index)).toEqual([1]);
    expect(steps[1]!.state).toBe("checked");
  });

  it("has no current step once every sentence is checked", () => {
    expect(stepsFor(3, 3, 2).every((step) => step.state === "checked")).toBe(true);
  });
});

describe("canOpen — later sentences stay locked (D2)", () => {
  it("opens checked sentences and the frontier", () => {
    expect(canOpen(0, 5, 2)).toBe(true);
    expect(canOpen(2, 5, 2)).toBe(true);
  });

  it("refuses anything past the frontier and out-of-range indexes", () => {
    expect(canOpen(3, 5, 2)).toBe(false);
    expect(canOpen(-1, 5, 2)).toBe(false);
    expect(canOpen(5, 5, 5)).toBe(false);
  });
});

describe("viewModeOf — review is read-only (D1)", () => {
  it("answers at the frontier", () => {
    expect(viewModeOf(3, 3)).toBe("answer");
  });

  it("advances from the sentence just checked", () => {
    expect(viewModeOf(2, 3)).toBe("advance");
  });

  it("reviews anything earlier", () => {
    expect(viewModeOf(0, 3)).toBe("review");
    expect(viewModeOf(1, 3)).toBe("review");
  });

  it("advances to finishing from the last sentence once all are checked", () => {
    expect(viewModeOf(4, 5)).toBe("advance");
    expect(viewModeOf(1, 5)).toBe("review");
  });
});

describe("returnTargetOf", () => {
  it("returns to the frontier", () => {
    expect(returnTargetOf(5, 3)).toBe(3);
  });

  it("returns to the last sentence once all are checked, where Finish lives", () => {
    expect(returnTargetOf(5, 5)).toBe(4);
  });
});
