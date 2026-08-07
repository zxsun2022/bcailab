import { FONT_STACK } from "../layout/measure";
import type { ThemeSelection } from "../model/types";
import type { MindMapTheme, NodeStyleTokens, PaletteTokens, ShapeTokens } from "./types";

/**
 * The four shapes and ten palettes (D-24). A document picks one of each; the two axes are
 * orthogonal and both are written to the Markdown front matter (`shape:` / `palette:`).
 *
 * Every value is a literal. Nothing here may reference a CSS custom property, because these
 * tokens are read by the SVG exporter as well as by the renderer — see `types.ts`.
 *
 * §12 asks the shapes to be "visually distinct, not minor color variants", so they differ in
 * border language and density as well as in hue; the palettes differ in *personality* (cool /
 * warm / high-saturation / monochrome...), each with designed `{ fill, text }` pairs rather
 * than one hue family tweaked per entry.
 */

const TYPOGRAPHY = {
  fontFamily: FONT_STACK,
  rootFontSize: 18,
  rootFontWeight: 600,
  level1FontSize: 15,
  level1FontWeight: 500,
  nodeFontSize: 13,
  nodeFontWeight: 400,
  lineHeight: 1.45
};

const LAYOUT = {
  rootToFirstLevelGap: 48,
  parentChildGap: 48,
  siblingGap: 10,
  subtreeGap: 18,
  collapseLane: 16
};

function node(
  overrides: Partial<NodeStyleTokens> & Pick<NodeStyleTokens, "background" | "text" | "border">
): NodeStyleTokens {
  return { borderWidth: 1, radius: 6, paddingX: 12, paddingY: 8, maxWidth: 260, ...overrides };
}

export const MINIMAL_LIGHT: ShapeTokens = {
  id: "minimal-light",
  name: "Minimal Light",
  appearance: "light",
  canvas: { background: "#ffffff", exportBackground: "#ffffff" },
  typography: TYPOGRAPHY,
  nodes: {
    root: node({ background: "#1c1e21", text: "#ffffff", border: "#1c1e21", radius: 8, paddingY: 10 }),
    // §13 — hairline-outlined rounded cards: the reference shape, every other preset varies
    // one axis from it (radius, border weight, padding density).
    level1: node({ background: "#f6f7f8", text: "#1c1e21", border: "#c8ccd1", radius: 6 }),
    default: node({ background: "#ffffff", text: "#1c1e21", border: "#d8dce1", radius: 6 }),
    emptyPlaceholderText: "Untitled"
  },
  connectors: { width: 1.5, rootWidth: 2, opacity: 1, defaultColor: "#aab0b8" },
  controls: {
    collapseBackground: "#ffffff",
    collapseText: "#61666d",
    collapseBorder: "#c8ccd1",
    collapseSize: 16,
    collapseFontSize: 9
  },
  interaction: {
    hoverOutline: "#9aa0a8",
    selectedOutline: "#1c1e21",
    selectedOutlineWidth: 2,
    keyboardFocusRing: "#1c1e21",
    editingOutline: "#1c1e21",
    dropIndicator: "#1c1e21",
    invalidDropIndicator: "#c0392b",
    dragPreviewBackground: "rgba(28, 30, 33, 0.08)",
    modalBackdrop: "rgba(0, 0, 0, 0.4)"
  },
  layout: LAYOUT,
  // D-24 — legacy `theme: minimal-light` maps here; the redesigned muted Slate palette
  // replaces the old #6b7280 family that sat in the 3.67–4.85 luminance band where neither
  // white nor dark text cleared AA, flipping text per branch at runtime.
  defaultPaletteId: "slate"
};

