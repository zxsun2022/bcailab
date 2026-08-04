import { canPromote, canReorder } from "../model/commands";
import { getNode, visibleNodes, type MindMapDocument, type NodeId } from "../model/types";
import type { LayoutResult } from "../layout/layout";

/**
 * Keyboard command resolution, per `keyboard.md`.
 *
 * Kept as a pure function of (document, selection, mode, event) so the whole keymap is testable
 * without a DOM. `vision.md` §9 lists "a shortcut behaves differently depending on an
 * undocumented focus condition" as a product regression, and the way to avoid that is to have
 * exactly one place that decides, rather than handlers scattered across components.
 *
 * IME is handled *before* this — see `useImeGuard`. A key the IME owns never reaches here.
 */

export type EditorMode = "node-selected" | "node-editing";

export type EditorAction =
  | { type: "create-sibling" }
  | { type: "create-child" }
  | { type: "promote" }
  | { type: "delete" }
  | { type: "begin-edit"; selectAll: boolean }
  | { type: "commit-edit" }
  | { type: "cancel-edit" }
  | { type: "clear-selection" }
  | { type: "navigate"; to: NodeId }
  | { type: "toggle-collapse" }
  | { type: "reorder"; direction: "before-previous" | "after-next" }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "none" };

export interface KeyEvent {
  key: string;
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
}

export interface ShortcutDefinition {
  commandId: string;
  category: "Create and edit" | "Navigate" | "Branches" | "History" | "Help";
  keys: string[];
  accessibleKeys: string;
  context: string;
  searchKeys: string[];
}

/**
 * The Help surface renders this catalog, and tests below the registry validate representative
 * events against `resolveKey`. Shortcut copy therefore has one source rather than a second
 * hand-maintained table in the modal.
 */
export const SHORTCUTS: ShortcutDefinition[] = [
  { commandId: "edit", category: "Create and edit", keys: ["F2"], accessibleKeys: "F2", context: "Node selected", searchKeys: ["f2", "type"] },
  { commandId: "create-sibling", category: "Create and edit", keys: ["Enter"], accessibleKeys: "Enter", context: "Canvas", searchKeys: ["enter", "return"] },
  { commandId: "create-child", category: "Create and edit", keys: ["Tab"], accessibleKeys: "Tab", context: "Canvas", searchKeys: ["tab"] },
  { commandId: "promote", category: "Create and edit", keys: ["Shift", "Tab"], accessibleKeys: "Shift plus Tab", context: "Non-first-level node", searchKeys: ["shift tab", "outdent"] },
  { commandId: "delete", category: "Create and edit", keys: ["Delete"], accessibleKeys: "Delete or Backspace", context: "Node selected, not editing", searchKeys: ["delete", "backspace"] },
  { commandId: "navigate", category: "Navigate", keys: ["↑", "↓", "←", "→"], accessibleKeys: "Arrow keys", context: "Canvas", searchKeys: ["arrow up down left right"] },
  { commandId: "root", category: "Navigate", keys: ["Home"], accessibleKeys: "Home", context: "Canvas", searchKeys: ["home", "root"] },
  { commandId: "toggle-collapse", category: "Branches", keys: ["Space"], accessibleKeys: "Space", context: "Branch selected", searchKeys: ["space", "collapse", "expand"] },
  { commandId: "reorder-before", category: "Branches", keys: ["Alt", "↑"], accessibleKeys: "Alt plus Arrow Up", context: "Movable sibling", searchKeys: ["alt arrow up"] },
  { commandId: "reorder-after", category: "Branches", keys: ["Alt", "↓"], accessibleKeys: "Alt plus Arrow Down", context: "Movable sibling", searchKeys: ["alt arrow down"] },
  { commandId: "undo", category: "History", keys: ["Primary", "Z"], accessibleKeys: "Command or Control plus Z", context: "Application", searchKeys: ["cmd z", "command z", "ctrl z", "control z"] },
  { commandId: "redo", category: "History", keys: ["Primary", "Shift", "Z"], accessibleKeys: "Command or Control plus Shift plus Z", context: "Application", searchKeys: ["cmd shift z", "ctrl shift z", "control y"] },
  { commandId: "help", category: "Help", keys: ["Primary", "/"], accessibleKeys: "Command or Control plus Slash", context: "Application", searchKeys: ["cmd slash", "ctrl slash"] },
  { commandId: "command-center", category: "Help", keys: ["Primary", "K"], accessibleKeys: "Command or Control plus K", context: "Application", searchKeys: ["cmd k", "ctrl k"] }
];

