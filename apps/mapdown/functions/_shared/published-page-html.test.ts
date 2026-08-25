import { describe, expect, it } from "vitest";
import { PUBLIC_CSP } from "./public-page";
import { publishedPageHtml } from "./published-page-html";

const input = {
  publicId: "a1b2c3d4e5f6a7b8",
  title: "Publishing pipeline",
  version: 2,
  hasPngPreview: true,
  publishedOrigin: "https://share.bcailab.com",
  pathname: "/p/a1b2c3d4e5f6a7b8"
};

describe("published page markup", () => {
  it("serves the frozen SVG in the HTML, so the page works before and without JavaScript", () => {
    const html = publishedPageHtml(input);
    expect(html).toContain('<img data-map-image src="/p/a1b2c3d4e5f6a7b8/map.svg"');
    expect(html).toContain("data-map-fallback");
    // The live layer is an enhancement over that image; it must not be what makes the page work.
    expect(html).toContain('<script type="module" src="/published/viewer.js"></script>');
  });

  it("carries no inline script, which is what the CSP forbids", () => {
    const html = publishedPageHtml(input);
    expect(PUBLIC_CSP).toContain("script-src 'self'");
    expect(PUBLIC_CSP).not.toContain("'unsafe-inline'");
    expect(html).not.toMatch(/<script(?![^>]*\ssrc=)[^>]*>/);
    expect(html).not.toMatch(/\son[a-z]+\s*=/i);
  });

  it("permits only same-origin fetches, for its own view snapshot", () => {
    expect(PUBLIC_CSP).toContain("connect-src 'self'");
    expect(PUBLIC_CSP).toContain("default-src 'none'");
    expect(PUBLIC_CSP).toContain("frame-ancestors 'none'");
  });

  it("keeps the map unindexed and the referrer unsent", () => {
    const html = publishedPageHtml(input);
    expect(html).toContain('<meta name="robots" content="noindex, nofollow, noarchive" />');
    expect(html).toContain('<meta name="referrer" content="no-referrer" />');
  });

  it("advertises the PNG to unfurlers when there is one, and the SVG otherwise", () => {
    expect(publishedPageHtml(input)).toContain(
      '<meta property="og:image" content="https://share.bcailab.com/p/a1b2c3d4e5f6a7b8/map.png" />'
    );
    expect(publishedPageHtml(input)).toContain('<meta property="og:image:width" content="1200" />');
    const noPng = publishedPageHtml({ ...input, hasPngPreview: false });
    expect(noPng).toContain('content="https://share.bcailab.com/p/a1b2c3d4e5f6a7b8/map.svg"');
    expect(noPng).not.toContain("og:image:width");
  });

  it("escapes a hostile title everywhere it appears", () => {
    const html = publishedPageHtml({ ...input, title: '</title><script>alert(1)</script>' });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });
});
