export const PUBLIC_CSP = [
  "default-src 'none'",
  "img-src 'self'",
  "style-src 'self'",
  "script-src 'self'",
  "form-action 'self'",
  "base-uri 'none'",
  "frame-ancestors 'none'"
].join("; ");

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function publicHeaders(contentType = "text/html; charset=utf-8"): Headers {
  return new Headers({
    "Cache-Control": "no-store",
    "Content-Type": contentType,
    "Content-Security-Policy": PUBLIC_CSP,
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow, noarchive"
  });
}

export function isPublishedRequest(request: Request, env: Env): boolean {
  const url = new URL(request.url);
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname.endsWith(".localhost");
  return local || url.origin === env.PUBLISHED_ORIGIN;
}

export function notFoundPage(): Response {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>Map not found · Mapdown</title><link rel="stylesheet" href="/published.css"></head><body><main class="published-message"><h1>Map not found</h1><p>This link is invalid or has been unpublished.</p></main></body></html>`, {
    status: 404,
    headers: publicHeaders()
  });
}

export function messagePage(title: string, message: string, status = 200): Response {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(title)} · Mapdown</title><link rel="stylesheet" href="/published.css"></head><body><main class="published-message"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><p><a href="../">Return to the map</a></p></main></body></html>`, {
    status,
    headers: publicHeaders()
  });
}
