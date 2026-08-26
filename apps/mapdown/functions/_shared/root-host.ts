/**
 * The editor and the published host are one Pages project on two hostnames (D-29). Everything
 * the *app* serves — the editor, the document library, the import route — belongs on the editor
 * origin only; `share.bcailab.com` serves published maps and nothing else.
 *
 * Before the library became a route this was one rule about `/`. Now that the SPA answers on
 * three paths, each of them is redirected to the editor origin when it is requested on the
 * published host. The paths are listed here and in `public/_routes.json`; a path missing from
 * either list never reaches this middleware at all, which is what `root-host.test.ts` guards.
 *
 * `_routes.json` decides which requests reach Functions, so this middleware is only half of the
 * host boundary. The other half is `public/404.html`: its presence disables Pages' implicit SPA
 * fallback and makes every unlisted path return 404 instead of serving the editor shell. Keep
 * both files when adding or changing an app route.
 */
export const APP_PATHS = ["/", "/library", "/import"] as const;

function normalize(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

export function isAppPath(pathname: string): boolean {
  const path = normalize(pathname);
  return APP_PATHS.some((appPath) => appPath === path);
}

export function mapdownRootRedirect(
  requestUrl: string,
  publishedOrigin: string,
  mapdownOrigin: string
): string | null {
  const url = new URL(requestUrl);
  if (publishedOrigin === mapdownOrigin) return null;
  if (url.origin !== publishedOrigin) return null;
  // Send the person to the same surface on the host that owns it, rather than to the root, so a
  // shared `/library` link still lands on the library.
  const path = normalize(url.pathname);
  if (!isAppPath(path)) return null;
  return `${mapdownOrigin}${path === "/" ? "" : path}${url.search}`;
}

/**
 * The asset a routed app path should be served, or `null` when the request is not one.
 *
 * `/library` and `/import` have no asset of their own — the SPA renders them from the same
 * shell as `/`. The obvious way to say that is a `_redirects` rewrite, and it does not work:
 * Pages resolves `/library /index.html 200`, then normalises the `/index.html` destination into
 * a **308 to `/`**, so the route is lost and `/import?src=…` arrives at the editor root carrying
 * a stray query. That was observed in production, not inferred.
 *
 * Asking the asset pipeline for `/` instead depends on nothing but a file that provably exists.
 */
export function appShellPath(pathname: string): string | null {
  const path = normalize(pathname);
  return path !== "/" && isAppPath(path) ? "/" : null;
}