/* ---------- navigation over the visible projection ---------- */

/** Visible order excludes anything under a collapsed ancestor (§10). */
function visibleSiblings(doc: MindMapDocument, id: NodeId): NodeId[] {
  const node = getNode(doc, id);
  if (node.parentId === null) return [];
  return getNode(doc, node.parentId).childIds;
}

/**
 * In right-only layout the tree flows left to right, so ArrowRight means "into the children"
 * and ArrowLeft means "back to the parent" (§10). Up and down move between visible siblings.
 */
function sideOf(doc: MindMapDocument, id: NodeId): "left" | "right" | null {
  let node = getNode(doc, id);
  if (node.parentId === null) return null;
  while (node.parentId !== doc.rootId) node = getNode(doc, node.parentId!);
  return node.side;
}

export function navigateFrom(
  doc: MindMapDocument,
  id: NodeId,
  key: string,
  geometry?: LayoutResult
): NodeId | null {
  const node = getNode(doc, id);
  const visible = new Set(visibleNodes(doc));
  const side = sideOf(doc, id);

  switch (key) {
    case "ArrowRight":
    case "ArrowLeft": {
      if (id === doc.rootId && doc.layout.mode === "two-sided") {
        const targetSide = key === "ArrowLeft" ? "left" : "right";
        const candidates = getNode(doc, doc.rootId).childIds.filter(
          (childId) => getNode(doc, childId).side === targetSide && visible.has(childId)
        );
        if (!geometry) return candidates[0] ?? null;
        return candidates.sort((a, b) => {
          const aBox = geometry.boxes[a]!;
          const bBox = geometry.boxes[b]!;
          return Math.abs(aBox.y + aBox.height / 2) - Math.abs(bBox.y + bBox.height / 2);
        })[0] ?? null;
      }
      const outward =
        side === "left" ? key === "ArrowLeft" : key === "ArrowRight";
      if (!outward) return node.parentId;
      // §10 — navigation never expands a collapsed branch as a side effect.
      if (node.collapsed) return null;
      return node.childIds[0] ?? null;
    }
    case "ArrowDown":
    case "ArrowUp": {
      if (geometry) {
        const current = geometry.boxes[id];
        if (!current) return null;
        const currentY = current.y + current.height / 2;
        const direction = key === "ArrowDown" ? 1 : -1;
        return [...visible]
          .filter((candidate) => candidate !== id && geometry.boxes[candidate])
          .map((candidate) => {
            const box = geometry.boxes[candidate]!;
            const candidateY = box.y + box.height / 2;
            return {
              id: candidate,
              dy: (candidateY - currentY) * direction,
              dx: Math.abs(box.x + box.width / 2 - (current.x + current.width / 2)),
              sameSide: sideOf(doc, candidate) === side ? 0 : 1
            };
          })
          .filter((candidate) => candidate.dy > 0)
          .sort((a, b) => a.dy - b.dy || a.sameSide - b.sameSide || a.dx - b.dx)[0]?.id ?? null;
      }
      const siblings = visibleSiblings(doc, id).filter((sibling) => visible.has(sibling));
      const index = siblings.indexOf(id);
      if (index === -1) return null;
      return siblings[key === "ArrowDown" ? index + 1 : index - 1] ?? null;
    }
    default:
      return null;
  }
}

