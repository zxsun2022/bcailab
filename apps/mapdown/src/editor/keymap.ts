import { canPromote } from "../model/commands";
import { getNode, visibleNodes, type MindMapDocument, type NodeId } from "../model/types";

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
  | { type: "navigate"; to: NodeId }
  | { type: "toggle-collapse" }
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
export function navigateFrom(doc: MindMapDocument, id: NodeId, key: string): NodeId | null {
  const node = getNode(doc, id);
  const visible = new Set(visibleNodes(doc));

  switch (key) {
    case "ArrowRight": {
      // §10 — navigation never expands a collapsed branch as a side effect.
      if (node.collapsed) return null;
      return node.childIds[0] ?? null;
    }
    case "ArrowLeft":
      return node.parentId;
    case "ArrowDown":
    case "ArrowUp": {
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
  event: KeyEvent
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
    case "Delete":
    case "Backspace":
      return selection === doc.rootId ? { type: "none" } : { type: "delete" };
    case "ArrowUp":
    case "ArrowDown":
    case "ArrowLeft":
    case "ArrowRight": {
      const to = navigateFrom(doc, selection, event.key);
      return to ? { type: "navigate", to } : { type: "none" };
    }
    case " ":
      return { type: "toggle-collapse" };
    case "Escape":
      return { type: "none" };
    default:
      // §5.2/§5.4 — typing a printable character on a selected node enters editing and replaces
      // the existing text with that first keystroke.
      if (isPrintable(event)) return { type: "begin-edit", selectAll: true };
      return { type: "none" };
  }
}
