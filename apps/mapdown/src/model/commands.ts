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
 * Phase 1 implemented the commands its scope needed (phases.md §3). `MoveNode` arrived then as
 * `PromoteNode`'s inverse only, exercised solely across parents. Phase 2 (step 10,
 * `interaction.md` §7.2–§7.4, `accessibility.md` §9) makes it a first-class command via
 * `ReorderNode` and `ReparentNode`, which both resolve to it and are the first callers to move a
 * node within its *own* parent — see the note on `moveNode` for why that case is not the
 * off-by-one trap it looks like.
 */

export type Command =
  | { type: "RenameNode"; nodeId: NodeId; text: string }
  /**
   * `side` is supplied by the caller when the new node will be first-level, because §7.2 defines
   * the choice in terms of measured subtree heights — layout's knowledge, not the model's. When
   * omitted, the deterministic fallback below applies, so commands never import layout.
   */
  | { type: "CreateSibling"; anchorId: NodeId; newNodeId?: NodeId; text?: string; side?: BranchSide }
  | { type: "CreateChild"; parentId: NodeId; newNodeId?: NodeId; text?: string; side?: BranchSide }
  | { type: "DeleteSubtree"; nodeId: NodeId }
  | { type: "PromoteNode"; nodeId: NodeId }
  | { type: "SetCollapsed"; nodeId: NodeId; collapsed: boolean }
  | { type: "MoveFirstLevelBranchSide"; nodeId: NodeId; side: BranchSide }
  /**
   * §12 — layout-mode switch as one undoable document-view command. `sides` lets the editor
   * (the layer with measured heights) supply exact first-level side assignments when entering
   * two-sided layout; omitted, the command falls back to a deterministic alternating pattern so
   * the command layer stays layout-free. The resolved form always carries the applied sides.
   */
  | { type: "SetLayoutMode"; mode: "right" | "two-sided"; sides?: Record<NodeId, BranchSide | null> }
  /** theme.md §14 — a theme selection is one undoable presentation command. */
  | { type: "SetTheme"; themeId: string }
  /** theme.md §8 — branch-colour mode is one undoable presentation command. */
  | { type: "SetBranchColorMode"; mode: "single" | "by-first-level-branch" }
  /**
   * §7.3 — swap the node with its immediate previous or next sibling. The keyboard/menu
   * alternative to dragging between sibling positions.
   */
  | { type: "ReorderNode"; nodeId: NodeId; direction: "before-previous" | "after-next" }
  /**
   * §7.2 — move the node (and its subtree) to become a child of `parentId`. `index` positions it
   * within the new parent's children; omitted, it defaults to last child, which is §7.2's default
   * ("unless a more precise insertion indicator is shown") and what drag-and-drop's plain
   * child-drop-zone uses. A precise drag insertion indicator, or a keyboard/menu command that
   * targets a specific slot, supplies `index` explicitly.
   */
  | { type: "ReparentNode"; nodeId: NodeId; parentId: NodeId; index?: number }
  /** Internal: the inverse of DeleteSubtree. Not reachable from the UI. */
  | {
      type: "RestoreSubtree";
      nodes: MindMapNode[];
      rootOfSubtree: NodeId;
      parentId: NodeId;
      index: number;
    }
  /**
   * The one primitive every move goes through. `index` is the node's desired index in the
   * *resulting* `parentId.childIds` — the array after the move, with the node already in it —
   * not its index in any array before the move. That framing is why the same-parent case (the
   * node reordering within its own parent, which `ReorderNode` and `ReparentNode` add since
   * Phase 2; `PromoteNode`'s inverse, the only Phase 1 caller, is always cross-parent) needs no
   * special-casing: `insertAt` splices into the array with the node already removed, which lands
   * it at exactly that resulting index regardless of where it used to sit.
   */
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
  /**
   * Where selection should land after the command, per each command's rules. `null` means
   * "keep the current selection" — used by presentation commands (layout mode, theme, branch
   * colour) that must not move the user's focus.
   */
  selection: NodeId | null;
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
  // §7.2.3 tie-break, used when the caller supplies no side: first branch right, second left,
  // then alternate from the most recently assigned. Deterministic without needing heights.
  const assigned = nodes[doc.rootId]!.childIds
    .map((id) => nodes[id]!.side)
    .filter((side): side is BranchSide => side !== null);
  const last = assigned.at(-1);
  if (!last) return "right";
  return last === "right" ? "left" : "right";
}

