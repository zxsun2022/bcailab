import { describe, expect, it } from "vitest";
import { stableJson } from "./derive";

describe("Writing prompt canonical JSON", () => {
  it("sorts object keys by locale-independent code-unit order", () => {
    expect(stableJson({ z: 1, a: 2, _: 3, A: 4 })).toBe('{"A":4,"_":3,"a":2,"z":1}');
  });
});
