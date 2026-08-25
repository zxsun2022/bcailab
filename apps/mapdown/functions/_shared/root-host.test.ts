import { describe, expect, it } from "vitest";
import { mapdownRootRedirect } from "./root-host";

const PUBLISHED_ORIGIN = "https://share.bcailab.com";
const MAPDOWN_ORIGIN = "https://map.bcailab.com";

describe("mapdownRootRedirect", () => {
  it("redirects the published host root to the editor host", () => {
    expect(
      mapdownRootRedirect(`${PUBLISHED_ORIGIN}/`, PUBLISHED_ORIGIN, MAPDOWN_ORIGIN)
    ).toBe(MAPDOWN_ORIGIN);
  });

  it("keeps the editor host root on the editor", () => {
    expect(mapdownRootRedirect(`${MAPDOWN_ORIGIN}/`, PUBLISHED_ORIGIN, MAPDOWN_ORIGIN)).toBeNull();
  });

  it("never redirects a published map path", () => {
    expect(
      mapdownRootRedirect(`${PUBLISHED_ORIGIN}/p/example`, PUBLISHED_ORIGIN, MAPDOWN_ORIGIN)
    ).toBeNull();
  });
});
