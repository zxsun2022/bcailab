import { describe, expect, it } from "vitest";
import { resolveMapdownWebOriginForBuild } from "./build-origin";

describe("resolveMapdownWebOriginForBuild", () => {
  it("uses an explicit build origin when configured", () => {
    expect(
      resolveMapdownWebOriginForBuild({
        VITE_WEB_ORIGIN: "https://preview.example.com",
        CF_PAGES_BRANCH: "staging"
      })
    ).toBe("https://preview.example.com");
  });

  it("pairs the stable staging branch with Preview Web", () => {
    expect(resolveMapdownWebOriginForBuild({ CF_PAGES_BRANCH: "staging" })).toBe(
      "https://staging.bcailab.pages.dev"
    );
  });

  it("leaves production and commit previews on the production fallback", () => {
    expect(resolveMapdownWebOriginForBuild({ CF_PAGES_BRANCH: "main" })).toBeUndefined();
    expect(resolveMapdownWebOriginForBuild({ CF_PAGES_BRANCH: "feature-branch" })).toBeUndefined();
  });
});