export const SOFT_BRANCHES: ShapeTokens = {
  id: "soft-branches",
  name: "Soft Branch Colors",
  appearance: "light",
  canvas: { background: "#fdfdfc", exportBackground: "#fdfdfc" },
  typography: TYPOGRAPHY,
  nodes: {
    // §13 — large-radius soft cards with roomier padding: the "rounded filled cards" language.
    root: node({ background: "#3c3a36", text: "#ffffff", border: "#3c3a36", radius: 14, paddingX: 14, paddingY: 12 }),
    level1: node({ background: "#ffffff", text: "#2b2a27", border: "#ded9d0", radius: 12, paddingX: 14, paddingY: 10 }),
    default: node({ background: "#ffffff", text: "#2b2a27", border: "#e6e2da", radius: 10, paddingX: 14, paddingY: 10 }),
    emptyPlaceholderText: "Untitled"
  },
  connectors: { width: 1.7, rootWidth: 2.1, opacity: 1, defaultColor: "#b8b0a4" },
  controls: {
    collapseBackground: "#ffffff",
    collapseText: "#6b665c",
    collapseBorder: "#ded9d0",
    collapseSize: 16,
    collapseFontSize: 9
  },
  interaction: {
    hoverOutline: "#a8a293",
    selectedOutline: "#3c3a36",
    selectedOutlineWidth: 2,
    keyboardFocusRing: "#3c3a36",
    editingOutline: "#3c3a36",
    dropIndicator: "#3c3a36",
    invalidDropIndicator: "#b23a2f",
    dragPreviewBackground: "rgba(60, 58, 54, 0.10)",
    modalBackdrop: "rgba(0, 0, 0, 0.4)"
  },
  layout: LAYOUT,
  defaultPaletteId: "soft-spectrum"
};

export const BUSINESS: ShapeTokens = {
  id: "business",
  name: "Business",
  appearance: "light",
  canvas: { background: "#ffffff", exportBackground: "#ffffff" },
  typography: TYPOGRAPHY,
  nodes: {
    // §12.3/§13 — squared heavy-border cards with dense padding, restrained blue-grey, and it
    // must print well on white. The palette swap #5a7f9e → #4a6f95 keeps that language while
    // giving every fill a WCAG AA text partner (D-22).
    root: node({ background: "#1f3a5f", text: "#ffffff", border: "#1f3a5f", radius: 2, borderWidth: 2, paddingX: 10, paddingY: 10 }),
    level1: node({ background: "#eef2f7", text: "#12263f", border: "#a9bdd4", radius: 2, borderWidth: 2, paddingX: 10, paddingY: 7 }),
    default: node({ background: "#ffffff", text: "#12263f", border: "#c3d0e0", radius: 2, borderWidth: 1.5, paddingX: 10, paddingY: 7 }),
    emptyPlaceholderText: "Untitled"
  },
  connectors: { width: 1.4, rootWidth: 1.8, opacity: 1, defaultColor: "#93abc4" },
  controls: {
    collapseBackground: "#ffffff",
    collapseText: "#3d6188",
    collapseBorder: "#a9bdd4",
    collapseSize: 16,
    collapseFontSize: 9
  },
  interaction: {
    hoverOutline: "#5a7f9e",
    selectedOutline: "#12263f",
    selectedOutlineWidth: 2,
    keyboardFocusRing: "#12263f",
    editingOutline: "#12263f",
    dropIndicator: "#12263f",
    invalidDropIndicator: "#a83232",
    dragPreviewBackground: "rgba(18, 38, 63, 0.08)",
    modalBackdrop: "rgba(0, 0, 0, 0.45)"
  },
  layout: LAYOUT,
  defaultPaletteId: "corporate"
};

export const DARK: ShapeTokens = {
  id: "dark",
  name: "Dark",
  appearance: "dark",
  // §18 — avoid pure black, which glares against light node surfaces.
  canvas: { background: "#16181c", exportBackground: "#16181c" },
  typography: TYPOGRAPHY,
  nodes: {
    // §13 — medium-radius subtle-border cards on a dark canvas, with the strongest root.
    root: node({ background: "#e8eaed", text: "#16181c", border: "#e8eaed", radius: 10, borderWidth: 1.5, paddingY: 10 }),
    level1: node({ background: "#24272c", text: "#e8eaed", border: "#3a3f46", radius: 8 }),
    default: node({ background: "#1f2226", text: "#e8eaed", border: "#33383f", radius: 6 }),
    emptyPlaceholderText: "Untitled"
  },
  connectors: { width: 1.5, rootWidth: 2, opacity: 1, defaultColor: "#5c636d" },
  controls: {
    collapseBackground: "#24272c",
    collapseText: "#9aa0a8",
    collapseBorder: "#3a3f46",
    collapseSize: 16,
    collapseFontSize: 9
  },
  interaction: {
    hoverOutline: "#6b7280",
    selectedOutline: "#e8eaed",
    selectedOutlineWidth: 2,
    keyboardFocusRing: "#e8eaed",
    editingOutline: "#e8eaed",
    dropIndicator: "#e8eaed",
    invalidDropIndicator: "#e05a5a",
    dragPreviewBackground: "rgba(232, 234, 237, 0.12)",
    modalBackdrop: "rgba(0, 0, 0, 0.6)"
  },
  layout: LAYOUT,
  defaultPaletteId: "night-glow"
};

