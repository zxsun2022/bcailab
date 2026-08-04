import { getNode, type MindMapDocument, type NodeId } from "../model/types";
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
