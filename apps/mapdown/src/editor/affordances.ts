import { getNode, type MindMapDocument } from "../model/types";

/**
 * Canvas affordances (b) — the authoring-hint rule.
 *
 * The hint names the two authoring keys (Enter = sibling, Tab = child) and is meant for a
 * genuinely empty map. It disappears as soon as the map has any content beyond the root, and
 * once dismissed it stays dismissed (the caller persists the dismissal).
 */
export function shouldShowAuthoringHint(doc: MindMapDocument, dismissed: boolean): boolean {
  if (dismissed) return false;
  return getNode(doc, doc.rootId).childIds.length === 0;
}
