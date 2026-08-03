import { applyCommand, type Command, type CommandCategory } from "./commands";
import type { MindMapDocument, NodeId } from "./types";

/**
 * Undo/redo, per `data-model.md` §8.
 *
 * The subtlety is not the stack — it is **grouping**. §8.2–§8.4 require that:
 *
 *   - all typing in one editing session collapses to a single entry, so undo restores the text
 *     as it was when editing began rather than removing one character at a time;
 *   - creating a node and typing its first label is *one* entry, so undo removes the node
 *     instead of first emptying it and needing a second undo;
 *   - creating an empty node and cancelling leaves **no** entry at all.
 *
 * Grouping is driven by an explicit `groupId` supplied by the caller rather than inferred from
 * timing. The editing state machine knows when a session starts and ends; a timer only guesses.
 */

export interface HistoryEntry {
  id: string;
  label: string;
  forward: Command[];
  inverse: Command[];
  beforeSelection: NodeId | null;
  afterSelection: NodeId;
  category: CommandCategory;
  /** Entries sharing a group id merge into one undo step. */
  groupId: string | null;
}

export interface EditorHistory {
  doc: MindMapDocument;
  past: HistoryEntry[];
  future: HistoryEntry[];
  selection: NodeId;
}

export interface DispatchOptions {
  /** Continues an existing undo step instead of starting a new one. */
  groupId?: string;
  label?: string;
}

export function createHistory(doc: MindMapDocument, selection?: NodeId): EditorHistory {
  return { doc, past: [], future: [], selection: selection ?? doc.rootId };
}

let entrySeq = 0;
const nextEntryId = () => `h${++entrySeq}`;

export function resetHistoryIdsForTests(): void {
  entrySeq = 0;
}

export function dispatch(
  state: EditorHistory,
  command: Command,
  options: DispatchOptions = {}
): EditorHistory {
  const result = applyCommand(state.doc, command);
  const label = options.label ?? command.type;
  const previous = state.past.at(-1);

  // Merge into the previous entry when the caller says it is the same session. The merged
  // entry keeps the *original* inverse, which is what makes one undo restore the text from
  // before the session rather than from before the last keystroke.
  const canMerge =
    options.groupId !== undefined && previous !== undefined && previous.groupId === options.groupId;

  if (canMerge) {
    const merged: HistoryEntry = {
      ...previous,
      forward: [...previous.forward, result.resolved],
      inverse: [result.inverse, ...previous.inverse],
      afterSelection: result.selection,
      category: previous.category === "structure" ? "structure" : result.category
    };
    return {
      doc: result.doc,
      past: [...state.past.slice(0, -1), merged],
      future: [],
      selection: result.selection
    };
  }

  const entry: HistoryEntry = {
    id: nextEntryId(),
    label,
    forward: [result.resolved],
    inverse: [result.inverse],
    beforeSelection: state.selection,
    afterSelection: result.selection,
    category: result.category,
    groupId: options.groupId ?? null
  };

  return {
    doc: result.doc,
    past: [...state.past, entry],
    future: [],
    selection: result.selection
  };
}

/**
 * Applies a command without recording history.
 *
 * The use case §8.4 describes: a newly created empty node that the user cancels should leave no
 * trace. The creation is dispatched normally; cancelling calls `dropLastEntry`, which removes
 * the entry *and* the node in one step, so undo does not resurrect a node the user abandoned.
 */
export function applyWithoutHistory(state: EditorHistory, command: Command): EditorHistory {
  const result = applyCommand(state.doc, command);
  return { ...state, doc: result.doc, selection: result.selection };
}

/** §8.4 — undo the last entry and forget it ever happened. */
export function dropLastEntry(state: EditorHistory): EditorHistory {
  const entry = state.past.at(-1);
  if (!entry) return state;
  let doc = state.doc;
  for (const command of entry.inverse) doc = applyCommand(doc, command).doc;
  return {
    doc,
    past: state.past.slice(0, -1),
    future: state.future,
    selection: entry.beforeSelection ?? doc.rootId
  };
}

export function canUndo(state: EditorHistory): boolean {
  return state.past.length > 0;
}

export function canRedo(state: EditorHistory): boolean {
  return state.future.length > 0;
}

export function undo(state: EditorHistory): EditorHistory {
  const entry = state.past.at(-1);
  if (!entry) return state;
  let doc = state.doc;
  for (const command of entry.inverse) doc = applyCommand(doc, command).doc;
  return {
    doc,
    past: state.past.slice(0, -1),
    future: [entry, ...state.future],
    selection: entry.beforeSelection ?? doc.rootId
  };
}

export function redo(state: EditorHistory): EditorHistory {
  const entry = state.future[0];
  if (!entry) return state;
  let doc = state.doc;
  let selection = state.selection;
  for (const command of entry.forward) {
    const result = applyCommand(doc, command);
    doc = result.doc;
    selection = result.selection;
  }
  return {
    doc,
    past: [...state.past, entry],
    future: state.future.slice(1),
    selection: entry.afterSelection ?? selection
  };
}
