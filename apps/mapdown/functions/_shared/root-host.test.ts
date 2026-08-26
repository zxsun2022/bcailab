import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { APP_PATHS, appShellPath, mapdownRootRedirect } from "./root-host";

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

  it("routes every app path through the middleware that guards this host", async () => {
    // A path the SPA answers on but the middleware never sees cannot be redirected at all.
    const routes = JSON.parse(
      await readFile(`${publicDir}/_routes.json`, "utf8")
    ) as { include: string[] };
    for (const path of APP_PATHS) {
      expect(routes.include).toContain(path);
      expect(
        mapdownRootRedirect(`${PUBLISHED_ORIGIN}${path}`, PUBLISHED_ORIGIN, MAPDOWN_ORIGIN)
      ).not.toBeNull();
    }
  });

  it("carries no _redirects file, because the rewrite it expressed does not survive Pages", async () => {
    // `/library /index.html 200` was resolved and then normalised into a 308 to `/`, which lost
    // the route and turned a copy link's `?src=` into a query on the editor root.
    await expect(readFile(`${publicDir}/_redirects`, "utf8")).rejects.toThrow();
  });

  it("has a top-level 404 page so unlisted paths cannot fall back to the editor shell", async () => {
    // Pages treats a project without this file as an SPA and serves `/` for every unknown path.
    // That would let an unlisted path bypass this middleware and expose the editor on the
    // published host.
    const notFound = await readFile(`${publicDir}/404.html`, "utf8");
    expect(notFound).toContain("<title>Page not found · Mapdown</title>");
    expect(notFound).toContain('name="robots" content="noindex, nofollow"');
    expect(notFound).not.toContain("<script");
  });
});

describe("app shell serving", () => {
  it("serves the shared shell for the routed paths that have no asset of their own", () => {
    expect(appShellPath("/library")).toBe("/");
    expect(appShellPath("/library/")).toBe("/");
    expect(appShellPath("/import")).toBe("/");
  });

  it("leaves the root and everything unrouted to the asset pipeline", () => {
    expect(appShellPath("/")).toBeNull();
    expect(appShellPath("/p/abc")).toBeNull();
    expect(appShellPath("/assets/index.js")).toBeNull();
    expect(appShellPath("/librarys")).toBeNull();
  });
});