/** Clearing sides below the first level, used after a node changes depth. */
function normalizeSides(
  doc: MindMapDocument,
  nodes: Record<NodeId, MindMapNode>,
  preferred?: BranchSide
): void {
  for (const node of Object.values(nodes)) {
    const first = node.parentId === doc.rootId;
    if (!first && node.side !== null) node.side = null;
    if (first && node.side === null) node.side = preferred ?? sideForNewFirstLevel(doc, nodes);
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
function createSibling(
  doc: MindMapDocument,
  anchorId: NodeId,
  id: NodeId,
  text: string,
  side?: BranchSide
): CommandResult {
  const anchor = getNode(doc, anchorId);
  const onRoot = anchor.parentId === null;
  const parentId = onRoot ? doc.rootId : anchor.parentId!;
  const index = onRoot ? getNode(doc, doc.rootId).childIds.length : siblingIndex(doc, anchorId) + 1;

  const nodes = cloneNodes(doc);
  nodes[id] = createNode({ id, parentId, text: normalizeText(text) });
  nodes[parentId]!.childIds = insertAt(nodes[parentId]!.childIds, index, id);
  normalizeSides(doc, nodes, side);

  return {
    doc: withNodes(doc, nodes),
    resolved: { type: "CreateSibling", anchorId, newNodeId: id, text, side: nodes[id]!.side ?? undefined },
    inverse: { type: "DeleteSubtree", nodeId: id },
    selection: id,
    category: "structure"
  };
}

/** §6.2 — `Tab`. Appends a last child and expands the parent, so the new node is never hidden. */
function createChild(
  doc: MindMapDocument,
  parentId: NodeId,
  id: NodeId,
  text: string,
  side?: BranchSide
): CommandResult {
  const nodes = cloneNodes(doc);
  nodes[id] = createNode({ id, parentId, text: normalizeText(text) });
  nodes[parentId]!.childIds = [...nodes[parentId]!.childIds, id];
  nodes[parentId]!.collapsed = false;
  normalizeSides(doc, nodes, side);

  return {
    doc: withNodes(doc, nodes),
    resolved: { type: "CreateChild", parentId, newNodeId: id, text, side: nodes[id]!.side ?? undefined },
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
  // `index` is the node's desired position in the *resulting* array, same-parent or not:
  // `insertAt` splices it into that position of the array with the node already removed, which
  // places it at exactly that index regardless of where it used to sit. No adjustment for the
  // node's own prior position is needed — or correct, if attempted. (Verified by
  // `commands.test.ts`'s same-parent reorder/reparent cases, including moving a node past
  // several siblings in one step.)
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

/**
 * §7.3 — the keyboard/menu equivalent of dragging a node between sibling positions. Swaps the
 * node with its immediate previous or next sibling; resolves to `MoveNode` so both paths share
 * one index calculation.
 */
function reorderNode(
  doc: MindMapDocument,
  nodeId: NodeId,
  direction: "before-previous" | "after-next"
): CommandResult {
  const node = getNode(doc, nodeId);
  if (node.parentId === null) throw new Error("The root has no siblings to reorder with (§7.3)");
  const index = siblingIndex(doc, nodeId);
  const targetIndex = direction === "before-previous" ? index - 1 : index + 1;
  const siblingCount = getNode(doc, node.parentId).childIds.length;
  if (targetIndex < 0 || targetIndex >= siblingCount) {
    const missing = direction === "before-previous" ? "previous" : "next";
    throw new Error(`${nodeId} has no ${missing} sibling to reorder with (§7.3)`);
  }
  return moveNode(doc, nodeId, node.parentId, targetIndex, node.side);
}

/**
 * §7.2 — the keyboard/menu equivalent of dragging a node onto another node's child drop zone.
 * `index` omitted means last child, matching the drop-zone default; resolves to `MoveNode` so
 * both paths share one index calculation and one self/descendant guard.
 */
function reparentNode(
  doc: MindMapDocument,
  nodeId: NodeId,
  parentId: NodeId,
  index: number | undefined
): CommandResult {
  const target = getNode(doc, parentId);
  const targetIndex = index ?? target.childIds.length;
  const node = getNode(doc, nodeId);
  // §7.4 — deeper than first level, side is not the caller's to set. Staying first-level keeps
  // the stored side: a drag reorder of a first-level branch must not be silently re-sided by
  // the fresh-default assignment in `moveNode`/`normalizeSides` (verified regression: it used
  // to flip a right-side branch to left when reordering two all-right branches).
  const side = parentId === doc.rootId ? node.side : null;
  return moveNode(doc, nodeId, parentId, targetIndex, side);
}

/**
 * §12 — one undoable layout-mode switch.
 *
 * The inverse carries the previous mode **and** every first-level side, so undo restores the
 * exact arrangement rather than merely the mode string.
 */
function setLayoutMode(
  doc: MindMapDocument,
  mode: "right" | "two-sided",
  sides?: Record<NodeId, BranchSide | null>
): CommandResult {
  const previousMode = doc.layout.mode;
  const firstLevel = getNode(doc, doc.rootId).childIds;
  const previousSides: Record<NodeId, BranchSide | null> = {};
  for (const id of firstLevel) previousSides[id] = getNode(doc, id).side;

  const nodes = cloneNodes(doc);
  if (sides === undefined && mode === "two-sided") {
    // Layout-free fallback for direct command-layer callers: a right-only placeholder map is
    // all "right", so start from a clean slate and alternate from the top.
    for (const id of firstLevel) nodes[id]!.side = null;
  }
  if (sides) {
    for (const id of firstLevel) {
      if (id in sides) nodes[id]!.side = sides[id] ?? null;
    }
  }

  const appliedSides: Record<NodeId, BranchSide | null> = {};
  if (mode === "two-sided") {
    // Every first-level node must render on one side or the other. Callers that know measured
    // heights supply a balanced map; ids they did not mention (or that were null) get the
    // deterministic alternating fill.
    let last: BranchSide | null = null;
    for (const id of firstLevel) {
      const current = nodes[id]!.side;
      if (current !== null) {
        last = current;
        appliedSides[id] = current;
        continue;
      }
      const next: BranchSide = !last ? "right" : last === "right" ? "left" : "right";
      nodes[id]!.side = next;
      last = next;
      appliedSides[id] = next;
    }
  } else {
    for (const id of firstLevel) {
      if (nodes[id]!.side === null) nodes[id]!.side = "right";
      appliedSides[id] = nodes[id]!.side;
    }
  }
  normalizeSides(doc, nodes);

  return {
    doc: { ...doc, layout: { mode }, nodes, revision: doc.revision + 1 },
    resolved: { type: "SetLayoutMode", mode, sides: appliedSides },
    inverse: { type: "SetLayoutMode", mode: previousMode, sides: previousSides },
    selection: null,
    category: "presentation"
  };
}

/** theme.md §14 — one undoable presentation command per selection. */
function setTheme(doc: MindMapDocument, themeId: string): CommandResult {
  const previous = doc.theme.themeId;
  return {
    doc: { ...doc, theme: { ...doc.theme, themeId }, revision: doc.revision + 1 },
    resolved: { type: "SetTheme", themeId },
    inverse: { type: "SetTheme", themeId: previous },
    selection: null,
    category: "presentation"
  };
}

function setBranchColorMode(
  doc: MindMapDocument,
  mode: "single" | "by-first-level-branch"
): CommandResult {
  const previous = doc.theme.branchColorMode;
  return {
    doc: { ...doc, theme: { ...doc.theme, branchColorMode: mode }, revision: doc.revision + 1 },
    resolved: { type: "SetBranchColorMode", mode },
    inverse: { type: "SetBranchColorMode", mode: previous },
    selection: null,
    category: "presentation"
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

/**
 * §7.3 — move a first-level branch to the other side.
 *
 * Only the side changes: semantic order is untouched, so the Markdown is byte-identical before
 * and after. That is the point — side is a view property that standard Markdown does not carry
 * (`markdown-format.md` §8.1), and a command that quietly reordered siblings to achieve a
 * visual result would make the map and the file disagree.
 */
function moveFirstLevelBranchSide(
  doc: MindMapDocument,
  nodeId: NodeId,
  side: BranchSide
): CommandResult {
  const node = getNode(doc, nodeId);
  if (node.parentId !== doc.rootId) {
    throw new Error("Only a first-level branch has a side (§7.3)");
  }
  const nodes = cloneNodes(doc);
  nodes[nodeId]!.side = side;

  return {
    doc: withNodes(doc, nodes),
    resolved: { type: "MoveFirstLevelBranchSide", nodeId, side },
    inverse: { type: "MoveFirstLevelBranchSide", nodeId, side: node.side ?? "right" },
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
        command.text ?? "",
        command.side
      );
      break;
    case "CreateChild":
      result = createChild(
        doc,
        command.parentId,
        command.newNodeId ?? newNodeId(doc.nodes),
        command.text ?? "",
        command.side
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
    case "ReorderNode":
      result = reorderNode(doc, command.nodeId, command.direction);
      break;
    case "ReparentNode":
      result = reparentNode(doc, command.nodeId, command.parentId, command.index);
      break;
    case "SetCollapsed":
      result = setCollapsed(doc, command.nodeId, command.collapsed);
      break;
    case "MoveFirstLevelBranchSide":
      result = moveFirstLevelBranchSide(doc, command.nodeId, command.side);
      break;
    case "SetLayoutMode":
      result = setLayoutMode(doc, command.mode, command.sides);
      break;
    case "SetTheme":
      result = setTheme(doc, command.themeId);
      break;
    case "SetBranchColorMode":
      result = setBranchColorMode(doc, command.mode);
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

export function canMoveSide(doc: MindMapDocument, nodeId: NodeId): boolean {
  return doc.layout.mode === "two-sided" && doc.nodes[nodeId]?.parentId === doc.rootId;
}

export function canCollapse(doc: MindMapDocument, nodeId: NodeId): boolean {
  const node = doc.nodes[nodeId];
  return !!node && nodeId !== doc.rootId && node.childIds.length > 0;
}

/** The immediate previous sibling, or null at the start of the list or on the root. */
export function previousSiblingId(doc: MindMapDocument, nodeId: NodeId): NodeId | null {
  const node = doc.nodes[nodeId];
  if (!node || node.parentId === null) return null;
  const siblings = doc.nodes[node.parentId]!.childIds;
  return siblings[siblings.indexOf(nodeId) - 1] ?? null;
}

/** The immediate next sibling, or null at the end of the list or on the root. */
export function nextSiblingId(doc: MindMapDocument, nodeId: NodeId): NodeId | null {
  const node = doc.nodes[nodeId];
  if (!node || node.parentId === null) return null;
  const siblings = doc.nodes[node.parentId]!.childIds;
  return siblings[siblings.indexOf(nodeId) + 1] ?? null;
}

/** §7.3 — whether `ReorderNode` with this direction is legal right now (§17). */
export function canReorder(
  doc: MindMapDocument,
  nodeId: NodeId,
  direction: "before-previous" | "after-next"
): boolean {
  return direction === "before-previous"
    ? previousSiblingId(doc, nodeId) !== null
    : nextSiblingId(doc, nodeId) !== null;
}

/**
 * §7.2/§9 (accessibility) — whether reparenting `nodeId` under `parentId` is legal right now:
 * not the root, not into itself, and not into its own descendant.
 */
export function canReparent(doc: MindMapDocument, nodeId: NodeId, parentId: NodeId): boolean {
  if (nodeId === doc.rootId) return false;
  if (!doc.nodes[nodeId] || !doc.nodes[parentId]) return false;
  if (parentId === nodeId || isDescendantOf(doc, parentId, nodeId)) return false;
  return true;
}

/**
 * §7.2 "child drop zone" (make it the last child) vs §7.3 "between sibling positions", with the
 * "before/after/inside" distinction §7.3 requires the drop indicator to show. Hit-testing which
 * zone the pointer is over is the canvas's job; turning that zone into a `{ parentId, index }`
 * for `ReparentNode` is this function's, so drag-and-drop and any future non-drag caller (a
 * "move near this node" picker) share one answer.
 */
export type DropZone = "before" | "after" | "inside";

export function resolveDropTarget(
  doc: MindMapDocument,
  draggedId: NodeId,
  targetId: NodeId,
  zone: DropZone
): { parentId: NodeId; index: number } | null {
  if (draggedId === targetId || !doc.nodes[targetId]) return null;

  if (zone === "inside") {
    if (!canReparent(doc, draggedId, targetId)) return null;
    return { parentId: targetId, index: doc.nodes[targetId]!.childIds.length };
  }

  // "before"/"after" a node means as its sibling, so the root — which has no parent — cannot be
  // the target of either; only "inside" (becoming a first-level node) is meaningful for it.
  const parentId = doc.nodes[targetId]!.parentId;
  if (parentId === null || !canReparent(doc, draggedId, parentId)) return null;

  const siblings = doc.nodes[parentId]!.childIds;
  const targetIndex = siblings.indexOf(targetId);
  let index = zone === "before" ? targetIndex : targetIndex + 1;
  // `targetIndex` was read from the array as it stands *before* the dragged node is removed,
  // but `ReparentNode`/`MoveNode`'s `index` means the dragged node's position *after* removal
  // and reinsertion (see the note on `moveNode`). When both nodes already share this parent and
  // the dragged node currently sits earlier in the list, its own removal shifts everything from
  // `targetIndex` onward back by one, so that correction happens here, once, rather than in
  // every caller that resolves a drop zone.
  const draggedIndex = doc.nodes[draggedId]?.parentId === parentId ? siblings.indexOf(draggedId) : -1;
  if (draggedIndex !== -1 && draggedIndex < index) index -= 1;

  return { parentId, index };
}
