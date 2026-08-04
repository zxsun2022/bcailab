/**
 * Document themes, per `theme.md` §3.
 *
 * **These are data, not CSS.** A theme id is written into the Markdown front matter and its
 * values must render inside an exported SVG that may carry no external dependency
 * (`storage-export.md` §12.3). So every colour here is a literal — never `var(--x)`, never a
 * class name — and a test asserts exactly that, because the failure mode is an export that
 * looks fine in the browser and unstyled everywhere else.
 *
 * Application chrome is a separate system and is **not** described here: D-08 removed the
 * toolbar tokens from this schema. See `docs/mapdown/design-tokens.md`.
 */

export interface CanvasTokens {
  background: string;
  /** Used when the export dialog asks for the theme background rather than transparency. */
  exportBackground: string;
}

export interface TypographyTokens {
  fontFamily: string;
  rootFontSize: number;
  rootFontWeight: number;
  level1FontSize: number;
  level1FontWeight: number;
  nodeFontSize: number;
  nodeFontWeight: number;
  lineHeight: number;
}

export interface NodeStyleTokens {
  background: string;
  text: string;
  border: string;
  borderWidth: number;
  radius: number;
  paddingX: number;
  paddingY: number;
  maxWidth: number;
}

export interface NodeLevelTokens {
  root: NodeStyleTokens;
  level1: NodeStyleTokens;
  default: NodeStyleTokens;
  /** Shown for an empty label in the editor. Never written to an export (§14.3, D-09). */
  emptyPlaceholderText: string;
}

export interface ConnectorTokens {
  width: number;
  rootWidth: number;
  opacity: number;
  defaultColor: string;
}

export interface BranchPaletteTokens {
  /** §8.2 — six to ten distinguishable colours, cycling after exhaustion. */
  colors: string[];
  descendantTintPolicy: "same" | "same-with-opacity";
}

/** §10, minus the toolbar tokens D-08 moved out. */
export interface ControlTokens {
  collapseBackground: string;
  collapseText: string;
  collapseBorder: string;
  collapseSize: number;
  collapseFontSize: number;
}

/**
 * §9 — excluded from export, but defined *per theme* because a focus ring tuned for a light
 * canvas disappears on a dark one.
 */
export interface InteractionTokens {
  hoverOutline: string;
  selectedOutline: string;
  selectedOutlineWidth: number;
  keyboardFocusRing: string;
  editingOutline: string;
  /** §7.2/§7.3 drag-and-drop: a valid before/after/inside drop target. */
  dropIndicator: string;
  /** theme.md §9 requires an invalid drop to differ by shape/pattern too, not colour alone. */
  invalidDropIndicator: string;
  dragPreviewBackground: string;
  modalBackdrop: string;
}

export interface ThemeLayoutTokens {
  rootToFirstLevelGap: number;
  parentChildGap: number;
  siblingGap: number;
  subtreeGap: number;
  collapseLane: number;
}

export interface MindMapTheme {
  id: string;
  name: string;
  appearance: "light" | "dark";
  canvas: CanvasTokens;
  typography: TypographyTokens;
  nodes: NodeLevelTokens;
  connectors: ConnectorTokens;
  branches: BranchPaletteTokens;
  controls: ControlTokens;
  interaction: InteractionTokens;
  layout: ThemeLayoutTokens;
}

/* ---------- contrast, for §18 ---------- */

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function parseHex(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16)
  ];
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG 2.1 contrast ratio, 1–21. §18 targets AA: 4.5 for body text, 3 for large. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [light, dark] = la > lb ? [la, lb] : [lb, la];
  return (light + 0.05) / (dark + 0.05);
}

/** Hue in degrees, used to keep the chrome accent clear of branch colours (C-01). */
export function hueOf(hex: string): number {
  const [r, g, b] = parseHex(hex).map((v) => v / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta === 0) return 0;
  let hue: number;
  if (max === r) hue = ((g - b) / delta) % 6;
  else if (max === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;
  return (hue * 60 + 360) % 360;
}
