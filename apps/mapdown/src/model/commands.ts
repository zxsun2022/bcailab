import { assertInvariants } from "./invariants";
import {
  createNode,
  getNode,
  isDescendantOf,
  newNodeId,
  normalizeText,
  siblingIndex,
  subtreeIds,
  type BranchSide,
  type MindMapDocument,
  type MindMapNode,
  type NodeId
} from "./types";

/**
 * The command layer of `data-model.md` §6–§7.
 *
 * Every semantic change goes through here. UI components never mutate a document — that rule is
 * what makes undo, autosave and export trustworthy, because there is exactly one place where a
 * document can change and exactly one place where invariants are checked.
 *
 * Commands are pure: `(doc, input) -> { doc, inverse, selection }`. Undo applies the inverse,
 * which means redo is just applying the original again and history needs no snapshots of the
 * whole document.
 *
 * Phase 1 implements the commands its scope needs (phases.md §3). Reorder, reparent and side
 * changes arrive with drag-and-drop and two-sided layout in Phase 2; the shape here is built to
 * take them without change.
 */

export type Command =
  | { type: "RenameNode"; nodeId: NodeId; text: string }
  | { type: "CreateSibling"; anchorId: NodeId; newNodeId?: NodeId; text?: string }
  | { type: "CreateChild"; parentId: NodeId; newNodeId?: NodeId; text?: string }
  | { type: "DeleteSubtree"; nodeId: NodeId }
  | { type: "PromoteNode"; nodeId: NodeId }
  | { type: "SetCollapsed"; nodeId: NodeId; collapsed: boolean }
  /** Internal: the inverse of DeleteSubtree. Not reachable from the UI. */
  | {
      type: "RestoreSubtree";
      nodes: MindMapNode[];
      rootOfSubtree: NodeId;
      parentId: NodeId;
      index: number;
    }
  /** Internal: the inverse of PromoteNode. */
  | { type: "MoveNode"; nodeId: NodeId; parentId: NodeId; index: number; side: BranchSide | null };

export type CommandCategory = "content" | "structure" | "presentation";

export interface CommandResult {
  doc: MindMapDocument;
  /**
   * The command with every generated value filled in — notably the id a create command minted.
   * History stores *this*, never the caller's input: replaying a command that generates a fresh
   * id on each run would redo into a different document than the one that was undone.
   */
  resolved: Command;
  inverse: Command;
  /** Where selection should land after the command, per each command's rules. */
  selection: NodeId;
  category: CommandCategory;
}

/* ---------- immutable helpers ---------- */

function withNodes(doc: MindMapDocument, nodes: Record<NodeId, MindMapNode>): MindMapDocument {
  return { ...doc, nodes, revision: doc.revision + 1 };
}

function cloneNodes(doc: MindMapDocument): Record<NodeId, MindMapNode> {
  const out: Record<NodeId, MindMapNode> = {};
  for (const [id, node] of Object.entries(doc.nodes)) out[id] = { ...node, childIds: [...node.childIds] };
  return out;
}

function insertAt<T>(list: T[], index: number, value: T): T[] {
  const out = [...list];
  out.splice(Math.max(0, Math.min(index, out.length)), 0, value);
  return out;
}

/**
 * A first-level node must have a side and a deeper node must not (§5 invariant 8). Right-only
 * layout still stores one, because §11.1 keeps the stored assignment across mode switches — the
 * value is semantic state, not a rendering detail.
 */
function sideForNewFirstLevel(doc: MindMapDocument, nodes: Record<NodeId, MindMapNode>): BranchSide {
  if (doc.layout.mode === "right") return "right";
  const root = nodes[doc.rootId]!;
  let right = 0;
  let left = 0;
  for (const id of root.childIds) (nodes[id]!.side === "left" ? left++ : right++);
  return right <= left ? "right" : "left";
}

/** Clearing sides below the first level, used after a node changes depth. */
function normalizeSides(doc: MindMapDocument, nodes: Record<NodeId, MindMapNode>): void {
  for (const node of Object.values(nodes)) {
    const first = node.parentId === doc.rootId;
    if (!first && node.side !== null) node.side = null;
    if (first && node.side === null) node.side = sideForNewFirstLevel(doc, nodes);
  }
}

/* ---------- commands ---------- */

function renameNode(doc: MindMapDocument, nodeId: NodeId, text: string): CommandResult {
  const previous = getNode(doc, nodeId).text;
  const nodes = cloneNodes(doc);
  nodes[nodeId]!.text = normalizeText(text);
  return {
    doc: withNodes(doc, nodes),
    resolved: { type: "RenameNode", nodeId, text },
    inverse: { type: "RenameNode", nodeId, text: previous },
    selection: nodeId,
    category: "content"
  };
}

/**
 * §6.1 — `Enter`. On the root this creates a first-level child instead, because the root has no
 * siblings; that is the one special case and it is deliberate, not an accident of implementation.
 */
