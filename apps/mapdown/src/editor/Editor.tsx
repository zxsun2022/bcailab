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
import {
  createAutosave,
  recoverDocument,
  recoveryMessage,
  saveStatusLabel,
  type Autosave,
  type SaveStatus
} from "../storage/autosave";
import { createStore, recallLastDocument } from "../storage/store";
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
  /** F2 selects the existing label; printable-key editing already replaces it in state. */
  selectAllOnFocus: boolean;
  isNewNode: boolean;
  groupId: string;
}

let sessionCounter = 0;

export function Editor() {
  const [history, setHistory] = useState<EditorHistory>(() =>
    createHistory(createDocument("New map"))
  );
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [status, setStatus] = useState<SaveStatus>({ kind: "idle" });
  const [notice, setNotice] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const store = useMemo(() => createStore(), []);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const editingRef = useRef<EditingState | null>(editing);
  const guard = useImeGuard();
  editingRef.current = editing;

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
    if (editing.selectAllOnFocus) {
      field.select();
    } else {
      field.setSelectionRange(editing.draft.length, editing.draft.length);
    }
  }, [editing?.nodeId]);

  /**
   * The autosave is created **and** destroyed by one effect.
   *
   * It was a `useMemo` with `dispose()` in a different effect's cleanup, which is broken under
   * StrictMode: the simulated unmount ran the cleanup and disposed the instance, but the memo
   * survived the remount, so every later `schedule()` returned immediately and nothing was ever
   * written. Anything with a `dispose()` has to be born and buried in the same effect, or its
   * lifetime does not match the thing that kills it.
   */
  const autosaveRef = useRef<Autosave | null>(null);

  useEffect(() => {
    const instance = createAutosave({ store, onStatus: setStatus });
    autosaveRef.current = instance;

    // §9 — do not rely on unload. visibilitychange is what browsers actually honour.
    const onHidden = () => {
      if (document.visibilityState === "hidden") void instance.flush();
    };
    document.addEventListener("visibilitychange", onHidden);

    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      instance.dispose();
      autosaveRef.current = null;
    };
  }, [store]);

  /**
   * §3.5 — restore the most recently active document on launch. Recovery validates invariants
   * and falls back to an earlier snapshot rather than opening a tree that cannot be exported;
   * when it has to fall back, it says so instead of silently losing the newest edits.
   */
  useEffect(() => {
    let cancelled = false;
    const lastId = recallLastDocument();
    if (!lastId) {
      setRestored(true);
      return;
    }
    void recoverDocument(store, lastId)
      .then((outcome) => {
        if (cancelled) return;
        if (outcome.kind === "restored" || outcome.kind === "restored-earlier") {
          setHistory(createHistory(outcome.snapshot.document, outcome.snapshot.selectedNodeId ?? undefined));
        }
        setNotice(recoveryMessage(outcome));
        setRestored(true);
      })
      .catch(() => {
        if (cancelled) return;
        // IndexedDB can exist but still refuse to open (private mode, corruption, policy).
        // Recovery failure must not leave `restored=false`, which would disable every later
        // autosave attempt for the lifetime of the tab.
        setNotice(
          "Stored documents could not be read in this browser. This session still works; export a Markdown copy to keep it."
        );
        setRestored(true);
      });
    return () => {
      cancelled = true;
    };
  }, [store]);

  // §5.1 — every semantic edit schedules a save. Gated on `restored` so the empty starter
  // document cannot overwrite a real one before recovery has finished reading it.
  useEffect(() => {
    if (!restored) return;
    autosaveRef.current?.schedule(history.doc, history.selection);
  }, [history.doc, history.selection, restored]);

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
   * Escape exits the editing session. It does **not** discard what was typed.
   *
   * §6.7 is explicit: "Escape does not revert the text to its value at editing entry. Undo
   * provides reversion. This avoids surprising loss of typed work." And §6.8: "If the new node
   * contains text, Escape merely exits editing and keeps it."
   *
   * The first implementation dropped the draft in both cases, which is the exact behaviour
   * those two sections were written to forbid — a new node typed into and then escaped came
   * back empty. Only a new node that is *still empty* is removed (§6.4), and then the node and
   * its history entry go together so a later undo cannot resurrect it.
   */
  const cancelEdit = useCallback(() => {
    if (!editing) return;
    if (editing.isNewNode && editing.draft.trim() === "") {
      setHistory((state) => dropLastEntry(state));
    } else {
      setHistory((state) => commitDraft(state, editing));
    }
    setEditing(null);
  }, [editing, commitDraft]);

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
        nodeId: next.selection!,
        draft: "",
        originalText: "",
        selectAllOnFocus: false,
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
          // Draft text deliberately stays outside document/history until the editing session
          // commits. Undoing a changed existing-node draft therefore means abandoning that
          // draft, not undoing the unrelated command immediately before editing began.
          if (!editing || editing.isNewNode || editing.draft === editing.originalText) {
            setHistory(undo(history));
          }
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
            selectAllOnFocus: action.selectAll,
            isNewNode: false,
            groupId: `edit-${sessionCounter}`
          });
          break;
        }

        case "commit-edit":
        case "create-sibling": {
          const anchor = editing?.nodeId ?? selection;
          if (
            editing?.isNewNode &&
            editing.draft.trim() === "" &&
            getNode(committed.doc, editing.nodeId).childIds.length === 0
          ) {
            break;
          }
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

        case "clear-selection":
          setEditing(null);
          setHistory({ ...committed, selection: null });
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

  /**
   * Canvas callbacks stay stable while a textarea draft changes. Without this, every keystroke
   * creates three new callback identities, invalidates every memoised SVG node, and turns a
   * one-field edit into a 500-node reconciliation (§19).
   */
  const selectNode = useCallback(
    (id: NodeId) => {
      const session = editingRef.current;
      setHistory((state) => {
        const committed =
          session && session.nodeId !== id
            ? session.isNewNode &&
              session.draft.trim() === "" &&
              getNode(state.doc, session.nodeId).childIds.length === 0
              ? dropLastEntry(state)
              : commitDraft(state, session)
            : state;
        return { ...committed, selection: id };
      });
      if (session && session.nodeId !== id) setEditing(null);
      surfaceRef.current?.focus();
    },
    [commitDraft]
  );

  const selectNone = useCallback(() => {
    const session = editingRef.current;
    if (session) {
      setHistory((state) => {
        const committed =
          session.isNewNode &&
          session.draft.trim() === "" &&
          getNode(state.doc, session.nodeId).childIds.length === 0
            ? dropLastEntry(state)
            : commitDraft(state, session);
        return { ...committed, selection: null };
      });
      setEditing(null);
    } else {
      setHistory((state) => ({ ...state, selection: null }));
    }
    surfaceRef.current?.focus();
  }, [commitDraft]);

  const toggleCollapse = useCallback((id: NodeId) => {
    setHistory((state) =>
      dispatch(state, {
        type: "SetCollapsed",
        nodeId: id,
        collapsed: !getNode(state.doc, id).collapsed
      })
    );
    surfaceRef.current?.focus();
  }, []);

  const undoFromUi = useCallback(() => {
    const session = editingRef.current;
    setEditing(null);
    if (!session || session.isNewNode || session.draft === session.originalText) {
      setHistory((state) => undo(state));
    }
    surfaceRef.current?.focus();
  }, []);

  const redoFromUi = useCallback(() => {
    setEditing(null);
    setHistory((state) => redo(state));
    surfaceRef.current?.focus();
  }, []);

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
      style={{ display: "grid", gridTemplateRows: "auto auto 1fr auto", height: "100%", outline: "none" }}
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
        <button onMouseDown={(e) => e.preventDefault()} onClick={undoFromUi} disabled={!canUndo(history)}>
          Undo
        </button>
        <button onMouseDown={(e) => e.preventDefault()} onClick={redoFromUi} disabled={!canRedo(history)}>
          Redo
        </button>
        <button onMouseDown={(e) => e.preventDefault()} onClick={download}>Export Markdown</button>
      </header>

      {notice && (
        <div
          role="status"
          style={{
            padding: "0.5rem 0.75rem",
            background: "#fff8e1",
            color: "#5c4813",
            borderBottom: "1px solid #e8d9a0",
            fontSize: "13px",
            display: "flex",
            gap: "0.75rem"
          }}
        >
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} style={{ marginLeft: "auto" }}>
            Dismiss
          </button>
        </div>
      )}

      <div style={{ position: "relative", background: "var(--canvas-bg)", overflow: "hidden" }}>
        <MapCanvas
          layout={result}
          selection={selection}
          onSelect={selectNode}
          onSelectNone={selectNone}
          onToggleCollapse={toggleCollapse}
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
            // Blur and Escape now mean the same thing: end the session, keep the text, and
            // drop the node only if it was new and never got any.
            onBlur={cancelEdit}
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
          fontSize: "12px",
          display: "flex",
          gap: "1rem"
        }}
      >
        <span>
          {Object.keys(doc.nodes).length} nodes · Enter = sibling · Tab = child · Shift+Tab =
          promote · Space = collapse · F2 = rename
        </span>
        <span
          style={{
            marginLeft: "auto",
            color: status.kind === "failed" ? "#d94f4f" : "var(--chrome-text-muted)"
          }}
        >
          {saveStatusLabel(status)}
        </span>
      </footer>
    </div>
  );
}