export const SHAPES: ShapeTokens[] = [MINIMAL_LIGHT, SOFT_BRANCHES, BUSINESS, DARK];

export const DEFAULT_SHAPE_ID = MINIMAL_LIGHT.id;
export const DEFAULT_PALETTE_ID = "slate";

function palette(
  id: string,
  name: string,
  description: string,
  fills: string[],
  text: string
): PaletteTokens {
  return { id, name, description, entries: fills.map((fill) => ({ fill, text })) };
}

/**
 * The ten palettes, each with a name and a personality (D-24).
 *
 * One text colour per palette, chosen so every `{ fill, text }` pair clears WCAG AA 4.5:1 —
 * asserted in `theme.test.ts`, never recomputed at runtime. Slate, Corporate, Mono and the
 * deep colour families carry white text on deliberately darkened fills; Soft Spectrum,
 * Night Glow and Ember carry the near-black on bright fills.
 */
export const SLATE: PaletteTokens = palette(
  "slate",
  "Slate",
  "Muted cool greys — quiet and content-first",
  ["#4b5563", "#5d5446", "#525c45", "#5c4754", "#465c59", "#54475c", "#3f4a5c", "#5f5b66"],
  "#ffffff"
);

export const SOFT_SPECTRUM: PaletteTokens = palette(
  "soft-spectrum",
  "Soft Spectrum",
  "Friendly warm pastel midtones",
  ["#c96a4f", "#c99a4f", "#7ea35c", "#4fa39a", "#5f7fc9", "#9a6ec9", "#c96a9a"],
  "#16181c"
);

export const CORPORATE: PaletteTokens = palette(
  "corporate",
  "Corporate",
  "Restrained blue-grey for formal maps",
  // Deliberately excludes the Business root fill (#1f3a5f) and the level-1 border: a branch
  // colour that is also a node colour makes a connector look like part of a box.
  ["#2f5580", "#3d6188", "#4a6f95", "#4a6b52", "#6b5a4a", "#5f4a6b"],
  "#ffffff"
);

export const NIGHT_GLOW: PaletteTokens = palette(
  "night-glow",
  "Night Glow",
  "Bright saturated spectrum for dark canvases",
  ["#e0836a", "#e0b96a", "#9ac97a", "#6ac9bd", "#7a9fe0", "#b58ae0", "#e08ab5"],
  "#16181c"
);

export const EMBER: PaletteTokens = palette(
  "ember",
  "Ember",
  "Warm ramp from burnt orange to rose",
  ["#d95f1f", "#e8793a", "#eda947", "#e6bd63", "#e05a5a", "#d9708a", "#d96f4f", "#e8a06a"],
  "#16181c"
);

export const GLACIER: PaletteTokens = palette(
  "glacier",
  "Glacier",
  "Deep cool blues and teals",
  ["#1f4e79", "#144b5e", "#1f5f73", "#2d5d8f", "#3a6ea5", "#21606f", "#354f7a", "#0f5c66"],
  "#ffffff"
);

export const FOREST: PaletteTokens = palette(
  "forest",
  "Forest",
  "Deep greens for natural themes",
  ["#1e4620", "#2d5a27", "#3a5f2f", "#24553f", "#1f4d3f", "#37523a", "#2f5d3d", "#44633f"],
  "#ffffff"
);

export const MONO: PaletteTokens = palette(
  "mono",
  "Mono",
  "Grayscale gradient — prints cleanly",
  ["#1f2329", "#272b31", "#343a42", "#41484f", "#4d555e", "#59616b", "#5f6670", "#6d747c"],
  "#ffffff"
);