function createSibling(doc: MindMapDocument, anchorId: NodeId, id: NodeId, text: string): CommandResult {
  const anchor = getNode(doc, anchorId);
  const onRoot = anchor.parentId === null;
  const parentId = onRoot ? doc.rootId : anchor.parentId!;
  const index = onRoot ? getNode(doc, doc.rootId).childIds.length : siblingIndex(doc, anchorId) + 1;

  const nodes = cloneNodes(doc);
  nodes[id] = createNode({ id, parentId, text: normalizeText(text) });
  nodes[parentId]!.childIds = insertAt(nodes[parentId]!.childIds, index, id);
  normalizeSides(doc, nodes);

  return {
    doc: withNodes(doc, nodes),
    resolved: { type: "CreateSibling", anchorId, newNodeId: id, text },
    inverse: { type: "DeleteSubtree", nodeId: id },
    selection: id,
    category: "structure"
  };
}

/** §6.2 — `Tab`. Appends a last child and expands the parent, so the new node is never hidden. */
function createChild(doc: MindMapDocument, parentId: NodeId, id: NodeId, text: string): CommandResult {
  const nodes = cloneNodes(doc);
  nodes[id] = createNode({ id, parentId, text: normalizeText(text) });
  nodes[parentId]!.childIds = [...nodes[parentId]!.childIds, id];
  nodes[parentId]!.collapsed = false;
  normalizeSides(doc, nodes);

  return {
    doc: withNodes(doc, nodes),
    resolved: { type: "CreateChild", parentId, newNodeId: id, text },
    inverse: { type: "DeleteSubtree", nodeId: id },
    selection: id,
    category: "structure"
  };
}

/**
 * §8.1 — deletes the node and every descendant, as one undoable command.
 *
 * Selection moves next visible sibling → previous sibling → parent → root. The undo payload
 * carries the whole subtree plus its original index, so undo restores position and not merely
 * existence.
 */
function deleteSubtree(doc: MindMapDocument, nodeId: NodeId): CommandResult {
  if (nodeId === doc.rootId) throw new Error("The root node cannot be deleted (§8.2)");

  const node = getNode(doc, nodeId);
  const parentId = node.parentId!;
  const parent = getNode(doc, parentId);
  const index = siblingIndex(doc, nodeId);
  const removed = subtreeIds(doc, nodeId).map((id) => ({ ...getNode(doc, id), childIds: [...getNode(doc, id).childIds] }));

  const nodes = cloneNodes(doc);
  for (const id of subtreeIds(doc, nodeId)) delete nodes[id];
  nodes[parentId]!.childIds = nodes[parentId]!.childIds.filter((id) => id !== nodeId);

  const nextSibling = parent.childIds[index + 1];
  const prevSibling = parent.childIds[index - 1];
  const selection = nextSibling ?? prevSibling ?? parentId ?? doc.rootId;

  return {
    doc: withNodes(doc, nodes),
    resolved: { type: "DeleteSubtree", nodeId },
    inverse: { type: "RestoreSubtree", nodes: removed, rootOfSubtree: nodeId, parentId, index },
    selection,
    category: "structure"
  };
}

function restoreSubtree(
  doc: MindMapDocument,
  restored: MindMapNode[],
  rootOfSubtree: NodeId,
  parentId: NodeId,
  index: number
): CommandResult {
  const nodes = cloneNodes(doc);
  for (const node of restored) nodes[node.id] = { ...node, childIds: [...node.childIds] };
  nodes[parentId]!.childIds = insertAt(nodes[parentId]!.childIds, index, rootOfSubtree);

  return {
    doc: withNodes(doc, nodes),
    resolved: { type: "RestoreSubtree", nodes: restored, rootOfSubtree, parentId, index },
    inverse: { type: "DeleteSubtree", nodeId: rootOfSubtree },
    selection: rootOfSubtree,
    category: "structure"
  };
}

/**
 * §7.1 — `Shift+Tab`. Moves the node and its whole subtree up one level, landing immediately
 * after its former parent. Unavailable on the root and on first-level nodes, which have nowhere
 * to go.
 */
