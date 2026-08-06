/**
 * Text measurement and wrapping, per `layout-engine.md` §4.
 *
 * Two things the Phase 0 spike deliberately approximated and this does properly:
 *
 * **Wrapping breaks at real line-break opportunities (§4.2).** The spike divided total width by
 * the maximum and called the quotient a line count. That is wrong for any real label: it cannot
 * tell where a break may occur, so it under- or over-counts lines and the node box is the wrong
 * height. Chinese has to wrap without spaces, and Latin must not wrap mid-word — one rule
 * cannot serve both, which is why `Intl.Segmenter` does the segmenting.
 *
 * **Measurements are cached (§4.4).** The editor re-measures on every keystroke; without a
 * cache each one walks every visible node.
 */

export const FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';

export interface Typography {
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  maxWidth: number;
  paddingX: number;
  paddingY: number;
}

export interface Measurement {
  /** Box width including horizontal padding. */
  width: number;
  /** Box height including vertical padding. */
  height: number;
  lines: string[];
}

/* ---------- canvas backend ---------- */

type Measurer = (text: string, typography: Typography) => number;

let canvasContext: CanvasRenderingContext2D | null = null;

function canvasMeasure(text: string, typography: Typography): number {
  if (!canvasContext) {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable — text cannot be measured");
    canvasContext = ctx;
  }
  canvasContext.font = `${typography.fontWeight} ${typography.fontSize}px ${FONT_STACK}`;
  return canvasContext.measureText(text).width;
}

/**
 * Headless fallback so layout is testable without a DOM.
 *
 * Approximates the two width classes that matter — full-width CJK against proportional Latin —
 * because a measurer that returned a constant per character would make every wrapping test
 * meaningless. It is never used in a browser.
 */
function estimateMeasure(text: string, typography: Typography): number {
  let width = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    const fullWidth =
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe30 && code <= 0xfe6f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0x20000 && code <= 0x3fffd);
    width += fullWidth ? typography.fontSize : typography.fontSize * 0.5;
  }
  return width;
}

let measurer: Measurer =
  typeof document === "undefined" ? estimateMeasure : canvasMeasure;

/** Swap the backend — used by tests, and by any future worker-based measurement. */
export function setMeasurer(next: Measurer | null): void {
  measurer = next ?? (typeof document === "undefined" ? estimateMeasure : canvasMeasure);
  cache.clear();
}

export function measureTextWidth(text: string, typography: Typography): number {
  return measurer(text, typography);
}

/* ---------- break opportunities ---------- */

const segmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter(undefined, { granularity: "word" })
    : null;

const graphemes =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;

/**
 * Split into the smallest chunks a line may break between.
 *
 * Word granularity gives the right answer for both scripts at once: it keeps Latin words whole
 * and, because CJK has no spaces, returns Han text in short runs that may be broken between.
 * Without `Intl.Segmenter` this degrades to splitting on spaces, which wraps Chinese badly —
 * acceptable only as a fallback, since every target browser has had Segmenter for years.
 */
function breakChunks(text: string): string[] {
  if (!segmenter) return text.split(/(\s+)/).filter((s) => s !== "");
  return [...segmenter.segment(text)].map((s) => s.segment);
}

/** Grapheme clusters, so emergency breaking never splits an emoji or a combining sequence. */
function clusters(text: string): string[] {
  if (!graphemes) return [...text];
  return [...graphemes.segment(text)].map((s) => s.segment);
}

/**
 * §4.2 — a token longer than the whole line gets emergency breaking rather than overflowing.
 * Breaks land on grapheme boundaries, so a family emoji or an accented cluster stays intact.
 */
function breakLongToken(token: string, maxWidth: number, typography: Typography): string[] {
  const out: string[] = [];
  let line = "";
  for (const cluster of clusters(token)) {
    const candidate = line + cluster;
    if (line !== "" && measurer(candidate, typography) > maxWidth) {
      out.push(line);
      line = cluster;
    } else {
      line = candidate;
    }
  }
  if (line !== "") out.push(line);
  return out;
}

export function wrapText(text: string, typography: Typography): string[] {
  if (text === "") return [""];
  const contentWidth = typography.maxWidth - typography.paddingX * 2;
  if (measurer(text, typography) <= contentWidth) return [text];

  const lines: string[] = [];
  let line = "";

  for (const chunk of breakChunks(text)) {
    // A space that would start a line is dropped rather than indenting the wrapped line.
    if (line === "" && /^\s+$/.test(chunk)) continue;

    const candidate = line + chunk;
    if (measurer(candidate, typography) <= contentWidth) {
      line = candidate;
      continue;
    }

    if (line !== "") {
      lines.push(line.replace(/\s+$/, ""));
      line = "";
    }
    if (/^\s+$/.test(chunk)) continue;

    if (measurer(chunk, typography) > contentWidth) {
      const pieces = breakLongToken(chunk, contentWidth, typography);
      lines.push(...pieces.slice(0, -1));
      line = pieces.at(-1) ?? "";
    } else {
      line = chunk;
    }
  }

  if (line !== "") lines.push(line.replace(/\s+$/, ""));
  return lines.length > 0 ? lines : [""];
}

/* ---------- cache ---------- */

const cache = new Map<string, Measurement>();
/** §4.4 — the cache exists to make typing cheap, not to grow forever with every draft string. */
const MAX_CACHE_ENTRIES = 2000;

function remember(key: string, measurement: Measurement): Measurement {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, measurement);
  return measurement;
}

function cacheKey(text: string, t: Typography): string {
  return `${t.fontSize}|${t.fontWeight}|${t.lineHeight}|${t.maxWidth}|${t.paddingX}|${t.paddingY}|${text}`;
}

/**
 * §4.4 — keyed by text *and* the typography tokens, so a theme change invalidates without
 * anyone remembering to clear anything.
 */
export function measureNode(text: string, typography: Typography): Measurement {
  const key = cacheKey(text, typography);
  const hit = cache.get(key);
  if (hit) return hit;

  const lines = wrapText(text, typography);
  const widest = Math.max(...lines.map((line) => measurer(line, typography)), 0);
  const measurement: Measurement = {
    width: Math.min(widest + typography.paddingX * 2, typography.maxWidth),
    height: lines.length * typography.fontSize * typography.lineHeight + typography.paddingY * 2,
    lines
  };

  return remember(key, measurement);
}

export function clearMeasurementCache(): void {
  cache.clear();
}

export function measurementCacheSize(): number {
  return cache.size;
}
