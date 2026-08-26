import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapCanvas } from "../canvas/MapCanvas";
import {
  chooseSideForNewBranch,
  layout,
  layoutOptionsForTheme,
  planTwoSidedSides,
  type LayoutResult
} from "../layout/layout";
import { exportMarkdown } from "../markdown/serialize";
import { exportFilename } from "../markdown/escape";
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
import {
  createDocument,
  getNode,
  type MindMapDocument,
  type NodeId,
  type ThemeSelection
} from "../model/types";
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
import { PALETTES, SHAPES, initialThemeSelection, resolveTheme } from "../theme/presets";
import { nodeFillAndTextFor } from "../theme/branch-colors";
import { roleTokens, roleTypography } from "../theme/roles";
import { shouldShowAuthoringHint } from "./affordances";
import { useImeGuard } from "./useImeGuard";
import {
  createAutosave,
  recoverDocument,
  recoveryMessage,
  saveStatusLabel,
  type Autosave,
  type SaveStatus
} from "../storage/autosave";
import {
  createStore,
  recallLastDocument,
  rememberLastDocument,
  type DocumentBundle,
  type DocumentIndexEntry
} from "../storage/store";
import {
  deleteLocalDocument,
  duplicateLocalDocument,
  linkLocalDocumentToCloud,
  listLocalDocuments,
  refreshLocalDocumentCloudMetadata,
  normalizeDocumentTitle,
  renameLocalDocument,
  restoreLocalDocument,
  storeLocalDocument,
  unlinkLocalDocumentFromCloud
} from "../storage/library";
import {
  IDENTITY,
  centerOn,
  fitMap,
  type ViewportInsets,
  resetZoom,
  revealSelection,
  visibleRect,
  zoomPercent,
  zoomToCenter,
  type Viewport,
  type ViewportSize
} from "../canvas/viewport";
import { exportSvg } from "../export/svg";
import { exportLinkPreviewPng, exportPng, scaleReductionMessage } from "../export/png";
import { resolveKey, type EditorMode } from "./keymap";
import { COMMANDS } from "./command-registry";
import { HelpCenter, type RuntimeCommand } from "./HelpCenter";
import { LibraryPage } from "../library/LibraryPage";
import type { CloudLibraryState, DocumentLibraryState } from "../library/cloud-state";
import { navigate, useRoute } from "../routing";
import { documentDisplayName, entryDisplayName } from "../storage/display-name";
import { ImportPage } from "../library/ImportPage";
import { documentFromPublishedView, parsePublishedView, toPublishedView } from "../viewer/published-view";
import { documentWithDraft, takeEditingSession } from "./draft-persistence";
import { ToolbarMenu } from "./ToolbarMenu";
import {
  CloudApiError,
  createCloudDocument,
  deleteCloudDocument,
  getCloudDocument,
  getCloudSession,
  getPublishedMap,
  listCloudDocuments,
  publishCloudDocument,
  signInToMapdown,
  signOutOfMapdown,
  unpublishCloudDocument,
  updateCloudDocument
} from "../cloud/api";
import type { CloudDocumentRecord, CloudDocumentSummary, CloudSnapshot, CloudUser } from "../cloud/types";
import { checkInvariants } from "../model/invariants";

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

function conflictCloudSummary(details: unknown): CloudDocumentSummary | null {
  if (!details || typeof details !== "object" || Array.isArray(details)) return null;
  const document = (details as Record<string, unknown>).document;
  if (!document || typeof document !== "object" || Array.isArray(document)) return null;
  const value = document as Record<string, unknown>;
  if (
    typeof value.id !== "string" ||
    typeof value.clientDocumentId !== "string" ||
    typeof value.title !== "string" ||
    !Number.isInteger(value.nodeCount) ||
    !Number.isInteger(value.version) ||
    typeof value.createdAt !== "number" ||
    typeof value.updatedAt !== "number"
  ) return null;
  const rawPublication = value.publication;
  let publication: CloudDocumentSummary["publication"] = null;
  if (rawPublication !== null) {
    if (!rawPublication || typeof rawPublication !== "object" || Array.isArray(rawPublication)) return null;
    const candidate = rawPublication as Record<string, unknown>;
    if (
      typeof candidate.publicId !== "string" ||
      typeof candidate.publicUrl !== "string" ||
      !Number.isInteger(candidate.version) ||
      typeof candidate.updatedAt !== "number"
    ) return null;
    publication = {
      publicId: candidate.publicId,
      publicUrl: candidate.publicUrl,
      version: Number(candidate.version),
      updatedAt: candidate.updatedAt
    };
  }
  return {
    id: value.id,
    clientDocumentId: value.clientDocumentId,
    title: value.title,
    nodeCount: Number(value.nodeCount),
    version: Number(value.version),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    publication
  };
}

/**
 * Screen px of extra content width the editing field keeps over the measured layout width.
 * canvas measureText and the browser's own text layout differ by subpixel amounts; the node
 * box has zero tolerance by design, so the textarea takes the margin out of its own right
 * padding. The box itself stays pixel-identical to the node box.
 */
const EDITING_SAFETY_MARGIN = 2;
/** Canvas affordances (b) — where the hint dismissal is remembered. */
const HINT_DISMISSED_KEY = "mapdown:authoring-hint-dismissed";

/**
 * Canvas affordances (c) — the starter document's theme selection (shape + palette), read once
 * at creation. A stored document restores its own selection and a user pick overrides it, so
 * the system preference is strictly an initial value.
 */
function systemThemeSelection(): ThemeSelection {
  const prefersDark =
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
      : false;
  return initialThemeSelection(prefersDark);
}

