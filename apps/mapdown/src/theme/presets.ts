import { FONT_STACK } from "../layout/measure";
import type { MindMapTheme, NodeStyleTokens } from "./types";

/**
 * The four presets `product-specification.md` §13 requires.
 *
 * Every value is a literal. Nothing here may reference a CSS custom property, because these
 * tokens are read by the SVG exporter as well as by the renderer — see `types.ts`.
 *
 * §12 asks the presets to be "visually distinct, not minor color variants", so they differ in
 * border language and density as well as in hue.
 */

const TYPOGRAPHY = {
  fontFamily: FONT_STACK,
  rootFontSize: 16,
  rootFontWeight: 600,
  level1FontSize: 14,
  level1FontWeight: 500,
  nodeFontSize: 14,
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

function node(overrides: Partial<NodeStyleTokens> & Pick<NodeStyleTokens, "background" | "text" | "border">): NodeStyleTokens {
  return { borderWidth: 1, radius: 6, paddingX: 12, paddingY: 8, maxWidth: 260, ...overrides };
}

export const MINIMAL_LIGHT: MindMapTheme = {
  id: "minimal-light",
  name: "Minimal Light",
  appearance: "light",
  canvas: { background: "#ffffff", exportBackground: "#ffffff" },
  typography: TYPOGRAPHY,
  nodes: {
    root: node({ background: "#1c1e21", text: "#ffffff", border: "#1c1e21", radius: 8 }),
    level1: node({ background: "#f6f7f8", text: "#1c1e21", border: "#c8ccd1" }),
    default: node({ background: "#ffffff", text: "#1c1e21", border: "#d8dce1" }),
    emptyPlaceholderText: "Untitled"
  },
  connectors: { width: 1.4, rootWidth: 1.8, opacity: 1, defaultColor: "#b9bec6" },
  // Muted, so the map reads as content-first (§12.1). Deliberately no blue near the chrome
  // accent — see C-01 in docs/mapdown/design-tokens.md.
  branches: {
    colors: ["#6b7280", "#8a7f6d", "#7d8a6d", "#8a6d7d", "#6d8a86", "#7f6d8a"],
    descendantTintPolicy: "same"
  },
  controls: {
    collapseBackground: "#ffffff",
    collapseText: "#61666d",
    collapseBorder: "#c8ccd1",
    collapseSize: 14,
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
  layout: LAYOUT
};

export const SOFT_BRANCHES: MindMapTheme = {
  id: "soft-branches",
  name: "Soft Branch Colors",
  appearance: "light",
  canvas: { background: "#fdfdfc", exportBackground: "#fdfdfc" },
  typography: TYPOGRAPHY,
  nodes: {
    root: node({ background: "#3c3a36", text: "#ffffff", border: "#3c3a36", radius: 10 }),
    level1: node({ background: "#ffffff", text: "#2b2a27", border: "#ded9d0", radius: 10 }),
    default: node({ background: "#ffffff", text: "#2b2a27", border: "#e6e2da", radius: 10 }),
    emptyPlaceholderText: "Untitled"
  },
  connectors: { width: 1.6, rootWidth: 2, opacity: 1, defaultColor: "#c9c2b6" },
  // §8.3 — saturated enough to tell apart, but never used behind text, so contrast is the
  // node background's job rather than the palette's.
  branches: {
    colors: ["#c96a4f", "#c99a4f", "#7ea35c", "#4fa39a", "#5f7fc9", "#9a6ec9", "#c96a9a"],
    descendantTintPolicy: "same-with-opacity"
  },
  controls: {
    collapseBackground: "#ffffff",
    collapseText: "#6b665c",
    collapseBorder: "#ded9d0",
    collapseSize: 14,
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
  layout: LAYOUT
};

export const BUSINESS: MindMapTheme = {
  id: "business",
  name: "Business",
  appearance: "light",
  canvas: { background: "#ffffff", exportBackground: "#ffffff" },
  typography: TYPOGRAPHY,
  nodes: {
    // §12.3 — squarer cards, restrained blue-grey, and it must print well on white.
    root: node({ background: "#1f3a5f", text: "#ffffff", border: "#1f3a5f", radius: 3 }),
    level1: node({ background: "#eef2f7", text: "#12263f", border: "#a9bdd4", radius: 3 }),
    default: node({ background: "#ffffff", text: "#12263f", border: "#c3d0e0", radius: 3 }),
    emptyPlaceholderText: "Untitled"
  },
  connectors: { width: 1.2, rootWidth: 1.6, opacity: 1, defaultColor: "#a9bdd4" },
  branches: {
    // Deliberately excludes the root fill (#1f3a5f) and the level-1 border: a branch colour
    // that is also a node colour makes a connector look like part of a box.
    colors: ["#2f5580", "#3d6188", "#5a7f9e", "#4a6b52", "#6b5a4a", "#5f4a6b"],
    descendantTintPolicy: "same"
  },
  controls: {
    collapseBackground: "#ffffff",
    collapseText: "#3d6188",
    collapseBorder: "#a9bdd4",
    collapseSize: 14,
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
  layout: LAYOUT
};

export const DARK: MindMapTheme = {
  id: "dark",
  name: "Dark",
  appearance: "dark",
  // §18 — avoid pure black, which glares against light node surfaces.
  canvas: { background: "#16181c", exportBackground: "#16181c" },
  typography: TYPOGRAPHY,
  nodes: {
    root: node({ background: "#e8eaed", text: "#16181c", border: "#e8eaed", radius: 8 }),
    level1: node({ background: "#24272c", text: "#e8eaed", border: "#3a3f46" }),
    default: node({ background: "#1f2226", text: "#e8eaed", border: "#33383f" }),
    emptyPlaceholderText: "Untitled"
  },
  connectors: { width: 1.4, rootWidth: 1.8, opacity: 1, defaultColor: "#4a5058" },
  branches: {
    colors: ["#e0836a", "#e0b96a", "#9ac97a", "#6ac9bd", "#7a9fe0", "#b58ae0", "#e08ab5"],
    descendantTintPolicy: "same"
  },
  controls: {
    collapseBackground: "#24272c",
    collapseText: "#9aa0a8",
    collapseBorder: "#3a3f46",
    collapseSize: 14,
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
  layout: LAYOUT
};

export const THEMES: MindMapTheme[] = [MINIMAL_LIGHT, SOFT_BRANCHES, BUSINESS, DARK];

export const DEFAULT_THEME_ID = MINIMAL_LIGHT.id;

/** §7.3 — an unknown theme id falls back to the default rather than failing the document. */
export function themeById(id: string): MindMapTheme {
  return THEMES.find((theme) => theme.id === id) ?? MINIMAL_LIGHT;
}
