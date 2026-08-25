/**
 * The editor and the published host are one Pages project on two hostnames (D-29). Everything
 * the *app* serves — the editor, the document library, the import route — belongs on the editor
 * origin only; `share.bcailab.com` serves published maps and nothing else.
 *
 * Before the library became a route this was one rule about `/`. Now that the SPA answers on
 * three paths, each of them would otherwise be reachable on the published host through the
 * static-asset rewrite, which would put the editor and its account UI on the cookie-free
 * user-content origin. The paths are listed here and in `public/_routes.json`; a path missing
 * from either list is a leak, which is what `root-host.test.ts` is guarding.
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