export function Editor() {
  const [history, setHistory] = useState<EditorHistory>(() =>
    createHistory({
      ...createDocument("New map"),
      title: "New map",
      theme: systemThemeSelection()
    })
  );
  const [hintDismissed, setHintDismissed] = useState<boolean>(() => {
    if (typeof localStorage === "undefined") return false;
    return localStorage.getItem(HINT_DISMISSED_KEY) === "1";
  });
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [status, setStatus] = useState<SaveStatus>({ kind: "idle" });
  const [notice, setNotice] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [restored, setRestored] = useState(false);
  const store = useMemo(() => createStore(), []);
  const [viewport, setViewport] = useState<Viewport>(IDENTITY);
  const [canvasSize, setCanvasSize] = useState<ViewportSize>({ width: 1000, height: 600 });
  const [helpMode, setHelpMode] = useState<"help" | "search" | null>(null);
  const route = useRoute();
  /** The library is a route (D-31), so Back, a bookmark and the File menu all reach the same
   * surface. The editor stays mounted beneath it — unmounting would discard the undo history. */
  const libraryOpen = route.name === "library";
  const importing = route.name === "import";
  const [importState, setImportState] = useState<"copying" | "failed">("copying");
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importAttempt, setImportAttempt] = useState(0);
  const [libraryState, setLibraryState] = useState<DocumentLibraryState>("loading");
  const [libraryEntries, setLibraryEntries] = useState<DocumentIndexEntry[]>([]);
  const [libraryUnavailableMessage, setLibraryUnavailableMessage] = useState<string | null>(null);
  const [deletedDocuments, setDeletedDocuments] = useState<DocumentBundle[]>([]);
  const [cloudLibraryState, setCloudLibraryState] = useState<CloudLibraryState>("loading");
  const [cloudUser, setCloudUser] = useState<CloudUser | null>(null);
  const [cloudDocuments, setCloudDocuments] = useState<CloudDocumentSummary[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const helpButtonRef = useRef<HTMLButtonElement>(null);
  const helpInvokerRef = useRef<HTMLElement | null>(null);
  const libraryInvokerRef = useRef<HTMLElement | null>(null);
  const skipNextAutosaveDocumentRef = useRef<string | null>(null);
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

  const theme = useMemo(
    () => resolveTheme(doc.theme.shapeId, doc.theme.paletteId),
    [doc.theme.shapeId, doc.theme.paletteId]
  );
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
    if (!editing && !helpMode && !libraryOpen) surfaceRef.current?.focus();
  }, [editing, helpMode, libraryOpen]);

  useEffect(() => {
    const overlayOpen = helpMode !== null || libraryOpen;
    const elements = document.querySelectorAll<HTMLElement>("[data-overlay-background]");
    for (const element of elements) {
      (element as HTMLElement & { inert: boolean }).inert = overlayOpen;
    }
  }, [helpMode, libraryOpen]);

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
    const instance = createAutosave({
      store,
      onStatus: (nextStatus) => {
        statusRef.current = nextStatus;
        setStatus(nextStatus);
      }
    });
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
          skipNextAutosaveDocumentRef.current = outcome.snapshot.document.id;
          setHistory(createHistory(outcome.snapshot.document, outcome.snapshot.selectedNodeId ?? undefined));
          const restoredStatus: SaveStatus = { kind: "saved", at: outcome.snapshot.savedAt };
          statusRef.current = restoredStatus;
          setStatus(restoredStatus);
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
    if (skipNextAutosaveDocumentRef.current === history.doc.id) {
      skipNextAutosaveDocumentRef.current = null;
      return;
    }
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
   * The chrome floats over the canvas and reserves no layout space, so the element the map is
   * drawn into is the whole window and fitting against it would tuck the top of the map under
   * the toolbar. Measured at fit time rather than tracked: fitting is user-initiated, so one
   * `getBoundingClientRect` is cheaper than an observer and cannot go stale.
   */
  const chromeInsets = useCallback((): ViewportInsets => {
    const read = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element || element.hidden) return 0;
      const rect = element.getBoundingClientRect();
      return rect.height > 0 ? rect.height + 12 : 0;
    };
    return { top: read("[data-chrome-top]"), right: 0, bottom: read("[data-chrome-bottom]"), left: 0 };
  }, []);

  /**
   * Publish the top chrome's measured height so CSS can position things beneath it. A wrapped
   * toolbar on a narrow screen is taller than any constant would guess, and the authoring hint
   * sitting on top of the toolbar is exactly the kind of collision a hard-coded offset creates.
   */
  const chromeTopRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = chromeTopRef.current;
    const shell = shellRef.current;
    if (!element || !shell) return;
    const observer = new ResizeObserver(([entry]) => {
      const height = entry?.contentRect.height ?? 0;
      // Set on the shell, not on the chrome: custom properties inherit down the tree, and the
      // canvas is the chrome's sibling.
      shell.style.setProperty("--editor-chrome-top-height", `${Math.round(height)}px`);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const fitToCanvas = useCallback(
    (bounds: LayoutResult["bounds"]) => fitMap(bounds, canvasSize, 48, chromeInsets()),
    [canvasSize, chromeInsets]
  );

  const setSavedStatus = useCallback((at: number) => {
    const nextStatus: SaveStatus = { kind: "saved", at };
    statusRef.current = nextStatus;
    setStatus(nextStatus);
  }, []);

  const refreshDocumentLibrary = useCallback(
    async (showLoading = false) => {
      if (showLoading) setLibraryState("loading");
      try {
        const entries = await listLocalDocuments(store);
        setLibraryEntries(entries);
        setLibraryUnavailableMessage(null);
        setLibraryState("ready");
        return entries;
      } catch {
        setLibraryEntries([]);
        setLibraryUnavailableMessage(
          "This browser would not open Mapdown storage. The current map still works in memory; export Markdown before leaving it."
        );
        setLibraryState("unavailable");
        return null;
      }
    },
    [store]
  );

  const refreshCloudLibrary = useCallback(async () => {
    setCloudLibraryState("loading");
    try {
      const session = await getCloudSession();
      setCloudUser(session.user);
      if (!session.user) {
        setCloudDocuments([]);
        setCloudLibraryState("signed-out");
        return;
      }
      setCloudDocuments(await listCloudDocuments());
      setCloudLibraryState("ready");
    } catch {
      setCloudLibraryState("unavailable");
    }
  }, []);

  const signInForCloudSave = useCallback(async () => {
    setCloudLibraryState("loading");
    try {
      const user = await signInToMapdown();
      setCloudUser(user);
      setCloudDocuments(await listCloudDocuments());
      setCloudLibraryState("ready");
      setAnnouncement(`Signed in as ${user.name || user.email}.`);
    } catch (error) {
      setCloudLibraryState("signed-out");
      throw error;
    }
  }, []);

  const signOutFromCloudSave = useCallback(async () => {
    await signOutOfMapdown();
    setCloudUser(null);
    setCloudDocuments([]);
    setCloudLibraryState("signed-out");
    setAnnouncement("Signed out of online save. Local maps are unchanged.");
  }, []);

  const flushPendingLocalSave = useCallback(async () => {
    await autosaveRef.current?.flush();
    if (statusRef.current.kind === "failed") {
      throw new Error(
        "The current map is not saved in this browser. Export Markdown before switching documents."
      );
    }
  }, []);

  const activateLocalDocument = useCallback(
    (document: MindMapDocument, selectedNodeId: NodeId | null, savedAt: number) => {
      skipNextAutosaveDocumentRef.current = document.id;
      setHistory(createHistory(document, selectedNodeId ?? undefined));
      setViewport(IDENTITY);
      rememberLastDocument(document.id);
      setSavedStatus(savedAt);
    },
    [setSavedStatus]
  );

  const closeDocumentLibrary = useCallback(() => {
    navigate({ name: "editor" });
  }, []);

  const openDocumentLibrary = useCallback(() => {
    libraryInvokerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : surfaceRef.current;
    const session = takeEditingSession(editingRef);
    if (session) {
      const committed = commitDraft(historyRef.current, session);
      historyRef.current = committed;
      setHistory(committed);
      autosaveRef.current?.schedule(committed.doc, committed.selection);
      closeEditing();
    }
    navigate({ name: "library" });
  }, [closeEditing, commitDraft]);

  /**
   * Loading is driven by the route, not by the button, because the route has three other
   * entrances: a typed URL, a bookmark, and Back/Forward. The pending local save is flushed
   * here for the same reason — the dialog did it on the way in, and arriving from history must
   * not be the one path that skips it.
   */
  useEffect(() => {
    if (!libraryOpen) return;
    let cancelled = false;
    setLibraryState("loading");
    void (async () => {
      try {
        await flushPendingLocalSave();
      } catch (error) {
        if (!cancelled) {
          setNotice(error instanceof Error ? error.message : "The current map could not be saved.");
        }
      }
      if (cancelled) return;
      await refreshDocumentLibrary();
      if (!cancelled) void refreshCloudLibrary();
    })();
    return () => {
      cancelled = true;
    };
  }, [flushPendingLocalSave, libraryOpen, refreshCloudLibrary, refreshDocumentLibrary]);

  /** Back out of the library — by button or by browser history — returns focus where it left. */
  const libraryWasOpenRef = useRef(false);
  useEffect(() => {
    if (libraryOpen) {
      libraryWasOpenRef.current = true;
      return;
    }
    if (!libraryWasOpenRef.current) return;
    libraryWasOpenRef.current = false;
    requestAnimationFrame(() => {
      const target = libraryInvokerRef.current;
      if (target?.isConnected && target.getClientRects().length > 0) target.focus();
      else surfaceRef.current?.focus();
    });
  }, [libraryOpen]);

  const createAndActivateLocalDocument = useCallback(async () => {
    await flushPendingLocalSave();
    const document = {
      ...createDocument("New map"),
      title: "New map",
      theme: systemThemeSelection()
    };
    const bundle = await storeLocalDocument(store, document, document.rootId);
    activateLocalDocument(document, document.rootId, bundle.entry.updatedAt);
    return bundle;
  }, [activateLocalDocument, flushPendingLocalSave, store]);

  const openLocalDocument = useCallback(
    async (documentId: string) => {
      await flushPendingLocalSave();
      const outcome = await recoverDocument(store, documentId);
      if (outcome.kind !== "restored" && outcome.kind !== "restored-earlier") {
        throw new Error("This local document has no readable recovery snapshot.");
      }
      activateLocalDocument(
        outcome.snapshot.document,
        outcome.snapshot.selectedNodeId,
        outcome.snapshot.savedAt
      );
      if (outcome.kind === "restored-earlier") setNotice(recoveryMessage(outcome));
      setAnnouncement(`Opened ${documentDisplayName(outcome.snapshot.document)}.`);
      closeDocumentLibrary();
    },
    [activateLocalDocument, closeDocumentLibrary, flushPendingLocalSave, store]
  );

  const newLocalDocument = useCallback(async () => {
    const bundle = await createAndActivateLocalDocument();
    setAnnouncement(`Created ${entryDisplayName(bundle.entry)}.`);
    closeDocumentLibrary();
  }, [closeDocumentLibrary, createAndActivateLocalDocument]);

  /**
   * Rename a map by rewriting its root node, because the root label is the map's name (D-18).
   *
   * The two branches are the asymmetry the owner accepted on 2026-08-26. The open map goes
   * through `dispatch`, so the rename lands in history and Undo reverses it — `spec/vision.md`
   * §4.8 requires that of every structural action. A map that is not open has no history to
   * write into, so it is edited in storage and covered by the library's in-tab undo instead.
   */
  const renameStoredDocument = useCallback(
    async (documentId: string, name: string) => {
      const label = normalizeDocumentTitle(name);
      if (documentId === historyRef.current.doc.id) {
        const renamed = dispatch(
          historyRef.current,
          { type: "RenameNode", nodeId: historyRef.current.doc.rootId, text: label },
          { label: "Rename map" }
        );
        historyRef.current = renamed;
        setHistory(renamed);
        autosaveRef.current?.schedule(renamed.doc, renamed.selection);
        // The library reads the index, and autosave is debounced; without the flush the row
        // would still show the old name when the list refreshes a moment later.
        await flushPendingLocalSave();
      } else {
        await renameLocalDocument(store, documentId, label);
      }
      await refreshDocumentLibrary();
      setAnnouncement(`Renamed map to ${label}.`);
    },
    [flushPendingLocalSave, refreshDocumentLibrary, store]
  );

  const duplicateStoredDocument = useCallback(
    async (documentId: string) => {
      const duplicate = await duplicateLocalDocument(store, documentId);
      await refreshDocumentLibrary();
      setAnnouncement(`Created ${entryDisplayName(duplicate.entry)}.`);
    },
    [refreshDocumentLibrary, store]
  );

  const deleteStoredDocument = useCallback(
    async (documentId: string) => {
      const deletingActiveDocument = documentId === historyRef.current.doc.id;
      if (deletingActiveDocument) await flushPendingLocalSave();
      const deleted = await deleteLocalDocument(store, documentId);

      try {
        if (deletingActiveDocument) {
          const remaining = await listLocalDocuments(store);
          let activated = false;
          for (const entry of remaining) {
            const outcome = await recoverDocument(store, entry.id);
            if (outcome.kind === "restored" || outcome.kind === "restored-earlier") {
              activateLocalDocument(
                outcome.snapshot.document,
                outcome.snapshot.selectedNodeId,
                outcome.snapshot.savedAt
              );
              activated = true;
              break;
            }
          }
          if (!activated) await createAndActivateLocalDocument();
        }
      } catch (error) {
        await restoreLocalDocument(store, deleted);
        throw error;
      }

      setDeletedDocuments((documents) => [...documents, deleted]);
      await refreshDocumentLibrary();
      setAnnouncement(`Deleted ${entryDisplayName(deleted.entry)}. Undo delete is available.`);
    },
    [
      activateLocalDocument,
      createAndActivateLocalDocument,
      flushPendingLocalSave,
      refreshDocumentLibrary,
      store
    ]
  );

  const undoDeleteStoredDocument = useCallback(async () => {
    const deleted = deletedDocuments.at(-1);
    if (!deleted) return;
    await restoreLocalDocument(store, deleted);
    setDeletedDocuments((documents) => documents.slice(0, -1));
    await refreshDocumentLibrary();
    setAnnouncement(`Restored ${entryDisplayName(deleted.entry)}.`);
  }, [deletedDocuments, refreshDocumentLibrary, store]);

  const localSnapshotForCloud = useCallback(async (localDocumentId: string) => {
    if (localDocumentId === historyRef.current.doc.id) await flushPendingLocalSave();
    const bundle = await store.getDocumentBundle(localDocumentId);
    if (!bundle) throw new Error("This local document could not be found.");
    const snapshot =
      bundle.snapshots.find((item) => item.id === bundle.entry.lastSnapshotId) ??
      bundle.snapshots.at(-1);
    if (!snapshot) throw new Error("This local document has no readable snapshot.");
    const cloudSnapshot: CloudSnapshot = {
      schemaVersion: snapshot.schemaVersion,
      document: structuredClone(snapshot.document),
      selectedNodeId: snapshot.selectedNodeId
    };
    return { entry: bundle.entry, snapshot, cloudSnapshot };
  }, [flushPendingLocalSave, store]);

  const conflictCopyTitle = useCallback((title: string) => {
    const suffix = " (conflicted copy)";
    const base = [...title].slice(0, 120 - [...suffix].length).join("").trimEnd();
    return `${base}${suffix}`;
  }, []);

  const saveLocalDocumentOnline = useCallback(async (localDocumentId: string): Promise<CloudDocumentRecord> => {
    const local = await localSnapshotForCloud(localDocumentId);
    try {
      const cloud = local.entry.cloudDocumentId && local.entry.cloudVersion
        ? await updateCloudDocument({
            id: local.entry.cloudDocumentId,
            baseVersion: local.entry.cloudVersion,
            snapshot: local.cloudSnapshot
          })
        : await createCloudDocument({
            clientDocumentId: local.entry.id,
            snapshot: local.cloudSnapshot
          });
      await linkLocalDocumentToCloud(store, localDocumentId, cloud, local.snapshot.id);
      await refreshDocumentLibrary();
      setCloudDocuments(await listCloudDocuments());
      setCloudLibraryState("ready");
      setAnnouncement(`Saved ${documentDisplayName(cloud.snapshot.document)} online.`);
      return cloud;
    } catch (error) {
      if (error instanceof CloudApiError && error.code === "conflict") {
        const currentCloud = conflictCloudSummary(error.details);
        if (!currentCloud || currentCloud.id !== local.entry.cloudDocumentId) throw error;
        const conflictDocument = {
          ...structuredClone(local.snapshot.document),
          id: `doc-${crypto.randomUUID()}`,
          title: conflictCopyTitle(local.snapshot.document.title),
          revision: 0
        };
        await storeLocalDocument(store, conflictDocument, local.snapshot.selectedNodeId, {
          conflictedCopyOf: localDocumentId
        });
        await refreshLocalDocumentCloudMetadata(store, localDocumentId, currentCloud);
        await refreshDocumentLibrary();
        setCloudDocuments(await listCloudDocuments());
        setCloudLibraryState("ready");
        throw new Error(
          `The online copy changed first. ${conflictDocument.title} was kept locally; nothing was overwritten. Save changes again only if you want this browser's version to replace the current online copy.`
        );
      }
      throw error;
    }
  }, [conflictCopyTitle, localSnapshotForCloud, refreshDocumentLibrary, store]);

  const openOnlineDocument = useCallback(async (cloudDocumentId: string) => {
    const cloud = await getCloudDocument(cloudDocumentId);
    if (checkInvariants(cloud.snapshot.document).length > 0) {
      throw new Error("The saved online document is inconsistent and was not opened.");
    }
    let document = structuredClone(cloud.snapshot.document);
    const collision = await store.getIndexEntry(document.id);
    if (collision && collision.cloudDocumentId !== cloud.id) {
      document = {
        ...document,
        id: `doc-${crypto.randomUUID()}`,
        title: `${[...document.title].slice(0, 108).join("").trimEnd()} online copy`,
        revision: 0
      };
    }
    const bundle = await storeLocalDocument(
      store,
      document,
      cloud.snapshot.selectedNodeId
    );
    await linkLocalDocumentToCloud(store, document.id, cloud, bundle.entry.lastSnapshotId);
    activateLocalDocument(document, cloud.snapshot.selectedNodeId, bundle.entry.updatedAt);
    await refreshDocumentLibrary();
    setCloudDocuments(await listCloudDocuments());
    setAnnouncement(`Opened ${documentDisplayName(document)} from online save.`);
    closeDocumentLibrary();
  }, [activateLocalDocument, closeDocumentLibrary, refreshDocumentLibrary, store]);

  const deleteOnlineDocument = useCallback(async (cloudDocumentId: string) => {
    await deleteCloudDocument(cloudDocumentId);
    const localEntries = await store.listIndexEntries();
    for (const entry of localEntries) {
      if (entry.cloudDocumentId === cloudDocumentId) {
        await unlinkLocalDocumentFromCloud(store, entry.id);
      }
    }
    await refreshDocumentLibrary();
    setCloudDocuments(await listCloudDocuments());
    setAnnouncement("The online copy was deleted. Local copies were kept.");
  }, [refreshDocumentLibrary, store]);

  /**
   * **Make a copy** (D-33). The published map is fetched from the editor origin's own public
   * endpoint and rebuilt as a *local* document with a new id. Nothing is uploaded; putting the
   * copy in an account stays the existing explicit action.
   */
  const copyPublishedMap = useCallback(async (publicId: string) => {
    const { title, view } = await getPublishedMap(publicId);
    const parsed = parsePublishedView(view);
    if (!parsed) {
      throw new Error("This public map uses a newer Mapdown format than this browser can open.");
    }
    await flushPendingLocalSave();
    const copy = documentFromPublishedView(parsed, `doc-${crypto.randomUUID()}`);
    copy.title = title || parsed.title;
    if (checkInvariants(copy).length > 0) {
      throw new Error("This public map is inconsistent and was not copied.");
    }
    const bundle = await storeLocalDocument(store, copy, copy.rootId, {
      copiedFromPublicId: publicId
    });
    activateLocalDocument(copy, copy.rootId, bundle.entry.updatedAt);
    await refreshDocumentLibrary();
    setAnnouncement(`Copied ${documentDisplayName(copy)} into this browser. It is not saved online.`);
  }, [activateLocalDocument, flushPendingLocalSave, refreshDocumentLibrary, store]);

  useEffect(() => {
    if (!importing) return;
    const publicId = route.name === "import" ? route.publicId : "";
    if (!publicId) {
      setImportState("failed");
      setImportMessage("That link does not name a Mapdown map.");
      return;
    }
    let cancelled = false;
    setImportState("copying");
    setImportMessage(null);
    void (async () => {
      try {
        await copyPublishedMap(publicId);
        // Replace rather than push: Back should return to wherever the reader came from, not
        // re-run the copy and make a second document.
        if (!cancelled) navigate({ name: "editor" }, { replace: true });
      } catch (error) {
        if (cancelled) return;
        setImportState("failed");
        setImportMessage(
          error instanceof Error ? error.message : "This public map could not be copied."
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [copyPublishedMap, importAttempt, importing, route]);

  const publishLocalDocument = useCallback(async (localDocumentId: string) => {
    const local = await localSnapshotForCloud(localDocumentId);
    const existingPublication = local.entry.cloudPublication;
    const cloud = await saveLocalDocumentOnline(localDocumentId);
    const { svg } = exportSvg(cloud.snapshot.document);
    const png = await exportLinkPreviewPng(cloud.snapshot.document);
    if (!png.ok) throw new Error(png.reason);
    const publication = await publishCloudDocument({
      id: cloud.id,
      baseVersion: cloud.version,
      // The public page names the map the way every other surface does (D-18).
      title: documentDisplayName(cloud.snapshot.document),
      markdown: exportMarkdown(cloud.snapshot.document),
      svg,
      png: png.dataUrl,
      // Rendered from the same document as the SVG and the PNG, so the live reader page and
      // the frozen image cannot disagree about sides or collapse state (D-32).
      view: toPublishedView(cloud.snapshot.document)
    });
    const latestEntry = await store.getIndexEntry(localDocumentId);
    await linkLocalDocumentToCloud(
      store,
      localDocumentId,
      { ...cloud, publication },
      latestEntry?.lastSnapshotId ?? local.snapshot.id
    );
    await refreshDocumentLibrary();
    setCloudDocuments(await listCloudDocuments());
    setAnnouncement(existingPublication ? "Published version updated." : "Public link created.");
    return publication;
  }, [localSnapshotForCloud, refreshDocumentLibrary, saveLocalDocumentOnline, store]);

  const unpublishLocalDocument = useCallback(async (localDocumentId: string) => {
    const entry = await store.getIndexEntry(localDocumentId);
    if (!entry?.cloudDocumentId || !entry.cloudPublication) {
      throw new Error("This local document has no active public link.");
    }
    await unpublishCloudDocument(entry.cloudDocumentId);
    const documents = await listCloudDocuments();
    const cloud = documents.find((item) => item.id === entry.cloudDocumentId);
    if (cloud) await linkLocalDocumentToCloud(store, localDocumentId, cloud, entry.cloudSavedSnapshotId ?? entry.lastSnapshotId);
    setCloudDocuments(documents);
    await refreshDocumentLibrary();
    setAnnouncement("The public link was revoked.");
  }, [refreshDocumentLibrary, store]);

  const copyPublishedLink = useCallback(async (url: string) => {
    await navigator.clipboard.writeText(url);
    setAnnouncement("Public link copied.");
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
                layoutOptionsForTheme(resolveTheme(state.doc.theme.shapeId, state.doc.theme.paletteId))
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

        case "commit-edit": {
          if (
            editing?.isNewNode &&
            editing.draft.trim() === "" &&
            getNode(committed.doc, editing.nodeId).childIds.length === 0
          ) {
            break;
          }
          setHistory(committed);
          closeEditing();
          break;
        }

        case "create-sibling": {
          if (selection) {
            createAndEdit(history, { type: "CreateSibling", anchorId: selection }, "New sibling");
          }
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
      if (helpMode || libraryOpen) return;
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
      if (primary && event.key === "0") {
        event.preventDefault();
        setViewport(resetZoom);
      }
    },
    [helpMode, libraryOpen, openHelp]
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
    anchor.download = exportFilename(getNode(previewDoc, previewDoc.rootId).text, extension);
    anchor.click();
    if (typeof data !== "string") URL.revokeObjectURL(url);
  }, [previewDoc]);

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
      const session = takeEditingSession(editingRef);
      if (session) {
        const committed = commitDraft(historyRef.current, session);
        historyRef.current = committed;
        setHistory(committed);
        autosaveRef.current?.schedule(committed.doc, committed.selection);
        closeEditing();
      }
      try {
        await flushPendingLocalSave();
        const bundle = await storeLocalDocument(store, nextDoc, nextDoc.rootId, {
          sourceFilename: file.name
        });
        activateLocalDocument(nextDoc, nextDoc.rootId, bundle.entry.updatedAt);
      } catch (error) {
        setNotice(
          error instanceof Error
            ? error.message
            : `Could not save ${file.name} in this browser. The current map was not changed.`
        );
        setAnnouncement("Markdown import was not opened because local storage failed.");
        return;
      }
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
  }, [activateLocalDocument, closeEditing, commitDraft, flushPendingLocalSave, store]);

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

  const editNodeAtEnd = useCallback((id: NodeId) => {
    const current = historyRef.current;
    const text = getNode(current.doc, id).text;
    sessionCounter += 1;
    const session: EditingState = {
      nodeId: id,
      draft: text,
      originalText: text,
      // Double-click means continue writing. F2 remains the explicit select-all entry.
      selectAllOnFocus: false,
      isNewNode: false,
      groupId: `edit-${sessionCounter}`
    };
    editingRef.current = session;
    setHistory((state) => ({ ...state, selection: id }));
    setEditing(session);
  }, []);

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

  /**
   * §12 — layout-mode switch as one undoable command. Entering two-sided layout balances
   * first-level branches when they all share one side (a right-only placeholder, never a real
   * choice); a mixed arrangement is kept verbatim.
   */
  const applyLayoutMode = useCallback((mode: "right" | "two-sided") => {
    setHistory((state) => {
      if (state.doc.layout.mode === mode) return state;
      const sides =
        mode === "two-sided"
          ? planTwoSidedSides(
              state.doc,
              layoutOptionsForTheme(resolveTheme(state.doc.theme.shapeId, state.doc.theme.paletteId))
            )
          : undefined;
      return dispatch(state, { type: "SetLayoutMode", mode, sides });
    });
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
          setViewport(fitToCanvas(result.bounds));
          break;
        case "center": {
          setHistory(committed);
          const box = selected ? result.boxes[selected] : result.boxes[committed.doc.rootId];
          if (box) setViewport((current) => centerOn(current, box));
          break;
        }
        case "reset-zoom":
          setHistory(committed);
          setViewport(resetZoom);
          break;
        case "toggle-layout": {
          const mode = committed.doc.layout.mode === "right" ? "two-sided" : "right";
          const sides =
            mode === "two-sided"
              ? planTwoSidedSides(
                  committed.doc,
                  layoutOptionsForTheme(
                    resolveTheme(committed.doc.theme.shapeId, committed.doc.theme.paletteId)
                  )
                )
              : undefined;
          setHistory(dispatch(committed, { type: "SetLayoutMode", mode, sides }));
          break;
        }
        case "document-library":
          setHistory(committed);
          void openDocumentLibrary();
          return;
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
      closeEditing,
      commitDraft,
      createAndEdit,
      download,
      fitToCanvas,
      downloadPng,
      downloadSvg,
      editing,
      history,
      openDocumentLibrary,
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
  // The overlaid textarea must use the same role tokens and typography as the node it covers,
  // or an edited label visibly shrinks or recolours the moment editing starts.
  const editingDepth = editingBox?.depth ?? 0;
  const editingNodeTokens = roleTokens(theme, editingDepth);
  // Theme differentiation step 1 — the fill can be a branch colour in by-first-level mode, so
  // the textarea must read the same branch-aware colours the canvas paints.
  const editingNodeColors = nodeFillAndTextFor(previewDoc, theme, editing?.nodeId ?? doc.rootId, editingDepth);
  const { size: editingFontSize, weight: editingFontWeight } = roleTypography(theme, editingDepth);

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

  /**
   * The textarea box follows the node box in screen pixels through the percentage mapping
   * above; every metric the textarea carries (font, padding, radius, ring) is a document unit
   * from the theme and must be multiplied by viewport.scale to land on the same screen pixels
   * as the SVG (document × scale = screen px).
   */
  const editingScale = viewport.scale;
  const editingFontSizePx = editingFontSize * editingScale;
  const editingPaddingY = editingNodeTokens.paddingY * editingScale;
  const editingPaddingX = editingNodeTokens.paddingX * editingScale;
  const editingRadius = editingNodeTokens.radius * editingScale;
  const editingRingWidth = 2 * editingScale;
  const editingRightPadding = Math.max(editingPaddingX - EDITING_SAFETY_MARGIN, 0);

  const hasSelectedArrangeActions =
    selection !== null &&
    (canMoveSide(doc, selection) ||
      canReorder(doc, selection, "before-previous") ||
      canReorder(doc, selection, "after-next") ||
      (previousSiblingId(doc, selection) !== null &&
        canReparent(doc, selection, previousSiblingId(doc, selection)!)) ||
      (nextSiblingId(doc, selection) !== null &&
        canReparent(doc, selection, nextSiblingId(doc, selection)!)));
  const overlayOpen = helpMode !== null || libraryOpen || importing;

  return (
    <div
      ref={shellRef}
      className="editor-shell"
      data-page-open={libraryOpen || importing ? "" : undefined}
      onKeyDownCapture={onGlobalKeyDown}
    >
      {/*
        Canvas-first chrome: the map is the page, and the controls float on it (roadmap
        2026-08-26). The toolbar and any notice stack in one absolutely-positioned column so the
        notice always sits under the toolbar without either of them reserving layout space.
        `data-chrome-top` is what `chromeInsets()` measures, so Fit never hides a node behind it.
      */}
      <div className="editor-chrome-top" data-chrome-top ref={chromeTopRef}>
      <header
        data-overlay-background
        aria-hidden={overlayOpen ? true : undefined}
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
            <div className="layout-options" role="group" aria-label="Map layout">
              <button
                type="button"
                className="theme-option layout-option"
                aria-pressed={doc.layout.mode === "right"}
                data-close-menu
                onClick={() => applyLayoutMode("right")}
              >
                <span className="layout-swatch" aria-hidden="true">→</span>
                <span className="layout-option-label">
                  <span>Right-only</span>
                  <small>Every branch flows right</small>
                </span>
                <span className="theme-check" aria-hidden="true">
                  {doc.layout.mode === "right" ? "✓" : ""}
                </span>
              </button>
              <button
                type="button"
                className="theme-option layout-option"
                aria-pressed={doc.layout.mode === "two-sided"}
                data-close-menu
                onClick={() => applyLayoutMode("two-sided")}
              >
                <span className="layout-swatch" aria-hidden="true">⇄</span>
                <span className="layout-option-label">
                  <span>Two-sided</span>
                  <small>Balance first-level branches</small>
                </span>
                <span className="theme-check" aria-hidden="true">
                  {doc.layout.mode === "two-sided" ? "✓" : ""}
                </span>
              </button>
            </div>

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
              onClick={() => setViewport(fitToCanvas(result.bounds))}
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
            <button
              type="button"
              className="menu-action"
              data-close-menu
              onClick={() => setViewport(resetZoom)}
            >
              <span>Reset zoom to 100%</span>
              <small>Actual size · Command or Control + 0</small>
            </button>
          </ToolbarMenu>

          <ToolbarMenu label="Style" align="end">
            <p className="toolbar-popover-label">Shape</p>
            <div className="theme-options">
              {SHAPES.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className="theme-option"
                  aria-pressed={doc.theme.shapeId === entry.id}
                  data-close-menu
                  onClick={() => {
                    setHistory((state) =>
                      state.doc.theme.shapeId === entry.id
                        ? state
                        : dispatch(state, { type: "SetShape", shapeId: entry.id })
                    );
                    setAnnouncement(`Shape changed to ${entry.name}.`);
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
                    {doc.theme.shapeId === entry.id ? "✓" : ""}
                  </span>
                </button>
              ))}
            </div>
            <p className="toolbar-popover-label">Palette</p>
            <div className="theme-options">
              {PALETTES.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className="theme-option palette-option"
                  aria-pressed={doc.theme.paletteId === entry.id}
                  data-close-menu
                  onClick={() => {
                    setHistory((state) =>
                      state.doc.theme.paletteId === entry.id
                        ? state
                        : dispatch(state, { type: "SetPalette", paletteId: entry.id })
                    );
                    setAnnouncement(`Palette changed to ${entry.name}.`);
                  }}
                >
                  <span className="palette-swatches" aria-hidden="true">
                    {entry.entries.map((swatch) => (
                      <span key={swatch.fill} style={{ background: swatch.fill }} />
                    ))}
                  </span>
                  <span className="palette-meta">
                    <span>{entry.name}</span>
                    <small>{entry.description}</small>
                  </span>
                  <span className="theme-check" aria-hidden="true">
                    {doc.theme.paletteId === entry.id ? "✓" : ""}
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
                setHistory((state) =>
                  dispatch(state, {
                    type: "SetBranchColorMode",
                    mode:
                      state.doc.theme.branchColorMode === "single"
                        ? "by-first-level-branch"
                        : "single"
                  })
                )
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
              onClick={() => void openDocumentLibrary()}
            >
              <span>Document library…</span>
              <small>Open and manage maps saved in this browser</small>
            </button>
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
          data-overlay-background
          aria-hidden={overlayOpen ? true : undefined}
          role="status"
          className="editor-notice"
        >
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)}>
            Dismiss
          </button>
        </div>
      )}

      {!notice && deletedDocuments.at(-1) && (
        <div
          data-overlay-background
          aria-hidden={overlayOpen ? true : undefined}
          role="status"
          className="editor-notice"
        >
          <span>Deleted “{entryDisplayName(deletedDocuments.at(-1)!.entry)}” from this browser.</span>
          <button
            type="button"
            onClick={() =>
              void undoDeleteStoredDocument().catch(() => {
                setNotice("The deleted document could not be restored in this browser.");
              })
            }
          >
            Undo delete
          </button>
        </div>
      )}
      </div>

      {/*
        The frame — not just the surface — carries the overlay-background marking. The zoom
        capsule and the authoring hint are the surface's *siblings*, so marking only the
        surface left them outside the inert set: `Primary+/` would hide the canvas from
        assistive technology and still expose two floating controls to a virtual cursor. The
        backdrop and the dialog's focus trap happen to cover pointer and Tab today, which is
        exactly why this was invisible — the marking has to be on the common ancestor.
      */}
      <div
        className="canvas-frame"
        data-overlay-background
        aria-hidden={overlayOpen ? true : undefined}
      >
        <div
          ref={surfaceRef}
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
            onEdit={editNodeAtEnd}
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
                height: `${editorRect.height}%`,
                fontFamily: theme.typography.fontFamily,
                fontSize: editingFontSizePx,
                fontWeight: editingFontWeight,
                lineHeight: theme.typography.lineHeight,
                padding: `${editingPaddingY}px ${editingRightPadding}px ${editingPaddingY}px ${editingPaddingX}px`,
                background: editingNodeColors.background,
                color: editingNodeColors.text,
                borderRadius: editingRadius,
                boxShadow: `0 0 0 ${editingRingWidth}px ${theme.interaction.editingOutline}, 0 4px 16px rgb(22 31 45 / 16%)`
              }}
              rows={1}
            />
          )}
        </div>

        {shouldShowAuthoringHint(doc, hintDismissed) && (
          <p role="note" className="canvas-hint">
            <span>Enter = sibling · Tab = child</span>
            <button
              type="button"
              aria-label="Dismiss hint"
              onClick={() => {
                setHintDismissed(true);
                try {
                  localStorage.setItem(HINT_DISMISSED_KEY, "1");
                } catch {
                  // Blocked storage must not surface an error for a one-line hint.
                }
              }}
            >
              ×
            </button>
          </p>
        )}

        <div className="zoom-capsule" role="group" aria-label="Zoom">
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => setViewport((v) => zoomToCenter(v, 1 / 1.25))}
          >
            −
          </button>
          <button
            type="button"
            className="zoom-capsule-percent"
            aria-label="Reset zoom to 100%"
            onClick={() => setViewport(resetZoom)}
          >
            {zoomPercent(viewport)}
          </button>
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => setViewport((v) => zoomToCenter(v, 1.25))}
          >
            +
          </button>
        </div>
      </div>

      <footer
        data-overlay-background
        data-chrome-bottom
        aria-hidden={overlayOpen ? true : undefined}
        className="editor-statusbar"
      >
        <span className="status-shortcuts">
          {/* Split so a narrow screen drops the keyboard hints — useless on a touch device —
              without also truncating the node count to a bare digit. */}
          <span className="status-count">{Object.keys(doc.nodes).length} nodes</span>
          <span className="status-keys">
            {" · "}Enter = save / next sibling · Tab = child · Shift+Tab = promote ·
            Space = collapse · F2 = rename
          </span>
        </span>
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
      {importing && (
        <ImportPage
          state={importState}
          message={importMessage}
          onCancel={() => navigate({ name: "editor" }, { replace: true })}
          onRetry={() => setImportAttempt((attempt) => attempt + 1)}
        />
      )}
      {libraryOpen && (
        <LibraryPage
          state={libraryState}
          entries={libraryEntries}
          activeDocumentId={doc.id}
          unavailableMessage={libraryUnavailableMessage}
          undoTitle={deletedDocuments.at(-1) ? entryDisplayName(deletedDocuments.at(-1)!.entry) : null}
          cloudState={cloudLibraryState}
          cloudUser={cloudUser}
          cloudDocuments={cloudDocuments}
          onClose={closeDocumentLibrary}
          onNew={newLocalDocument}
          onOpen={openLocalDocument}
          onRename={renameStoredDocument}
          onDuplicate={duplicateStoredDocument}
          onDelete={deleteStoredDocument}
          onUndoDelete={undoDeleteStoredDocument}
          onSignIn={signInForCloudSave}
          onSignOut={signOutFromCloudSave}
          onRetryCloud={refreshCloudLibrary}
          onSaveOnline={async (localDocumentId) => {
            await saveLocalDocumentOnline(localDocumentId);
          }}
          onOpenOnline={openOnlineDocument}
          onDeleteOnline={deleteOnlineDocument}
          onPublish={publishLocalDocument}
          onUnpublish={unpublishLocalDocument}
          onCopyPublishedLink={copyPublishedLink}
        />
      )}
    </div>
  );
}
