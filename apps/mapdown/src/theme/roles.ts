import type { MindMapTheme, NodeStyleTokens } from "./types";

/**
 * §6 — root, first level, and everything deeper. Not a style per depth.
 *
 * Single source of truth for "which tokens does a node at this depth render with".
 * The canvas renderer, the editing overlay and the exporter all read from here so a node
 * can never look different while being edited than it does on the canvas.
 */
export function roleTokens(theme: MindMapTheme, depth: number): NodeStyleTokens {
  if (depth === 0) return theme.nodes.root;
  if (depth === 1) return theme.nodes.level1;
  return theme.nodes.default;
}

export function roleTypography(theme: MindMapTheme, depth: number) {
  const t = theme.typography;
  if (depth === 0) return { size: t.rootFontSize, weight: t.rootFontWeight };
  if (depth === 1) return { size: t.level1FontSize, weight: t.level1FontWeight };
  return { size: t.nodeFontSize, weight: t.nodeFontWeight };
}