function promoteNode(doc: MindMapDocument, nodeId: NodeId): CommandResult {
  const node = getNode(doc, nodeId);
  if (node.parentId === null) throw new Error("The root cannot be promoted (§7.1)");
  const parentId = node.parentId;
  const parent = getNode(doc, parentId);
  if (parent.parentId === null) throw new Error("A first-level node cannot be promoted (§7.1)");

  const grandparentId = parent.parentId;
  const previousIndex = siblingIndex(doc, nodeId);
  const targetIndex = siblingIndex(doc, parentId) + 1;

  const nodes = cloneNodes(doc);
  nodes[parentId]!.childIds = nodes[parentId]!.childIds.filter((id) => id !== nodeId);
  nodes[nodeId]!.parentId = grandparentId;
  nodes[grandparentId]!.childIds = insertAt(nodes[grandparentId]!.childIds, targetIndex, nodeId);
  // §7.5: promoting onto the root inherits the former parent's side; deeper, side must be null.
  nodes[nodeId]!.side = grandparentId === doc.rootId ? (parent.side ?? sideForNewFirstLevel(doc, nodes)) : null;
  normalizeSides(doc, nodes);

  return {
    doc: withNodes(doc, nodes),
    resolved: { type: "PromoteNode", nodeId },
    inverse: { type: "MoveNode", nodeId, parentId, index: previousIndex, side: node.side },
    selection: nodeId,
    category: "structure"
  };
}

function moveNode(
  doc: MindMapDocument,
  nodeId: NodeId,
  parentId: NodeId,
  index: number,
  side: BranchSide | null
): CommandResult {
  const node = getNode(doc, nodeId);
  if (nodeId === doc.rootId) throw new Error("The root cannot be moved");
  if (parentId === nodeId || isDescendantOf(doc, parentId, nodeId)) {
    throw new Error("A node cannot be moved into itself or a descendant (§7.2)");
  }
  const previousParent = node.parentId!;
  const previousIndex = siblingIndex(doc, nodeId);

  const nodes = cloneNodes(doc);
  nodes[previousParent]!.childIds = nodes[previousParent]!.childIds.filter((id) => id !== nodeId);
  nodes[nodeId]!.parentId = parentId;
  nodes[nodeId]!.side = side;
  nodes[parentId]!.childIds = insertAt(nodes[parentId]!.childIds, index, nodeId);
  normalizeSides(doc, nodes);

  return {
    doc: withNodes(doc, nodes),
    resolved: { type: "MoveNode", nodeId, parentId, index, side },
    inverse: { type: "MoveNode", nodeId, parentId: previousParent, index: previousIndex, side: node.side },
    selection: nodeId,
    category: "structure"
  };
}

/** §7.7 — leaves normalise to expanded, and the root can never collapse. */
function setCollapsed(doc: MindMapDocument, nodeId: NodeId, collapsed: boolean): CommandResult {
  const node = getNode(doc, nodeId);
  const target = nodeId === doc.rootId || node.childIds.length === 0 ? false : collapsed;
  const nodes = cloneNodes(doc);
  nodes[nodeId]!.collapsed = target;
  return {
    doc: withNodes(doc, nodes),
    resolved: { type: "SetCollapsed", nodeId, collapsed: target },
    inverse: { type: "SetCollapsed", nodeId, collapsed: node.collapsed },
    selection: nodeId,
    category: "presentation"
  };
}

/* ---------- entry point ---------- */

export function applyCommand(doc: MindMapDocument, command: Command): CommandResult {
  let result: CommandResult;

  switch (command.type) {
    case "RenameNode":
      result = renameNode(doc, command.nodeId, command.text);
      break;
    case "CreateSibling":
      result = createSibling(
        doc,
        command.anchorId,
        command.newNodeId ?? newNodeId(doc.nodes),
        command.text ?? ""
      );
      break;
    case "CreateChild":
      result = createChild(
        doc,
        command.parentId,
        command.newNodeId ?? newNodeId(doc.nodes),
        command.text ?? ""
      );
      break;
    case "DeleteSubtree":
      result = deleteSubtree(doc, command.nodeId);
      break;
    case "RestoreSubtree":
      result = restoreSubtree(doc, command.nodes, command.rootOfSubtree, command.parentId, command.index);
      break;
    case "PromoteNode":
      result = promoteNode(doc, command.nodeId);
      break;
    case "MoveNode":
      result = moveNode(doc, command.nodeId, command.parentId, command.index, command.side);
      break;
    case "SetCollapsed":
      result = setCollapsed(doc, command.nodeId, command.collapsed);
      break;
  }

  // §5: assert after every structural command. Kept unconditional — the cost is linear in a
  // document that is already being rebuilt, and a silently corrupt tree is unrecoverable.
  assertInvariants(result.doc, command.type);
  return result;
}

/** Whether a command is legal right now, for enabling and disabling UI (§17). */
export function canPromote(doc: MindMapDocument, nodeId: NodeId): boolean {
  const node = doc.nodes[nodeId];
  if (!node || node.parentId === null) return false;
  const parent = doc.nodes[node.parentId];
  return !!parent && parent.parentId !== null;
}

export function canDelete(doc: MindMapDocument, nodeId: NodeId): boolean {
  return nodeId !== doc.rootId && !!doc.nodes[nodeId];
}

export function canCollapse(doc: MindMapDocument, nodeId: NodeId): boolean {
  const node = doc.nodes[nodeId];
  return !!node && nodeId !== doc.rootId && node.childIds.length > 0;
}
