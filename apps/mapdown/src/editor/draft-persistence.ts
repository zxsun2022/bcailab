import { applyCommand } from "../model/commands";
import {
  getNode,
  normalizeText,
  type MindMapDocument,
  type NodeId
} from "../model/types";

/**
 * The editable textarea deliberately keeps its draft outside the semantic document so typing
 * does not recompute layout or create one undo entry per keypress. Persistence is different:
 * an autosave snapshot must include the latest visible text even before the editing session is
 * committed.
 *
 * This creates a snapshot-only document. It never mutates the live document or editor history.
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
