import { escapeHtml, isPublishedRequest, notFoundPage, publicHeaders } from "../../_shared/public-page";

export const onRequestGet: PagesFunction<Env> = async (context) => {
  if (!isPublishedRequest(context.request, context.env)) return notFoundPage();
  const publicId = typeof context.params.publicId === "string" ? context.params.publicId : "";
  const publication = await context.env.DB.prepare(`
    SELECT title, version, updated_at
    FROM mapdown_publications
    WHERE public_id = ? AND revoked_at IS NULL
    LIMIT 1
  `).bind(publicId).first<{ title: string; version: number; updated_at: number }>();
  if (!publication) return notFoundPage();

  const url = new URL(context.request.url);
  const canonical = `${context.env.PUBLISHED_ORIGIN}/p/${publicId}`;
  const imageUrl = `${context.env.PUBLISHED_ORIGIN}/p/${publicId}/map.svg`;
  const title = escapeHtml(publication.title);
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow, noarchive" />
    <meta name="referrer" content="no-referrer" />
    <title>${title} · Mapdown</title>
    <link rel="canonical" href="${escapeHtml(canonical)}" />
    <meta property="og:title" content="${title}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${escapeHtml(canonical)}" />
    <meta property="og:image" content="${escapeHtml(imageUrl)}" />
    <meta property="og:image:type" content="image/svg+xml" />
    <link rel="stylesheet" href="/published.css" />
    <script src="/published.js" defer></script>
  </head>
  <body>
    <header class="published-header">
      <a class="published-brand" href="https://map.bcailab.com">Mapdown</a>
      <div>
        <h1>${title}</h1>
        <p>Published version ${Number(publication.version).toLocaleString()} · frozen snapshot</p>
      </div>
      <div class="published-controls" role="group" aria-label="Map zoom">
        <button type="button" data-zoom-out aria-label="Zoom out">−</button>
        <button type="button" data-fit>Fit</button>
        <button type="button" data-zoom-in aria-label="Zoom in">+</button>
      </div>
    </header>
    <main class="published-viewport" data-viewport tabindex="0" aria-label="Published mind map">
      <img data-map-image src="${escapeHtml(`${url.pathname}/map.svg`)}" alt="${title}" />
    </main>
    <footer class="published-footer">
      <a href="${escapeHtml(`${url.pathname}/map.md`)}">Download Markdown</a>
      <details>
        <summary>Report this map</summary>
        <form method="post" action="${escapeHtml(`${url.pathname}/report`)}">
          <label>Reason
            <select name="reason" required>
              <option value="spam">Spam or misleading content</option>
              <option value="harassment">Harassment or hateful content</option>
              <option value="copyright">Copyright concern</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label>Details (optional)
            <textarea name="details" maxlength="500" rows="3"></textarea>
          </label>
          <input class="published-honeypot" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" />
          <button type="submit">Send report</button>
        </form>
      </details>
    </footer>
  </body>
</html>`;
  return new Response(html, { headers: publicHeaders() });
};
