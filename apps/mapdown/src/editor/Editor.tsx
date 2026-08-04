import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapCanvas } from "../canvas/MapCanvas";
import { chooseSideForNewBranch, layout, layoutOptionsForTheme } from "../layout/layout";
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
import {
  canDelete,
  canMoveSide,
  canPromote,
  canReorder,
  canReparent,
  nextSiblingId,
  previousSiblingId,
  type Command
} from "../model/commands";
import { THEMES, themeById } from "../theme/presets";
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
import {
  IDENTITY,
  centerOn,
  fitMap,
  revealSelection,
  visibleRect,
  zoomPercent,
  zoomToCenter,
  type Viewport,
  type ViewportSize
} from "../canvas/viewport";
import { exportSvg } from "../export/svg";
import { exportPng, scaleReductionMessage } from "../export/png";
import { resolveKey, type EditorMode } from "./keymap";
import { COMMANDS } from "./command-registry";
import { HelpCenter, type RuntimeCommand } from "./HelpCenter";
import { documentWithDraft, takeEditingSession } from "./draft-persistence";
import { ToolbarMenu } from "./ToolbarMenu";

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
  const [announcement, setAnnouncement] = useState("");
  const [restored, setRestored] = useState(false);
  const store = useMemo(() => createStore(), []);
  const [viewport, setViewport] = useState<Viewport>(IDENTITY);
  const [canvasSize, setCanvasSize] = useState<ViewportSize>({ width: 1000, height: 600 });
  const [helpMode, setHelpMode] = useState<"help" | "search" | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const helpButtonRef = useRef<HTMLButtonElement>(null);
  const helpInvokerRef = useRef<HTMLElement | null>(null);
  const editingRef = useRef<EditingState | null>(editing);
  const historyRef = useRef(history);
  const restoredRef = useRef(restored);
  const statusRef = useRef(status);
  const guard = useImeGuard();
  editingRef.current = editing;
  historyRef.current = history;
  restoredRef.current = restored;
  statusRef.current = status;

  const doc = history.doc;
  const selection = history.selection;
  const mode: EditorMode = editing ? "node-editing" : "node-selected";

  const theme = useMemo(() => themeById(doc.theme.themeId), [doc.theme.themeId]);
  // Geometry stays derived rather than entering React state, but it follows the text the user
  // can currently see. This keeps the textarea, node box and connectors aligned while typing;
  // history still receives only one grouped RenameNode when the session commits.
  const previewDoc = useMemo(
    () => documentWithDraft(doc, editing),
    [doc, editing?.nodeId, editing?.draft]
  );
  const result = useMemo(
    () => layout(previewDoc, layoutOptionsForTheme(theme)),
    [previewDoc, theme]
  );

  const closeEditing = useCallback(() => {
    editingRef.current = null;
    setEditing(null);
  }, []);

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
    if (!editing && !helpMode) surfaceRef.current?.focus();
  }, [editing, helpMode]);

  useEffect(() => {
    const elements = document.querySelectorAll<HTMLElement>("[data-help-background]");
    for (const element of elements) {
      (element as HTMLElement & { inert: boolean }).inert = helpMode !== null;
    }
  }, [helpMode]);

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

    const flushLatest = () => {
      if (!restoredRef.current) return;
      const latestHistory = historyRef.current;
      const snapshotDocument = documentWithDraft(latestHistory.doc, editingRef.current);
      if (snapshotDocument !== latestHistory.doc) {
        instance.schedule(snapshotDocument, latestHistory.selection);
      }
      void instance.flush();
    };

    // §9 — visibilitychange is the primary lifecycle signal. pagehide is a best-effort
    // fallback for navigation and refresh, after continuous debounced saving has already
    // kept the latest draft close to disk.
    const onHidden = () => {
      if (document.visibilityState === "hidden") flushLatest();
    };
    const onPageHide = () => {
      flushLatest();
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (
        statusRef.current.kind === "unsaved" ||
        statusRef.current.kind === "saving" ||
        statusRef.current.kind === "failed"
      ) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
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

  // §5.1 — every semantic edit and every visible text draft schedules a save. The draft is
  // overlaid only in the snapshot: the live document, layout and undo group stay unchanged.
  // Gated on `restored` so the empty starter cannot overwrite a real recovery point.
  useEffect(() => {
    if (!restored) return;
    autosaveRef.current?.schedule(
      documentWithDraft(history.doc, editing),
      history.selection
    );
  }, [history.doc, history.selection, editing, restored]);

  /**
   * §12.5 — bring the selection into view by panning as little as possible.
   *
   * Keyed on the selection, not on the document: re-running this per keystroke is exactly the
   * "recentre the entire map after each edit" the section forbids. `revealSelection` returns
   * the identical object when nothing needs to move, so an already-visible node re-renders
   * nothing at all.
   */
  useEffect(() => {
    setViewport((current) => revealSelection(current, canvasSize, result, history.selection));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately not on `result`
  }, [history.selection, canvasSize]);

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

  const openHelp = useCallback(
    (nextMode: "help" | "search") => {
      helpInvokerRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : helpButtonRef.current;
      const session = takeEditingSession(editingRef);
      if (session) {
        setHistory((state) => commitDraft(state, session));
        closeEditing();
      }
      setHelpMode(nextMode);
    },
    [closeEditing, commitDraft]
  );

  const closeHelp = useCallback(() => {
    setHelpMode(null);
    requestAnimationFrame(() => {
      const target = helpInvokerRef.current;
      if (target?.isConnected) target.focus();
      else surfaceRef.current?.focus();
    });
  }, []);

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
    const session = takeEditingSession(editingRef);
    if (!session) return;
    if (session.isNewNode && session.draft.trim() === "") {
      setHistory((state) => dropLastEntry(state));
    } else {
      setHistory((state) => commitDraft(state, session));
    }
    closeEditing();
  }, [closeEditing, commitDraft]);

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
      // §7.2 defines the side in terms of measured subtree heights, which is layout's knowledge.
      // The editor is the one layer that has both, so it is where the two meet.
      const willBeFirstLevel =
        (command.type === "CreateChild" && command.parentId === state.doc.rootId) ||
        (command.type === "CreateSibling" && state.doc.nodes[command.anchorId]?.parentId === state.doc.rootId) ||
        (command.type === "CreateSibling" && command.anchorId === state.doc.rootId);
      const withSide: Command =
        willBeFirstLevel && state.doc.layout.mode === "two-sided"
          ? {
              ...command,
              side: chooseSideForNewBranch(
                state.doc,
                layoutOptionsForTheme(themeById(state.doc.theme.themeId))
              )
            }
          : command;
      const next = dispatch(state, withSide, { groupId, label });
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
      }, result);

      if (action.type === "none") return;
      event.preventDefault();

      // Text typed during this session is written back before any structural command runs, so
      // the new node is created against a document that already contains the label.
      const committed = editing ? commitDraft(history, editing) : history;

      switch (action.type) {
        case "undo":
          closeEditing();
          // Draft text deliberately stays outside document/history until the editing session
          // commits. Undoing a changed existing-node draft therefore means abandoning that
          // draft, not undoing the unrelated command immediately before editing began.
          if (!editing || editing.isNewNode || editing.draft === editing.originalText) {
            setHistory(undo(history));
          }
          break;
        case "redo":
          closeEditing();
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
          closeEditing();
          setHistory({ ...committed, selection: null });
          break;

        case "promote":
          if (selection) setHistory(dispatch(committed, { type: "PromoteNode", nodeId: selection }));
          closeEditing();
          break;

        case "delete":
          if (selection) setHistory(dispatch(history, { type: "DeleteSubtree", nodeId: selection }));
          closeEditing();
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
            closeEditing();
          }
          break;

        case "navigate":
          closeEditing();
          setHistory({ ...committed, selection: action.to });
          break;

        case "reorder":
          if (selection) {
            setHistory(dispatch(committed, { type: "ReorderNode", nodeId: selection, direction: action.direction }));
          }
          closeEditing();
          break;
      }
    },
    [
      doc,
      selection,
      mode,
      editing,
      history,
      result,
      closeEditing,
      commitDraft,
      cancelEdit,
      createAndEdit
    ]
  );

  const onGlobalKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const primary = event.metaKey || event.ctrlKey;
      if (helpMode) return;
      if (primary && event.key === "/") {
        event.preventDefault();
        openHelp("help");
        return;
      }
      if (primary && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openHelp("search");
        return;
      }
    },
    [helpMode, openHelp]
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

  const save = useCallback((data: string | Blob, extension: string) => {
    const url = typeof data === "string" ? data : URL.createObjectURL(data);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${sanitizeFilename(doc.title)}.${extension}`;
    anchor.click();
    if (typeof data !== "string") URL.revokeObjectURL(url);
  }, [doc.title]);

  const download = useCallback(() => {
    save(
      new Blob([exportMarkdown(previewDoc)], { type: "text/markdown;charset=utf-8" }),
      "md"
    );
  }, [previewDoc, save]);

  const downloadSvg = useCallback(() => {
    // The layout the canvas is already showing, so the file and the screen cannot disagree.
    const { svg } = exportSvg(previewDoc, {}, result);
    save(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }), "svg");
  }, [previewDoc, result, save]);

  const downloadPng = useCallback(async () => {
    const png = await exportPng(previewDoc, { scale: 2 });
    if (!png.ok) {
      setNotice(png.reason);
      return;
    }
    setNotice(scaleReductionMessage(png));
    save(png.dataUrl, "png");
  }, [previewDoc, save]);

  const openMarkdown = useCallback(async (file: File) => {
    if (
      !window.confirm(
        "Open this Markdown file as a new map? Your current map remains saved in this browser."
      )
    ) {
      return;
    }
    try {
      const { importMarkdown } = await import("../markdown/parse");
      const imported = importMarkdown(await file.text());
      if (!imported.ok) {
        setNotice(
          `Could not open ${file.name}${imported.line ? ` at line ${imported.line}` : ""}: ${imported.error}`
        );
        setAnnouncement("Markdown import failed. The current map was not changed.");
        return;
      }
      const title = file.name.replace(/\.(md|markdown)$/i, "") || imported.doc.title;
      const nextDoc = { ...imported.doc, title };
      closeEditing();
      setHistory(createHistory(nextDoc, nextDoc.rootId));
      setViewport(IDENTITY);
      setNotice(
        imported.warnings.length > 0
          ? `Opened ${file.name} with ${imported.warnings.length} ${imported.warnings.length === 1 ? "warning" : "warnings"}. ${imported.warnings[0]!.detail}`
          : `Opened ${file.name}.`
      );
      setAnnouncement(
        `Markdown imported${imported.warnings.length > 0 ? ` with ${imported.warnings.length} warnings` : ""}.`
      );
    } catch {
      setNotice(`Could not read ${file.name}. The current map was not changed.`);
      setAnnouncement("Markdown import failed. The current map was not changed.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [closeEditing]);

  /**
   * Canvas callbacks stay stable while a textarea draft changes. Without this, every keystroke
   * creates three new callback identities, invalidates every memoised SVG node, and turns a
   * one-field edit into a 500-node reconciliation (§19).
   */
  const selectNode = useCallback(
    (id: NodeId) => {
      const activeSession = editingRef.current;
      const session =
        activeSession && activeSession.nodeId !== id
          ? takeEditingSession(editingRef)
          : null;
      setHistory((state) => {
        const committed =
          session
            ? session.isNewNode &&
              session.draft.trim() === "" &&
              getNode(state.doc, session.nodeId).childIds.length === 0
              ? dropLastEntry(state)
              : commitDraft(state, session)
            : state;
        return { ...committed, selection: id };
      });
      if (session) closeEditing();
      surfaceRef.current?.focus();
    },
    [closeEditing, commitDraft]
  );

  const selectNone = useCallback(() => {
    const session = takeEditingSession(editingRef);
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
      closeEditing();
    } else {
      setHistory((state) => ({ ...state, selection: null }));
    }
    surfaceRef.current?.focus();
  }, [closeEditing, commitDraft]);

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

  const reparentNode = useCallback((id: NodeId, parentId: NodeId, index: number) => {
    setHistory((state) =>
      dispatch(state, { type: "ReparentNode", nodeId: id, parentId, index })
    );
    setAnnouncement("Branch moved.");
    surfaceRef.current?.focus();
  }, []);

  const moveBranchSide = useCallback((id: NodeId, side: "left" | "right") => {
    setHistory((state) =>
      dispatch(state, { type: "MoveFirstLevelBranchSide", nodeId: id, side })
    );
    setAnnouncement(`Branch moved to the ${side} side.`);
    surfaceRef.current?.focus();
  }, []);

  const announceInvalidDrop = useCallback(() => {
    setAnnouncement("Invalid move target. The branch was not moved.");
  }, []);

  const undoFromUi = useCallback(() => {
    const session = takeEditingSession(editingRef);
    closeEditing();
    if (!session || session.isNewNode || session.draft === session.originalText) {
      setHistory((state) => undo(state));
    }
    surfaceRef.current?.focus();
  }, [closeEditing]);

  const redoFromUi = useCallback(() => {
    closeEditing();
    setHistory((state) => redo(state));
    surfaceRef.current?.focus();
  }, [closeEditing]);

  const executeRegisteredCommand = useCallback(
    (id: string) => {
      const selected = history.selection;
      const committed = editing ? commitDraft(history, editing) : history;
      setHelpMode(null);
      helpInvokerRef.current = null;

      switch (id) {
        case "edit": {
          if (!selected) break;
          sessionCounter += 1;
          const text = getNode(committed.doc, selected).text;
          setHistory(committed);
          setEditing({
            nodeId: selected,
            draft: text,
            originalText: text,
            selectAllOnFocus: true,
            isNewNode: false,
            groupId: `edit-${sessionCounter}`
          });
          return;
        }
        case "create-sibling":
          if (selected) createAndEdit(committed, { type: "CreateSibling", anchorId: selected }, "New sibling");
          return;
        case "create-child":
          if (selected) createAndEdit(committed, { type: "CreateChild", parentId: selected }, "New child");
          return;
        case "promote":
          if (selected) setHistory(dispatch(committed, { type: "PromoteNode", nodeId: selected }));
          break;
        case "delete":
          if (selected) setHistory(dispatch(committed, { type: "DeleteSubtree", nodeId: selected }));
          setAnnouncement("Branch deleted. Undo is available.");
          break;
        case "root":
          setHistory({ ...committed, selection: committed.doc.rootId });
          break;
        case "toggle-collapse":
          if (selected) {
            const nextCollapsed = !getNode(committed.doc, selected).collapsed;
            setHistory(
              dispatch(committed, {
                type: "SetCollapsed",
                nodeId: selected,
                collapsed: nextCollapsed
              })
            );
            setAnnouncement(nextCollapsed ? "Branch collapsed." : "Branch expanded.");
          }
          break;
        case "reorder-before":
          if (selected) setHistory(dispatch(committed, { type: "ReorderNode", nodeId: selected, direction: "before-previous" }));
          break;
        case "reorder-after":
          if (selected) setHistory(dispatch(committed, { type: "ReorderNode", nodeId: selected, direction: "after-next" }));
          break;
        case "reparent-previous": {
          const parentId = selected ? previousSiblingId(committed.doc, selected) : null;
          if (selected && parentId) setHistory(dispatch(committed, { type: "ReparentNode", nodeId: selected, parentId }));
          break;
        }
        case "reparent-next": {
          const parentId = selected ? nextSiblingId(committed.doc, selected) : null;
          if (selected && parentId) {
            setHistory(dispatch(committed, { type: "ReparentNode", nodeId: selected, parentId, index: 0 }));
          }
          break;
        }
        case "move-side":
          if (selected) {
            const node = getNode(committed.doc, selected);
            setHistory(
              dispatch(committed, {
                type: "MoveFirstLevelBranchSide",
                nodeId: selected,
                side: node.side === "right" ? "left" : "right"
              })
            );
          }
          break;
        case "undo":
          setHistory(undo(committed));
          break;
        case "redo":
          setHistory(redo(committed));
          break;
        case "fit":
          setHistory(committed);
          setViewport(fitMap(result.bounds, canvasSize));
          break;
        case "center": {
          setHistory(committed);
          const box = selected ? result.boxes[selected] : result.boxes[committed.doc.rootId];
          if (box) setViewport((current) => centerOn(current, box));
          break;
        }
        case "toggle-layout":
          setHistory({
            ...committed,
            doc: {
              ...committed.doc,
              layout: { mode: committed.doc.layout.mode === "right" ? "two-sided" : "right" },
              revision: committed.doc.revision + 1
            }
          });
          break;
        case "open-markdown":
          setHistory(committed);
          fileInputRef.current?.click();
          break;
        case "export-markdown":
          setHistory(committed);
          download();
          setAnnouncement("Markdown export prepared.");
          break;
        case "export-svg":
          setHistory(committed);
          downloadSvg();
          setAnnouncement("SVG export prepared.");
          break;
        case "export-png":
          setHistory(committed);
          void downloadPng();
          break;
        default:
          setHistory(committed);
          break;
      }

      closeEditing();
      requestAnimationFrame(() => surfaceRef.current?.focus());
    },
    [
      canvasSize,
      closeEditing,
      commitDraft,
      createAndEdit,
      download,
      downloadPng,
      downloadSvg,
      editing,
      history,
      result
    ]
  );

  const runtimeCommands = useMemo<RuntimeCommand[]>(() => {
    const selected = selection;
    const node = selected ? doc.nodes[selected] : null;
    const reasonFor = (id: string): string | null => {
      switch (id) {
        case "edit":
        case "create-sibling":
        case "create-child":
          return selected ? null : "Select a node first.";
        case "promote":
          return selected && canPromote(doc, selected)
            ? null
            : "The root and first-level branches cannot be promoted.";
        case "delete":
          return selected && canDelete(doc, selected) ? null : "The root cannot be deleted.";
        case "navigate":
          return "Choose a direction with the arrow keys on the canvas.";
        case "root":
          return selected === doc.rootId ? "The root is already selected." : null;
        case "toggle-collapse":
          return node && node.childIds.length > 0 ? null : "A leaf has no children to collapse.";
        case "reorder-before":
          return selected && canReorder(doc, selected, "before-previous")
            ? null
            : "There is no previous sibling.";
        case "reorder-after":
          return selected && canReorder(doc, selected, "after-next")
            ? null
            : "There is no next sibling.";
        case "reparent-previous": {
          const target = selected ? previousSiblingId(doc, selected) : null;
          return selected && target && canReparent(doc, selected, target)
            ? null
            : "There is no valid previous sibling to move into.";
        }
        case "reparent-next": {
          const target = selected ? nextSiblingId(doc, selected) : null;
          return selected && target && canReparent(doc, selected, target)
            ? null
            : "There is no valid next sibling to move into.";
        }
        case "move-side":
          return selected && canMoveSide(doc, selected)
            ? null
            : "Only first-level branches in two-sided layout can change side.";
        case "undo":
          return canUndo(history) ? null : "There is nothing to undo.";
        case "redo":
          return canRedo(history) ? null : "There is nothing to redo.";
        case "help":
        case "command-center":
          return "Help and commands are already open.";
        default:
          return null;
      }
    };

    return COMMANDS.map((command) => ({
      ...command,
      disabledReason: reasonFor(command.id),
      execute: () => executeRegisteredCommand(command.id)
    }));
  }, [doc, executeRegisteredCommand, history, selection]);

  const editingBox = editing ? result.boxes[editing.nodeId] : null;

  /**
   * The overlaid textarea has to sit exactly on its node box. Both are derived from the same
   * viewBox here rather than measured from the DOM, so a reflow cannot leave them disagreeing.
   */
  const editorRect = useMemo(() => {
    if (!editingBox) return { left: 0, top: 0, width: 0, height: 0 };
    const rect = visibleRect(viewport, canvasSize);
    return {
      left: ((editingBox.x - rect.minX) / rect.width) * 100,
      top: ((editingBox.y + editingBox.height / 2 - rect.minY) / rect.height) * 100,
      width: (editingBox.width / rect.width) * 100,
      height: (editingBox.height / rect.height) * 100
    };
  }, [editingBox, viewport, canvasSize]);

  const hasSelectedArrangeActions =
    selection !== null &&
    (canMoveSide(doc, selection) ||
      canReorder(doc, selection, "before-previous") ||
      canReorder(doc, selection, "after-next") ||
      (previousSiblingId(doc, selection) !== null &&
        canReparent(doc, selection, previousSiblingId(doc, selection)!)) ||
      (nextSiblingId(doc, selection) !== null &&
        canReparent(doc, selection, nextSiblingId(doc, selection)!)));

  return (
    <div
      className="editor-shell"
      onKeyDownCapture={onGlobalKeyDown}
    >
      <header
        data-help-background
        aria-hidden={helpMode ? true : undefined}
        className="app-toolbar"
      >
        <div className="brand-lockup" aria-label="Mapdown">
          <span className="brand-mark" aria-hidden="true">
            M
          </span>
          <strong>Mapdown</strong>
        </div>

        <div className="history-controls" role="group" aria-label="History">
          <button
            type="button"
            className="toolbar-control history-button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={undoFromUi}
            disabled={!canUndo(history)}
            aria-label="Undo"
            title="Undo"
          >
            <span className="history-icon" aria-hidden="true">↶</span>
            <span className="history-label">Undo</span>
          </button>
          <button
            type="button"
            className="toolbar-control history-button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={redoFromUi}
            disabled={!canRedo(history)}
            aria-label="Redo"
            title="Redo"
          >
            <span className="history-icon" aria-hidden="true">↷</span>
            <span className="history-label">Redo</span>
          </button>
        </div>

        <nav className="toolbar-actions" aria-label="Map tools">
          <ToolbarMenu label="Arrange">
            <p className="toolbar-popover-label">Map layout</p>
            <button
              type="button"
              className="menu-action"
              data-close-menu
              onClick={() =>
                setHistory((state) => ({
                  ...state,
                  doc: {
                    ...state.doc,
                    layout: {
                      mode: state.doc.layout.mode === "right" ? "two-sided" : "right"
                    },
                    revision: state.doc.revision + 1
                  }
                }))
              }
            >
              <span>
                {doc.layout.mode === "right" ? "Use two-sided layout" : "Use right-only layout"}
              </span>
              <small>{doc.layout.mode === "right" ? "Balance first-level branches" : "Flow every branch right"}</small>
            </button>

            {hasSelectedArrangeActions && (
              <>
                <div className="menu-divider" />
                <p className="toolbar-popover-label">Selected node</p>
              </>
            )}
            {selection && canMoveSide(doc, selection) && (
              <button
                type="button"
                className="menu-action"
                data-close-menu
                onClick={() =>
                  setHistory((state) =>
                    dispatch(state, {
                      type: "MoveFirstLevelBranchSide",
                      nodeId: selection,
                      side: getNode(state.doc, selection).side === "right" ? "left" : "right"
                    })
                  )
                }
              >
                <span>Move branch {getNode(doc, selection).side === "right" ? "left" : "right"}</span>
                <small>Keep this first-level branch on the other side</small>
              </button>
            )}
            {selection && canReorder(doc, selection, "before-previous") && (
              <button
                type="button"
                className="menu-action"
                data-close-menu
                onClick={() =>
                  setHistory((state) =>
                    dispatch(state, {
                      type: "ReorderNode",
                      nodeId: selection,
                      direction: "before-previous"
                    })
                  )
                }
              >
                <span>Move before previous</span>
                <small>Alt + ↑</small>
              </button>
            )}
            {selection && canReorder(doc, selection, "after-next") && (
              <button
                type="button"
                className="menu-action"
                data-close-menu
                onClick={() =>
                  setHistory((state) =>
                    dispatch(state, {
                      type: "ReorderNode",
                      nodeId: selection,
                      direction: "after-next"
                    })
                  )
                }
              >
                <span>Move after next</span>
                <small>Alt + ↓</small>
              </button>
            )}
            {selection &&
              previousSiblingId(doc, selection) &&
              canReparent(doc, selection, previousSiblingId(doc, selection)!) && (
                <button
                  type="button"
                  className="menu-action"
                  data-close-menu
                  onClick={() => {
                    const parentId = previousSiblingId(doc, selection);
                    if (parentId) {
                      setHistory((state) =>
                        dispatch(state, { type: "ReparentNode", nodeId: selection, parentId })
                      );
                    }
                  }}
                >
                  <span>Move into previous</span>
                  <small>Make it the previous sibling’s child</small>
                </button>
              )}
            {selection &&
              nextSiblingId(doc, selection) &&
              canReparent(doc, selection, nextSiblingId(doc, selection)!) && (
                <button
                  type="button"
                  className="menu-action"
                  data-close-menu
                  onClick={() => {
                    const parentId = nextSiblingId(doc, selection);
                    if (parentId) {
                      setHistory((state) =>
                        dispatch(state, {
                          type: "ReparentNode",
                          nodeId: selection,
                          parentId,
                          index: 0
                        })
                      );
                    }
                  }}
                >
                  <span>Move into next</span>
                  <small>Make it the next sibling’s first child</small>
                </button>
              )}
          </ToolbarMenu>

          <ToolbarMenu label="View" align="end">
            <button
              type="button"
              className="menu-action"
              data-close-menu
              onClick={() => setViewport(fitMap(result.bounds, canvasSize))}
            >
              <span>Fit map</span>
              <small>Show the whole document</small>
            </button>
            <button
              type="button"
              className="menu-action"
              data-close-menu
              onClick={() => {
                const box = selection ? result.boxes[selection] : result.boxes[doc.rootId];
                if (box) setViewport((v) => centerOn(v, box));
              }}
            >
              <span>Centre selection</span>
              <small>Pan without changing zoom</small>
            </button>
            <div className="menu-divider" />
            <div className="zoom-controls" role="group" aria-label="Zoom">
              <button
                type="button"
                aria-label="Zoom out"
                onClick={() => setViewport((v) => zoomToCenter(v, 1 / 1.25))}
              >
                −
              </button>
              <output>{zoomPercent(viewport)}</output>
              <button
                type="button"
                aria-label="Zoom in"
                onClick={() => setViewport((v) => zoomToCenter(v, 1.25))}
              >
                +
              </button>
            </div>
          </ToolbarMenu>

          <ToolbarMenu label="Style" align="end">
            <p className="toolbar-popover-label">Document theme</p>
            <div className="theme-options">
              {THEMES.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className="theme-option"
                  aria-pressed={doc.theme.themeId === entry.id}
                  data-close-menu
                  onClick={() => {
                    setHistory((state) => ({
                      ...state,
                      doc: {
                        ...state.doc,
                        theme: { ...state.doc.theme, themeId: entry.id },
                        revision: state.doc.revision + 1
                      }
                    }));
                    setAnnouncement(`Theme changed to ${entry.name}.`);
                  }}
                >
                  <span
                    className="theme-swatch"
                    style={{
                      background: entry.canvas.background,
                      borderColor: entry.nodes.root.background
                    }}
                    aria-hidden="true"
                  />
                  <span>{entry.name}</span>
                  <span className="theme-check" aria-hidden="true">
                    {doc.theme.themeId === entry.id ? "✓" : ""}
                  </span>
                </button>
              ))}
            </div>
            <div className="menu-divider" />
            <button
              type="button"
              className="menu-action menu-action--toggle"
              aria-pressed={doc.theme.branchColorMode === "by-first-level-branch"}
              data-close-menu
              onClick={() =>
                setHistory((state) => ({
                  ...state,
                  doc: {
                    ...state.doc,
                    theme: {
                      ...state.doc.theme,
                      branchColorMode:
                        state.doc.theme.branchColorMode === "single"
                          ? "by-first-level-branch"
                          : "single"
                    },
                    revision: state.doc.revision + 1
                  }
                }))
              }
            >
              <span>Colour first-level branches</span>
              <small>
                {doc.theme.branchColorMode === "single" ? "Off" : "On"}
              </small>
            </button>
          </ToolbarMenu>

          <ToolbarMenu label="File" align="end">
            <button
              type="button"
              className="menu-action"
              data-close-menu
              onClick={() => fileInputRef.current?.click()}
            >
              <span>Open Markdown…</span>
              <small>Replace the current canvas after confirmation</small>
            </button>
            <div className="menu-divider" />
            <p className="toolbar-popover-label">Export</p>
            <button type="button" className="menu-action" data-close-menu onClick={download}>
              <span>Markdown</span>
              <small>Editable source</small>
            </button>
            <button type="button" className="menu-action" data-close-menu onClick={downloadSvg}>
              <span>SVG</span>
              <small>Scalable vector image</small>
            </button>
            <button
              type="button"
              className="menu-action"
              data-close-menu
              onClick={() => void downloadPng()}
            >
              <span>PNG</span>
              <small>High-resolution bitmap</small>
            </button>
          </ToolbarMenu>

          <button
            ref={helpButtonRef}
            type="button"
            className="toolbar-control"
            onClick={() => openHelp("help")}
            title="Help and shortcuts (Command or Control plus /)"
          >
            Help
          </button>
        </nav>

        <input
          ref={fileInputRef}
          hidden
          type="file"
          accept=".md,.markdown,text/markdown,text/plain"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void openMarkdown(file);
          }}
        />
      </header>

      {notice && (
        <div
          data-help-background
          aria-hidden={helpMode ? true : undefined}
          role="status"
          className="editor-notice"
        >
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)}>
            Dismiss
          </button>
        </div>
      )}

      <div
        ref={surfaceRef}
        data-help-background
        aria-hidden={helpMode ? true : undefined}
        role="tree"
        aria-label="Mind map editor"
        aria-activedescendant={selection ? `map-node-${selection}` : undefined}
        tabIndex={0}
        onKeyDown={onKeyDown}
        className="editor-surface"
        style={{ position: "relative", background: theme.canvas.background, overflow: "hidden" }}
      >
        <MapCanvas
          doc={previewDoc}
          theme={theme}
          layout={result}
          viewport={viewport}
          onViewport={setViewport}
          onSize={setCanvasSize}
          selection={selection}
          onSelect={selectNode}
          onSelectNone={selectNone}
          onToggleCollapse={toggleCollapse}
          onReparent={reparentNode}
          onMoveSide={moveBranchSide}
          onInvalidDrop={announceInvalidDrop}
        />

        {/*
          The overlaid textarea from spike 1. It is a real form control, so the IME takes its
          well-trodden path; the cost is keeping it aligned with the node box, which is why it
          is positioned from the layout result rather than from the DOM.
        */}
        {editing && editingBox && (
          <textarea
            ref={inputRef}
            className="editing-field"
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
              height: `${editorRect.height}%`
            }}
            rows={1}
          />
        )}
      </div>

      <footer
        data-help-background
        aria-hidden={helpMode ? true : undefined}
        className="editor-statusbar"
      >
        <span className="status-shortcuts">
          {Object.keys(doc.nodes).length} nodes · Enter = sibling · Tab = child · Shift+Tab =
          promote · Space = collapse · F2 = rename
        </span>
        <span className="status-zoom">{zoomPercent(viewport)}</span>
        <span
          role="status"
          aria-live="polite"
          className="save-status"
          data-kind={status.kind}
        >
          {saveStatusLabel(status)}
        </span>
        {status.kind === "failed" && (
          <button type="button" onClick={download}>
            Export Markdown
          </button>
        )}
        <span className="sr-only" role="status" aria-live="polite">
          {announcement}
        </span>
      </footer>
      {helpMode && (
        <HelpCenter
          mode={helpMode}
          commands={runtimeCommands}
          onClose={closeHelp}
        />
      )}
    </div>
  );
}