/* ---------- resolution ---------- */

function isUndo(event: KeyEvent): boolean {
  return (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z" && !event.shiftKey;
}

function isRedo(event: KeyEvent): boolean {
  const mod = event.metaKey || event.ctrlKey;
  if (!mod) return false;
  // Both conventions: Cmd+Shift+Z on macOS, Ctrl+Y on Windows.
  return (event.key.toLowerCase() === "z" && event.shiftKey) || event.key.toLowerCase() === "y";
}

/**
 * A printable character with no command modifier. Used to decide when typing should replace a
 * selected node's text (§5.4). `key.length === 1` is the reliable test: named keys such as
 * "Enter" and "ArrowUp" are longer, and dead keys arrive as composition events instead.
 */
function isPrintable(event: KeyEvent): boolean {
  return event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey;
}

export function resolveKey(
  doc: MindMapDocument,
  selection: NodeId | null,
  mode: EditorMode,
  event: KeyEvent,
  geometry?: LayoutResult
): EditorAction {
  if (isUndo(event)) return { type: "undo" };
  if (isRedo(event)) return { type: "redo" };
  if (selection === null) return { type: "none" };

  if (mode === "node-editing") {
    switch (event.key) {
      case "Enter":
        // §6.1 — Enter commits and creates a sibling in one motion; that is the core writing
        // loop, so it is deliberately not "commit, then press Enter again".
        return { type: "commit-edit" };
      case "Escape":
        return { type: "cancel-edit" };
      case "Tab":
        // Shift+Tab must promote from editing too, not fall through to "create child". Missed
        // on the first pass because node mode branches on shiftKey and editing mode did not —
        // the kind of gap that only shows up when you actually press the key.
        return event.shiftKey
          ? canPromote(doc, selection)
            ? { type: "promote" }
            : { type: "none" }
          : { type: "create-child" };
      default:
        // §8.3 — Backspace and Delete are text-editing keys while editing and MUST NOT delete
        // the node, however empty it is.
        return { type: "none" };
    }
  }

  // §14 (keyboard.md) — the direct shortcuts for §7.3 sibling reordering. Listed as optional
  // there specifically because Alt+Arrow risks colliding with browser history navigation on some
  // platforms; ArrowUp/ArrowDown (unlike Left/Right) are not that binding on any tested browser,
  // and Command Center/menu access — the mandatory alternative — covers the same action either
  // way, so a keymap test here is a real check, not the only line of defense.
  if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
    const direction = event.key === "ArrowUp" ? "before-previous" : "after-next";
    return canReorder(doc, selection, direction) ? { type: "reorder", direction } : { type: "none" };
  }

  switch (event.key) {
    case "Enter":
      return { type: "create-sibling" };
    case "Tab":
      return event.shiftKey
        ? canPromote(doc, selection)
          ? { type: "promote" }
          : { type: "none" }
        : { type: "create-child" };
    case "F2":
      return { type: "begin-edit", selectAll: true };
    case "Home":
      return selection === doc.rootId ? { type: "none" } : { type: "navigate", to: doc.rootId };
    case "Delete":
    case "Backspace":
      return selection === doc.rootId ? { type: "none" } : { type: "delete" };
    case "ArrowUp":
    case "ArrowDown":
    case "ArrowLeft":
    case "ArrowRight": {
      const to = navigateFrom(doc, selection, event.key, geometry);
      return to ? { type: "navigate", to } : { type: "none" };
    }
    case " ":
      return { type: "toggle-collapse" };
    case "Escape":
      return { type: "clear-selection" };
    default:
      // §5.2/§5.4 — typing a printable character on a selected node enters editing and replaces
      // the existing text with that first keystroke.
      if (isPrintable(event)) return { type: "begin-edit", selectAll: true };
      return { type: "none" };
  }
}
