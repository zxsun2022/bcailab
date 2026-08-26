import { useSyncExternalStore } from "react";

/**
 * The three surfaces Mapdown serves from its own origin.
 *
 * Real paths rather than hash fragments, because the document library is a place people should
 * be able to bookmark, link to, and reach with Back. Each path has an entry in
 * `public/_routes.json` so `_middleware.ts` can serve the shared shell on the editor origin and
 * keep the editor off `share.bcailab.com`. A top-level `public/404.html` disables Pages' implicit
 * SPA fallback, so paths outside this explicit set fail closed — see D-31.
 *
 * The historical Phase 0 spikes still live behind `#ime` / `#svg-export` / `#layout`; they are
 * hash-only and deliberately not routes.
 */
export type Route =
  | { name: "editor" }
  | { name: "library" }
  | { name: "import"; publicId: string };

export const LIBRARY_PATH = "/library";
export const IMPORT_PATH = "/import";

/** The published-map id is a `randomToken(16)` hex string; anything else is not a link we made. */
const PUBLIC_ID = /^[0-9a-f]{1,64}$/i;

export function parseRoute(pathname: string, search: string): Route {
  const path = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  if (path === LIBRARY_PATH) return { name: "library" };
  if (path === IMPORT_PATH) {
    const publicId = new URLSearchParams(search).get("src") ?? "";
    return { name: "import", publicId: PUBLIC_ID.test(publicId) ? publicId : "" };
  }
  return { name: "editor" };
}

export function routePath(route: Route): string {
  if (route.name === "library") return LIBRARY_PATH;
  if (route.name === "import") return `${IMPORT_PATH}?src=${encodeURIComponent(route.publicId)}`;
  return "/";
}

const ROUTE_CHANGED = "mapdown:routechange";

/**
 * `pushState` does not fire `popstate`, so a programmatic navigation has to announce itself.
 * Everything else — Back, Forward, a typed URL — arrives as `popstate` or a fresh load.
 */
export function navigate(route: Route, options: { replace?: boolean } = {}): void {
  const path = routePath(route);
  const current = `${window.location.pathname}${window.location.search}`;
  if (path === current) return;
  if (options.replace) window.history.replaceState(null, "", path);
  else window.history.pushState(null, "", path);
  window.dispatchEvent(new Event(ROUTE_CHANGED));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("popstate", onChange);
  window.addEventListener(ROUTE_CHANGED, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(ROUTE_CHANGED, onChange);
  };
}

/**
 * The snapshot must be referentially stable between real navigations or `useSyncExternalStore`
 * re-renders forever, so the parsed route is cached against the location string it came from.
 */
let cachedKey = "";
let cachedRoute: Route = { name: "editor" };

function currentRoute(): Route {
  const key = `${window.location.pathname}${window.location.search}`;
  if (key !== cachedKey) {
    cachedKey = key;
    cachedRoute = parseRoute(window.location.pathname, window.location.search);
  }
  return cachedRoute;
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, currentRoute, () => ({ name: "editor" }) as Route);
}