export const VIVID: PaletteTokens = palette(
  "vivid",
  "Vivid",
  "High-saturation rainbow",
  ["#c0392b", "#a54a1d", "#8a6408", "#1a6e3c", "#117a65", "#1f618d", "#5b2c6f", "#922b6d"],
  "#ffffff"
);

export const EARTH: PaletteTokens = palette(
  "earth",
  "Earth",
  "Ochre, clay and moss",
  ["#6b4f35", "#7d5a3a", "#84683a", "#9c5a3c", "#8c5a4a", "#5f6b3c", "#5d5346", "#7a5d3f"],
  "#ffffff"
);

export const PALETTES: PaletteTokens[] = [
  SLATE,
  SOFT_SPECTRUM,
  CORPORATE,
  NIGHT_GLOW,
  EMBER,
  GLACIER,
  FOREST,
  MONO,
  VIVID,
  EARTH
];

/** §7.3 — an unknown shape id falls back to the default rather than failing the document. */
export function shapeById(id: string): ShapeTokens {
  return SHAPES.find((shape) => shape.id === id) ?? MINIMAL_LIGHT;
}

/** §7.3 — an unknown palette id falls back to the default rather than failing the document. */
export function paletteById(id: string): PaletteTokens {
  return PALETTES.find((palette) => palette.id === id) ?? SLATE;
}

export function isKnownShapeId(id: string): boolean {
  return SHAPES.some((shape) => shape.id === id);
}

export function isKnownPaletteId(id: string): boolean {
  return PALETTES.some((palette) => palette.id === id);
}

/**
 * Step 3 — resolve one shape + one palette into the theme the renderer, exporter and editing
 * overlay read. An unknown palette falls back to the shape's own default so the map keeps its
 * identity; an unknown shape falls back to the default shape (§7.3).
 */
export function resolveTheme(shapeId: string, paletteId: string): MindMapTheme {
  const shape = shapeById(shapeId);
  const palette = isKnownPaletteId(paletteId)
    ? paletteById(paletteId)
    : paletteById(shape.defaultPaletteId);
  const { defaultPaletteId: _ignored, ...tokens } = shape;
  return { ...tokens, branches: palette };
}

/**
 * Canvas affordances (c) — the initial selection for a *fresh* document follows the system
 * colour scheme. Initial value only: a stored document restores its own selection and a user
 * pick wins, so this is read once, at document creation.
 */
export function initialThemeSelection(prefersDark: boolean): ThemeSelection {
  const shape = prefersDark ? DARK : MINIMAL_LIGHT;
  return { shapeId: shape.id, paletteId: shape.defaultPaletteId, branchColorMode: "single" };
}

/**
 * Normalises a theme selection from untrusted input (Markdown front matter, a recovered local
 * snapshot) into the two-axis model.
 *
 * Step 3 back-compat: a legacy single `theme: X` key maps onto `(shape: X, palette: X's
 * default)`; explicit `shape` / `palette` keys win per-axis when present. Unknown ids fall
 * back to defaults, matching §7.3.
 */
export function normalizeThemeSelection(input: {
  themeId?: unknown;
  shapeId?: unknown;
  paletteId?: unknown;
  branchColorMode?: unknown;
}): ThemeSelection {
  const legacy =
    typeof input.themeId === "string" && isKnownShapeId(input.themeId) ? input.themeId : null;
  const requestedShape =
    typeof input.shapeId === "string" && isKnownShapeId(input.shapeId) ? input.shapeId : null;
  const shapeId = requestedShape ?? legacy ?? DEFAULT_SHAPE_ID;

  const requestedPalette =
    typeof input.paletteId === "string" && isKnownPaletteId(input.paletteId)
      ? input.paletteId
      : null;
  const paletteId =
    requestedPalette ??
    (legacy !== null ? shapeById(legacy).defaultPaletteId : null) ??
    shapeById(shapeId).defaultPaletteId;

  const branchColorMode =
    input.branchColorMode === "single" || input.branchColorMode === "by-first-level-branch"
      ? input.branchColorMode
      : "single";

  return { shapeId, paletteId, branchColorMode };
}
