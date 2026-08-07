import { getNode, type MindMapDocument, type NodeId } from "../model/types";
import { roleTokens } from "./roles";
import { contrastRatio, parseHex, type MindMapTheme } from "./types";

/**
 * §8.1 — branch colours are assigned by **semantic first-level order**, not by the current
 * left/right partition.
 *
 * The consequence is the point: moving a branch from one side to the other does not change its
 * colour. Assigning by visual position would make a purely presentational command repaint the
 * map, which is the kind of surprise `vision.md` §9 lists as a regression.
 *
 * §8.2 — the palette cycles once exhausted. Repeats are acceptable because colour is decorative;
 * it is never the only thing distinguishing two branches.
 */
export function branchColorFor(
  doc: MindMapDocument,
  theme: MindMapTheme,
  nodeId: NodeId
): string | null {
  if (doc.theme.branchColorMode !== "by-first-level-branch") return null;
  if (nodeId === doc.rootId) return null;

  const firstLevel = getNode(doc, doc.rootId).childIds;

  // Walk up to the first-level ancestor; every descendant inherits its colour.
  let current = getNode(doc, nodeId);
  while (current.parentId !== null && current.parentId !== doc.rootId) {
    current = getNode(doc, current.parentId);
  }

  const index = firstLevel.indexOf(current.id);
  if (index === -1) return null;

  const palette = theme.branches.colors;
  return palette[index % palette.length] ?? null;
}

/**
 * The colour a connector into `nodeId` should take.
 *
 * Descendants inherit the branch colour so a subtree reads as one limb; in `single` mode the
 * whole map uses the theme's connector colour instead.
 */
export function connectorColorFor(
  doc: MindMapDocument,
  theme: MindMapTheme,
  nodeId: NodeId
): string {
  return branchColorFor(doc, theme, nodeId) ?? theme.connectors.defaultColor;
}

/** The two text candidates — pure white and the near-black used by the Dark canvas. */
const TEXT_LIGHT = "#ffffff";
const TEXT_DARK = "#16181c";
/** §8.3 / §18 — body text must clear WCAG AA (4.5:1). */
const AA_TEXT_RATIO = 4.5;
/** §8.3 — same-with-opacity descendants tint at the connector fade used today. */
const DESCENDANT_TINT_OPACITY = 0.65;

/**
 * The text colour that reads on a given fill. Choosing between white and a near-black per
 * fill is what lets the branch palettes sit behind text at all: every preset palette colour
 * clears 4.5:1 with one of the two (asserted in `theme.test.ts`).
 */
export function accessibleTextFor(fill: string): string {
  const light = contrastRatio(fill, TEXT_LIGHT);
  const dark = contrastRatio(fill, TEXT_DARK);
  if (light >= AA_TEXT_RATIO) return TEXT_LIGHT;
  if (dark >= AA_TEXT_RATIO) return TEXT_DARK;
  return light >= dark ? TEXT_LIGHT : TEXT_DARK;
}

/** Alpha-blend `fg` over `bg`, returning an opaque hex — export stays literal and solid. */
export function blendHex(fg: string, bg: string, alpha: number): string {
  const [rf, gf, bf] = parseHex(fg);
  const [rb, gb, bb] = parseHex(bg);
  const mix = (over: number, under: number) => Math.round(over * alpha + under * (1 - alpha));
  const toHex = (value: number) => value.toString(16).padStart(2, "0");
  return `#${toHex(mix(rf, rb))}${toHex(mix(gf, gb))}${toHex(mix(bf, bb))}`;
}

export interface NodeFillAndText {
  background: string;
  text: string;
}

/**
 * Theme differentiation step 1 — the branch palette reaches the nodes.
 *
 * In `by-first-level-branch` mode the first-level fill is the branch colour and its text the
 * accessible partner of that fill. Descendants follow `descendantTintPolicy`: `same` themes
 * keep the full branch colour; `same-with-opacity` themes (Soft Branch Colors) tint at the
 * same 0.65 the connectors use, blended over the canvas so the fill stays opaque and exports
 * carry a literal. `single` mode returns the role tokens verbatim, so it renders exactly as
 * before — the root never takes a branch colour either way.
 */
export function nodeFillAndTextFor(
  doc: MindMapDocument,
  theme: MindMapTheme,
  nodeId: NodeId,
  depth: number
): NodeFillAndText {
  const tokens = roleTokens(theme, depth);
  const branch = branchColorFor(doc, theme, nodeId);
  if (branch === null) return { background: tokens.background, text: tokens.text };

  const fill =
    depth > 1 && theme.branches.descendantTintPolicy === "same-with-opacity"
      ? blendHex(branch, theme.canvas.background, DESCENDANT_TINT_OPACITY)
      : branch;
  return { background: fill, text: accessibleTextFor(fill) };
}
