import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapCanvas, viewBoxBounds } from "../canvas/MapCanvas";
import { layout } from "../layout/layout";
import { exportMarkdown } from "../markdown/serialize";
import { sanitizeFilename } from "../markdown/escape";
import {
  canRedo,
  canUndo,
  createHistory,
  dispatch,
  dropLastEntry,
  redo,
  undo,
  type EditorHistory
} from "../model/history";
import { createDocument, getNode, type NodeId } from "../model/types";
import type { Command } from "../model/commands";
import { useImeGuard } from "./useImeGuard";
import { resolveKey, type EditorMode } from "./keymap";

/**
 * The editing state machine of `interaction.md`, wired to the model, layout and canvas.
 *
 * Two things this file is careful about:
 *
 * **One undo group per editing session.** A session begins when editing starts and ends when it
 * commits or cancels, and every keystroke inside it shares one `groupId`. That is what makes
 * §8.2–§8.4 hold — undo restores the text from before the session, creation-plus-typing is one
 * step, and an abandoned empty node leaves nothing behind.
 *
 * **The IME owns its keys.** `useImeGuard` runs before the keymap, so a candidate-confirming
 * Enter never reaches the command layer. Phase 0 spike 1 found this never fires on macOS — the
 * OS consumes the key — but it is insurance for Windows, and it costs one comparison.
 */

interface EditingState {
  nodeId: NodeId;
  draft: string;
  /** The text as it was when the session began, for cancel. */
  originalText: string;
  isNewNode: boolean;
  groupId: string;
}

let sessionCounter = 0;

