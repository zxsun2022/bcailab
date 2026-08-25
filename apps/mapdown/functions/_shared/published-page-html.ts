import { escapeHtml } from "./public-page";

/**
 * The published page's markup, as a pure function of the publication.
 *
 * It lives here rather than inline in the route handler for two reasons. It is the page's
 * security contract — the `noindex` and referrer rules, the absence of any inline script, the
 * fact that the frozen SVG is present in the served HTML rather than injected later — and a
 * contract worth stating is worth testing. And the live viewer bundle is enhancement over this
 * markup, so being able to render it without a D1 binding is what makes the enhancement
 * verifiable in a browser.
 *
 * The `<img>` is the page. `/published/viewer.js` replaces it with an interactive map only
 * after it has one to show (D-32); with no JavaScript, an unsupported view format, or a
 * publication frozen before the view snapshot existed, this is what a reader gets — and it is
 * complete.
 */
export interface PublishedPageInput {
  publicId: string;
  title: string;
  version: number;
  /** Link unfurlers get the PNG when one exists; the SVG is the reader-facing asset. */
  hasPngPreview: boolean;
  publishedOrigin: string;
  /** The request path, so relative asset links work on a preview host too. */
  pathname: string;
}

export function publishedPageHtml(input: PublishedPageInput): string {
  const canonical = `${input.publishedOrigin}/p/${input.publicId}`;
  const imageUrl = `${input.publishedOrigin}/p/${input.publicId}/${input.hasPngPreview ? "map.png" : "map.svg"}`;
  const imageType = input.hasPngPreview ? "image/png" : "image/svg+xml";
  const title = escapeHtml(input.title);
  const pathname = input.pathname;
  return `<!doctype html>
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
    <meta property="og:image:type" content="${imageType}" />
    ${input.hasPngPreview ? '<meta property="og:image:width" content="1200" /><meta property="og:image:height" content="630" />' : ""}
    <link rel="stylesheet" href="/published.css" />
    <script type="module" src="/published/viewer.js"></script>
  </head>
  <body>
    <header class="published-header">
      <a class="published-brand" href="https://map.bcailab.com">Mapdown</a>
      <div>
        <h1>${title}</h1>
        <p>Published version ${Number(input.version).toLocaleString()} · frozen snapshot</p>
      </div>
      <div class="published-controls" role="group" aria-label="Map zoom">
        <button type="button" data-zoom-out aria-label="Zoom out">−</button>
        <button type="button" data-fit>Fit</button>
        <button type="button" data-zoom-in aria-label="Zoom in">+</button>
      </div>
    </header>
    <main class="published-viewport" data-viewport aria-label="Published mind map">
      <div class="published-fallback" data-map-fallback tabindex="0">
        <img data-map-image src="${escapeHtml(`${pathname}/map.svg`)}" alt="${title}" />
      </div>
    </main>
    <footer class="published-footer">
      <a href="${escapeHtml(`${pathname}/map.md`)}">Download Markdown</a>
      <details>
        <summary>Report this map</summary>
        <form method="post" action="${escapeHtml(`${pathname}/report`)}">
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
}
