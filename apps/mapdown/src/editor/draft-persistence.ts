import { applyCommand } from "../model/commands";
import {
  getNode,
  normalizeText,
  type MindMapDocument,
  type NodeId
} from "../model/types";

/**
 * Claims an editing session synchronously so two focus events from one interaction cannot
 * commit or cancel it twice before React renders the new state.
 */
export function takeEditingSession<T>(active: { current: T | null }): T | null {
  const session = active.current;
  active.current = null;
  return session;
}

/**
 * The editable textarea deliberately keeps its draft outside the semantic document so typing
 * does not create one undo entry per keypress. Live layout and persistence are different: both
 * need the latest visible text even before the editing session is committed.
 *
 * This creates a derived document. It never mutates the committed document or editor history.
 */
export function documentWithDraft(
  document: MindMapDocument,
  editing: { nodeId: NodeId; draft: string } | null
): MindMapDocument {
  if (!editing) return document;

  const text = normalizeText(editing.draft);
  if (getNode(document, editing.nodeId).text === text) return document;

  return applyCommand(document, {
    type: "RenameNode",
    nodeId: editing.nodeId,
    text
  }).doc;
}
