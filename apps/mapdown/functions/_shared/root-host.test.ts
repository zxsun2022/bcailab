import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { APP_PATHS, mapdownRootRedirect } from "./root-host";

const PUBLISHED_ORIGIN = "https://share.bcailab.com";
const MAPDOWN_ORIGIN = "https://map.bcailab.com";

// The Workers lib in tsconfig.functions.json shadows Node's URL, so the path is derived by
// string surgery rather than through node:url.
const publicDir = decodeURIComponent(import.meta.url)
  .replace(/^file:\/\//, "")
  .replace(/\/functions\/_shared\/[^/]+$/, "/public");

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

  it("does not redirect when Preview uses one host for editing and publishing", () => {
    const previewOrigin = "https://staging.mapdown.pages.dev";
    expect(mapdownRootRedirect(`${previewOrigin}/`, previewOrigin, previewOrigin)).toBeNull();
  });
});

describe("app paths on the published host", () => {
  it("redirects the library and import routes to the editor host, keeping the path", () => {
    expect(
      mapdownRootRedirect(`${PUBLISHED_ORIGIN}/library`, PUBLISHED_ORIGIN, MAPDOWN_ORIGIN)
    ).toBe(`${MAPDOWN_ORIGIN}/library`);
    expect(
      mapdownRootRedirect(`${PUBLISHED_ORIGIN}/import?src=abc`, PUBLISHED_ORIGIN, MAPDOWN_ORIGIN)
    ).toBe(`${MAPDOWN_ORIGIN}/import?src=abc`);
    expect(
      mapdownRootRedirect(`${PUBLISHED_ORIGIN}/library/`, PUBLISHED_ORIGIN, MAPDOWN_ORIGIN)
    ).toBe(`${MAPDOWN_ORIGIN}/library`);
  });

  it("leaves those routes alone on the editor host", () => {
    expect(
      mapdownRootRedirect(`${MAPDOWN_ORIGIN}/library`, PUBLISHED_ORIGIN, MAPDOWN_ORIGIN)
    ).toBeNull();
  });

  it("keeps every routed app path in the redirect list and in the Pages route config", async () => {
    // A path the SPA answers on but the middleware does not see is served straight off the
    // published host by the static asset rewrite — the exact leak this rule exists to stop.
    const routes = JSON.parse(
      await readFile(`${publicDir}/_routes.json`, "utf8")
    ) as { include: string[] };
    const redirects = await readFile(`${publicDir}/_redirects`, "utf8");
    for (const path of APP_PATHS) {
      expect(routes.include).toContain(path);
      expect(
        mapdownRootRedirect(`${PUBLISHED_ORIGIN}${path}`, PUBLISHED_ORIGIN, MAPDOWN_ORIGIN)
      ).not.toBeNull();
      if (path !== "/") expect(redirects).toContain(`${path} /index.html 200`);
    }
  });
});
