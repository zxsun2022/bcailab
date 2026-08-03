/*
 * Phase 0 spike 2 — text measurement and SVG serialisation for CJK.
 *
 * Two jobs that must agree, or nodes are the wrong size in the export:
 *   1. measure a label so layout can size its node box   (canvas 2D)
 *   2. serialise that label into an SVG <text> element    (string building)
 *
 * If (1) and (2) disagree about the font, every node is subtly wrong — and CJK is where they
 * diverge, because a Han glyph is full-width while Latin is proportional.
 */

/**
 * The one font stack, shared by measurement, on-screen rendering and export.
 *
 * theme.md §5 requires system fonts: an exported SVG may carry no external dependency
 * (storage-export.md §12.3), so a web font is either an illegal network reference or an
 * embedding-and-licensing problem. The cost is that the *recipient's* machine resolves this
 * stack, which is exactly what this spike measures.
 */
export const FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';

let ctx: CanvasRenderingContext2D | null = null;

function context(): CanvasRenderingContext2D {
  if (!ctx) {
    const canvas = document.createElement("canvas");
    const c = canvas.getContext("2d");
    if (!c) throw new Error("2D canvas context unavailable — text measurement cannot proceed");
    ctx = c;
  }
  return ctx;
}

export function measureText(text: string, fontSize: number): number {
  const c = context();
  c.font = `${fontSize}px ${FONT_STACK}`;
  return c.measureText(text).width;
}

/**
 * Which font the browser actually resolved from the stack. `document.fonts.check` reports
 * whether a family can render a given sample, so a CJK sample distinguishes a Han-capable
 * family from a Latin-only one that would silently fall back.
 */
export function resolveFontFor(sample: string, fontSize: number): string {
  const families = FONT_STACK.split(",").map((f) => f.trim().replace(/^"|"$/g, ""));
  for (const family of families) {
    const quoted = family.includes(" ") ? `"${family}"` : family;
    try {
      if (document.fonts.check(`${fontSize}px ${quoted}`, sample)) return family;
    } catch {
      // check() throws on malformed families in some engines; treat as a miss.
    }
  }
  return "(no family in the stack claimed this sample)";
}

/** XML escaping. Node labels are user text and must never be able to inject markup. */
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export type ExportNode = { text: string; x: number; y: number };

export function buildSvg(nodes: ExportNode[], fontSize: number, background: string | null) {
  const pad = 24;
  const boxes = nodes.map((n) => {
    const w = measureText(n.text, fontSize) + 24;
    const h = fontSize * 1.9;
    return { ...n, w, h };
  });

  const width = Math.max(...boxes.map((b) => b.x + b.w)) + pad;
  const height = Math.max(...boxes.map((b) => b.y + b.h)) + pad;

  const bg = background
    ? `<rect width="${width}" height="${height}" fill="${background}"/>`
    : "";

  const body = boxes
    .map((b) => {
      const label = escapeXml(b.text);
      return (
        `<g>` +
        `<rect x="${b.x}" y="${b.y}" width="${b.w.toFixed(1)}" height="${b.h.toFixed(1)}" rx="6" ` +
        `fill="#ffffff" stroke="#c8ccd1"/>` +
        // dominant-baseline is the portable way to centre text vertically without measuring
        // ascent/descent per family, which differs sharply between Latin and CJK faces.
        `<text x="${(b.x + 12).toFixed(1)}" y="${(b.y + b.h / 2).toFixed(1)}" ` +
        `font-family='${FONT_STACK}' font-size="${fontSize}" fill="#1c1e21" ` +
        `dominant-baseline="central">${label}</text>` +
        `</g>`
      );
    })
    .join("");

  return {
    svg:
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width.toFixed(0)}" ` +
      `height="${height.toFixed(0)}" viewBox="0 0 ${width.toFixed(0)} ${height.toFixed(0)}">` +
      bg +
      body +
      `</svg>`,
    width,
    height
  };
}

/**
 * Rasterise by loading the SVG into an <img> and drawing it to a canvas.
 *
 * This is the step with real failure modes: the SVG renders in an isolated context where the
 * page's CSS does not apply and external references are refused. System fonts survive that;
 * a web font would not, which is the practical reason the no-external-dependency rule is not
 * merely a policy preference.
 */
export function rasterise(svg: string, width: number, height: number, scale: number) {
  return new Promise<{ url: string; blank: boolean }>((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(width * scale);
      canvas.height = Math.ceil(height * scale);
      const c = canvas.getContext("2d");
      if (!c) {
        URL.revokeObjectURL(url);
        reject(new Error("2D context unavailable"));
        return;
      }
      c.scale(scale, scale);
      c.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);

      // A tainted or empty raster is the silent failure this check exists to catch:
      // storage-export.md §13.2 forbids producing an empty or clipped image quietly.
      let blank = true;
      try {
        const data = c.getImageData(0, 0, canvas.width, canvas.height).data;
        for (let i = 3; i < data.length; i += 4) {
          if (data[i] !== 0) {
            blank = false;
            break;
          }
        }
      } catch {
        blank = false; // canvas tainted — cannot inspect, but it did draw
      }

      resolve({ url: canvas.toDataURL("image/png"), blank });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("SVG failed to load into an image — the export would be blank"));
    };
    img.src = url;
  });
}