export function Editor() {
  const [history, setHistory] = useState<EditorHistory>(() =>
    createHistory(createDocument("New map"))
  );
  const [editing, setEditing] = useState<EditingState | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const guard = useImeGuard();

  const doc = history.doc;
  const selection = history.selection;
  const mode: EditorMode = editing ? "node-editing" : "node-selected";

  // Layout is derived, never state. §19 forbids a full-document rerender per keystroke, and
  // keeping geometry out of React is the mechanism — this recomputes only when the document
  // revision changes, and the canvas memoises per node.
  const result = useMemo(() => layout(doc), [doc]);

  // Focus after render, not from inside a handler: the textarea only exists once `editing` has
  // been committed to state, so focusing any earlier finds nothing.
  /**
   * The editor surface must hold keyboard focus, or the whole keymap is dead.
   *
   * `tabIndex={-1}` only makes an element *programmatically* focusable — clicking an SVG node
   * inside it does not focus it. Without this, Tab moved focus to a toolbar button and every
   * shortcut went to the browser instead of the document. Found by checking `document
   * .activeElement` after a keypress rather than by reading the code.
   */
  useEffect(() => {
    if (!editing) surfaceRef.current?.focus();
  }, [editing]);

  useEffect(() => {
    if (!editing) return;
    const field = inputRef.current;
    if (!field) return;
    field.focus();
    field.setSelectionRange(editing.draft.length, editing.draft.length);
  }, [editing?.nodeId]);

  /** Writes the draft into the document as part of the session's undo group. */
  const commitDraft = useCallback(
    (state: EditorHistory, session: EditingState): EditorHistory => {
      if (session.draft === getNode(state.doc, session.nodeId).text) return state;
      return dispatch(
        state,
        { type: "RenameNode", nodeId: session.nodeId, text: session.draft },
        { groupId: session.groupId, label: "Edit text" }
      );
    },
    []
  );

  /**
   * §6.4 — a node that was just created, is still empty and is abandoned leaves no trace.
   * `dropLastEntry` removes the node and its history entry together, so a later undo cannot
   * resurrect it.
   */
  const cancelEdit = useCallback(() => {
    if (!editing) return;
    if (editing.isNewNode && editing.draft.trim() === "") {
      setHistory((state) => dropLastEntry(state));
    }
    setEditing(null);
  }, [editing]);

  /**
   * Creates a node and immediately opens an editing session on it.
   *
   * Written against the *current* history value rather than with a functional `setHistory`
   * updater, deliberately: an updater must be pure, and this needs to set two pieces of state
   * from one command result. Doing it inside an updater put a side effect in a reducer — under
   * StrictMode the updater runs twice, and the focus call landed before React had rendered the
   * textarea, so the first characters of every node went to the container instead.
   */
  const createAndEdit = useCallback(
    (state: EditorHistory, command: Command, label: string) => {
      sessionCounter += 1;
      const groupId = `new-${sessionCounter}`;
      const next = dispatch(state, command, { groupId, label });
      setHistory(next);
      setEditing({
        nodeId: next.selection,
        draft: "",
        originalText: "",
        isNewNode: true,
        groupId
      });
    },
    []
  );

  const runAction = useCallback(
    (event: React.KeyboardEvent) => {
      const action = resolveKey(doc, selection, mode, {
        key: event.key,
        shiftKey: event.shiftKey,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey
      });

      if (action.type === "none") return;
      event.preventDefault();

      // Text typed during this session is written back before any structural command runs, so
      // the new node is created against a document that already contains the label.
      const committed = editing ? commitDraft(history, editing) : history;

      switch (action.type) {
        case "undo":
          setEditing(null);
          setHistory(undo(history));
          break;
        case "redo":
          setEditing(null);
          setHistory(redo(history));
          break;

        case "begin-edit": {
          if (!selection) break;
          sessionCounter += 1;
          const text = getNode(doc, selection).text;
          setEditing({
            nodeId: selection,
            // §5.4 — the keystroke that started editing replaces the text.
            draft: event.key.length === 1 ? event.key : text,
            originalText: text,
            isNewNode: false,
            groupId: `edit-${sessionCounter}`
          });
          break;
        }

        case "commit-edit":
        case "create-sibling": {
          const anchor = editing?.nodeId ?? selection;
          if (anchor) createAndEdit(committed, { type: "CreateSibling", anchorId: anchor }, "New sibling");
          break;
        }

        case "create-child": {
          const parent = editing?.nodeId ?? selection;
          if (parent) createAndEdit(committed, { type: "CreateChild", parentId: parent }, "New child");
          break;
        }

        case "cancel-edit":
          cancelEdit();
          break;

        case "promote":
          if (selection) setHistory(dispatch(committed, { type: "PromoteNode", nodeId: selection }));
          setEditing(null);
          break;

        case "delete":
          if (selection) setHistory(dispatch(history, { type: "DeleteSubtree", nodeId: selection }));
          setEditing(null);
          break;

        case "toggle-collapse":
          if (selection) {
            setHistory(
              dispatch(committed, {
                type: "SetCollapsed",
                nodeId: selection,
                collapsed: !getNode(doc, selection).collapsed
              })
            );
            setEditing(null);
          }
          break;

        case "navigate":
          setEditing(null);
          setHistory({ ...committed, selection: action.to });
          break;
      }
    },
    [doc, selection, mode, editing, history, commitDraft, cancelEdit, createAndEdit]
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      // The IME gets first refusal on every key. See spike 1.
      if ((event.key === "Enter" || event.key === "Tab") && guard.inspect(event.nativeEvent).imeOwned) {
        return;
      }
      runAction(event);
    },
    [guard, runAction]
  );

  const download = useCallback(() => {
    const markdown = exportMarkdown(doc);
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${sanitizeFilename(doc.title)}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [doc]);

  const editingBox = editing ? result.boxes[editing.nodeId] : null;

  /**
   * The overlaid textarea has to sit exactly on its node box. Both are derived from the same
   * viewBox here rather than measured from the DOM, so a reflow cannot leave them disagreeing.
   */
  const editorRect = useMemo(() => {
    if (!editingBox) return { left: 0, top: 0, width: 0 };
    const { minX, minY, maxX, maxY } = viewBoxBounds(result.bounds);
    const spanX = maxX - minX;
    const spanY = maxY - minY;
    return {
      left: ((editingBox.x - minX) / spanX) * 100,
      top: ((editingBox.y + editingBox.height / 2 - minY) / spanY) * 100,
      width: (editingBox.width / spanX) * 100
    };
  }, [editingBox, result.bounds]);

  return (
    <div
      ref={surfaceRef}
      style={{ display: "grid", gridTemplateRows: "auto 1fr auto", height: "100%", outline: "none" }}
      onKeyDown={onKeyDown}
      tabIndex={-1}
    >
      <header
        style={{
          display: "flex",
          gap: "0.5rem",
          alignItems: "center",
          padding: "0.5rem 0.75rem",
          borderBottom: "1px solid var(--chrome-border)",
          background: "var(--chrome-bg-raised)"
        }}
      >
        <strong style={{ marginRight: "auto" }}>Mapdown</strong>
        <button onMouseDown={(e) => e.preventDefault()} onClick={() => setHistory((s) => undo(s))} disabled={!canUndo(history)}>
          Undo
        </button>
        <button onMouseDown={(e) => e.preventDefault()} onClick={() => setHistory((s) => redo(s))} disabled={!canRedo(history)}>
          Redo
        </button>
        <button onMouseDown={(e) => e.preventDefault()} onClick={download}>Export Markdown</button>
      </header>

      <div style={{ position: "relative", background: "var(--canvas-bg)", overflow: "hidden" }}>
        <MapCanvas
          layout={result}
          selection={selection}
          onSelect={(id) => {
            if (editing && editing.nodeId !== id) {
              setHistory((state) => commitDraft(state, editing));
              setEditing(null);
            }
            setHistory((state) => ({ ...state, selection: id }));
          }}
          onSelectNone={() => {
            if (editing) {
              setHistory((state) => commitDraft(state, editing));
              setEditing(null);
            }
          }}
          onToggleCollapse={(id) =>
            setHistory((state) =>
              dispatch(state, { type: "SetCollapsed", nodeId: id, collapsed: !getNode(state.doc, id).collapsed })
            )
          }
        />

        {/*
          The overlaid textarea from spike 1. It is a real form control, so the IME takes its
          well-trodden path; the cost is keeping it aligned with the node box, which is why it
          is positioned from the layout result rather than from the DOM.
        */}
        {editing && editingBox && (
          <textarea
            ref={inputRef}
            value={editing.draft}
            onChange={(event) =>
              setEditing((current) => (current ? { ...current, draft: event.target.value } : current))
            }
            onCompositionStart={guard.onCompositionStart}
            onCompositionEnd={guard.onCompositionEnd}
            onBlur={() => {
              if (editing.isNewNode && editing.draft.trim() === "") cancelEdit();
              else {
                setHistory((state) => commitDraft(state, editing));
                setEditing(null);
              }
            }}
            style={{
              position: "absolute",
              left: `${editorRect.left}%`,
              top: `${editorRect.top}%`,
              width: `${editorRect.width}%`,
              transform: "translateY(-50%)",
              padding: "0.3rem 0.5rem",
              font: "inherit",
              fontSize: "14px",
              lineHeight: 1.45,
              border: "2px solid var(--chrome-accent)",
              borderRadius: "6px",
              background: "var(--chrome-bg-raised)",
              color: "var(--chrome-text)",
              resize: "none",
              outline: "none",
              boxSizing: "border-box"
            }}
            rows={1}
          />
        )}
      </div>

      <footer
        style={{
          padding: "0.4rem 0.75rem",
          borderTop: "1px solid var(--chrome-border)",
          color: "var(--chrome-text-muted)",
          fontSize: "12px"
        }}
      >
        {Object.keys(doc.nodes).length} nodes · Enter = sibling · Tab = child · Shift+Tab = promote
        · Space = collapse · F2 = rename
      </footer>
    </div>
  );
}
