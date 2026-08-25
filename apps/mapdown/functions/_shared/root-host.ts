export function mapdownRootRedirect(
  requestUrl: string,
  publishedOrigin: string,
  mapdownOrigin: string
): string | null {
  const url = new URL(requestUrl);
  return url.pathname === "/" && url.origin === publishedOrigin ? mapdownOrigin : null;
}
