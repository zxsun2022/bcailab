import { getNode, type MindMapDocument, type NodeId } from "../model/types";
import { roleTokens } from "./roles";
import type { MindMapTheme } from "./types";

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
function branchIndexFor(doc: MindMapDocument, theme: MindMapTheme, nodeId: NodeId): number | null {
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
  return index % theme.branches.entries.length;
}

export function branchColorFor(
  doc: MindMapDocument,
  theme: MindMapTheme,
  nodeId: NodeId
): string | null {
  const index = branchIndexFor(doc, theme, nodeId);
  return index === null ? null : theme.branches.entries[index]!.fill;
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

export interface NodeFillAndText {
  background: string;
  text: string;
}

/**
 * Step 3 (D-24) — the XMind model for where branch colour may live.
 *
 * In `by-first-level-branch` mode the **first-level** fill is the palette entry and its text
 * the entry's designed `text` — authored data, never computed from the fill at runtime. Deeper
 * nodes return to the role tokens and carry no fill tint at all; their subtree reads as one
 * limb through the coloured connector alone, and hierarchy comes back from the shape layer
 * (finer border, paler ground). This is what keeps the designed `{ fill, text }` pair intact —
 * a blended fill would no longer correspond to the author's text colour.
 *
 * `single` mode returns the role tokens verbatim, so it renders exactly as before — the root
 * never takes a branch colour either way.
 */
export function nodeFillAndTextFor(
  doc: MindMapDocument,
  theme: MindMapTheme,
  nodeId: NodeId,
  depth: number
): NodeFillAndText {
  const tokens = roleTokens(theme, depth);
  const index = branchIndexFor(doc, theme, nodeId);
  if (index === null || depth > 1) return { background: tokens.background, text: tokens.text };
  const entry = theme.branches.entries[index]!;
  return { background: entry.fill, text: entry.text };
}
