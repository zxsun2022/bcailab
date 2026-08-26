import { describe, expect, it } from "vitest";
import { isPublicId, publicIdFromPathname } from "./public-id";

/**
 * The id these accept is base64url, because that is what `randomToken(16)` emits. The regression
 * being guarded here is a hex-only pattern: it rejected almost every real link, and it did so
 * silently — the viewer never mounted and the page stayed a static image.
 */
const REAL_IDS = [
  "Xk9pQz3mAbCdEfGhIjKl00", // 22 chars, the length randomToken(16) produces
  "aB_cD-eFgH1234567890zZ",
  "____--------____--------",
  "0123456789abcdefABCDEF"
];

describe("public id", () => {
  it("accepts the base64url ids the publish endpoint actually issues", () => {
    for (const id of REAL_IDS) expect(isPublicId(id)).toBe(true);
  });

  it("still rejects anything that could change the shape of a URL", () => {
    for (const value of [
      "",
      "../../api/auth/session",
      "abc/def",
      "abc.def",
      "abc%2f",
      "abc def",
      "abc?x=1",
      "abc#frag",
      "a".repeat(65)
    ]) {
      expect(isPublicId(value)).toBe(false);
    }
  });

  it("reads the id out of a published path, with or without a trailing slash", () => {
    expect(publicIdFromPathname("/p/Xk9pQz3mAbCdEfGhIjKl00")).toBe("Xk9pQz3mAbCdEfGhIjKl00");
    expect(publicIdFromPathname("/p/Xk9pQz3mAbCdEfGhIjKl00/")).toBe("Xk9pQz3mAbCdEfGhIjKl00");
  });

  it("returns null for paths that are not a published map", () => {
    expect(publicIdFromPathname("/")).toBeNull();
    expect(publicIdFromPathname("/library")).toBeNull();
    expect(publicIdFromPathname("/p/")).toBeNull();
    expect(publicIdFromPathname("/p/abc/map.svg")).toBeNull();
    expect(publicIdFromPathname("/p/abc.def")).toBeNull();
  });
});
