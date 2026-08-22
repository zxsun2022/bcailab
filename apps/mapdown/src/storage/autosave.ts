import { checkInvariants } from "../model/invariants";
import { SCHEMA_VERSION, type MindMapDocument, type NodeId } from "../model/types";
import { normalizeThemeSelection } from "../theme/presets";
import {
  checksumOf,
  makeSnapshot,
  rememberLastDocument,
  type DocumentIndexEntry,
  type Snapshot,
  type SnapshotStore
} from "./store";

/**
 * Autosave and recovery, per `storage-export.md` §5–§8.
 *
 * The two rules that shape everything here:
 *
 * **Typing never waits for storage (§2.2).** Saves are debounced and fire-and-forget; the
 * in-memory document is always the source of truth for rendering.
 *
 * **A save must not destroy the last good snapshot before the new one lands (§5.4).** So the
 * order is: write the new snapshot under a fresh id, wait for it to commit, *then* advance the
 * index pointer, then prune. A crash at any point leaves the previous snapshot reachable.
 */

/** §7 — deliberately not just "Saved": a user must not read this as a file or cloud backup. */
export type SaveStatus =
  | { kind: "idle" }
  | { kind: "unsaved" }
  | { kind: "saving" }
  | { kind: "saved"; at: number }
  | { kind: "failed"; message: string };

export function saveStatusLabel(status: SaveStatus): string {
  switch (status.kind) {
    case "idle":
      return "";
    case "unsaved":
      return "Unsaved changes";
    case "saving":
      return "Saving…";
    case "saved":
      return "Saved on this device";
    case "failed":
      return status.message;
  }
}

export const DEBOUNCE_MS = 500;
/** §5.4 — a bounded number of prior snapshots, so recovery has somewhere to fall back to. */
export const SNAPSHOTS_RETAINED = 5;

export interface AutosaveOptions {
  store: SnapshotStore;
  onStatus: (status: SaveStatus) => void;
  debounceMs?: number;
  now?: () => number;
  newSnapshotId?: (document: MindMapDocument) => string;
}

let snapshotSeq = 0;

export function resetSnapshotIdsForTests(): void {
  snapshotSeq = 0;
}

export interface Autosave {
  /** Mark the document dirty and schedule a write. Returns immediately. */
  schedule(document: MindMapDocument, selection: NodeId | null): void;
  /** §9 — force a write now, for visibilitychange. Resolves when the write settles. */
  flush(): Promise<void>;
  dispose(): void;
}

export function createAutosave(options: AutosaveOptions): Autosave {
  const {
    store,
    onStatus,
    debounceMs = DEBOUNCE_MS,
    now = () => Date.now(),
    newSnapshotId = (document) => {
      const nonce =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now().toString(36)}-${++snapshotSeq}`;
      return `${document.id}-${nonce}`;
    }
  } = options;

  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: { document: MindMapDocument; selection: NodeId | null } | null = null;
  let inFlight: Promise<void> = Promise.resolve();
  let pruneInFlight: Promise<void> = Promise.resolve();
  let disposed = false;

  const write = async () => {
    const job = pending;
    pending = null;
    if (!job || disposed) return;

    onStatus({ kind: "saving" });
    const snapshot = makeSnapshot(
      job.document,
      job.selection,
      newSnapshotId(job.document),
      now()
    );

    try {
      // 1. Write under a new id. The previous snapshot is untouched and still pointed at.
      await store.putSnapshot(snapshot);

      // 2. Only now advance the pointer. A crash before this leaves the old snapshot current.
      const existingEntry = await store.getIndexEntry(job.document.id);
      const entry: DocumentIndexEntry = {
        id: job.document.id,
        title: job.document.title,
        createdAt: existingEntry?.createdAt ?? snapshot.savedAt,
        updatedAt: snapshot.savedAt,
        nodeCount: Object.keys(job.document.nodes).length,
        lastSnapshotId: snapshot.id,
        ...(existingEntry?.sourceFilename
          ? { sourceFilename: existingEntry.sourceFilename }
          : {})
      };
      await store.putIndexEntry(entry);
      rememberLastDocument(job.document.id);

      onStatus({ kind: "saved", at: snapshot.savedAt });

      // 3. Prune asynchronously — never on the path that reports success.
      pruneInFlight = prune(store, job.document.id).catch(() => {});
    } catch (error) {
      // §8.2 — the in-memory document is kept, the warning is non-blocking, and the wording
      // points at the action that actually protects the user's work.
      onStatus({
        kind: "failed",
        message:
          error instanceof Error && /quota/i.test(error.message)
            ? "Storage is full. Export a Markdown copy now to avoid losing changes."
            : "This document could not be saved in the browser. Export a Markdown copy now."
      });
    }
  };

  return {
    schedule(document, selection) {
      if (disposed) return;
      pending = { document, selection };
      onStatus({ kind: "unsaved" });
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        inFlight = inFlight.then(write);
      }, debounceMs);
    },

    async flush() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      inFlight = inFlight.then(write);
      await inFlight;
      await pruneInFlight;
    },

    dispose() {
      disposed = true;
      if (timer) clearTimeout(timer);
    }
  };
}

async function prune(store: SnapshotStore, documentId: string): Promise<void> {
  const ids = await store.listSnapshotIds(documentId);
  for (const id of ids.slice(0, Math.max(0, ids.length - SNAPSHOTS_RETAINED))) {
    await store.deleteSnapshot(id);
  }
}

/* ---------- recovery ---------- */

export type RecoveryOutcome =
  | { kind: "restored"; snapshot: Snapshot }
  | { kind: "restored-earlier"; snapshot: Snapshot; skipped: number }
  | { kind: "nothing-stored" }
  | { kind: "unrecoverable"; inspected: number };

/**
 * §6 — recovery MUST validate tree invariants before activating a snapshot, and fall back to
 * the previous valid one if the latest is bad.
 *
 * A checksum mismatch and an invariant violation are treated the same way: both mean the stored
 * bytes cannot be trusted, and loading a broken tree is worse than losing the last few seconds
 * of work, because a broken tree cannot be exported either.
 */
export async function recoverDocument(
  store: SnapshotStore,
  documentId: string
): Promise<RecoveryOutcome> {
  const ids = await store.listSnapshotIds(documentId);
  if (ids.length === 0) return { kind: "nothing-stored" };

  let skipped = 0;
  // Newest first.
  for (const id of [...ids].reverse()) {
    const snapshot = await store.getSnapshot(id);
    if (!snapshot) {
      skipped++;
      continue;
    }
    const treeIntact =
      snapshot.checksum === checksumOf(snapshot.document) &&
      checkInvariants(snapshot.document).length === 0;
    // A snapshot written by a future schema version cannot be trusted to mean what this build
    // thinks it means; treat it like a torn write and fall back to an earlier point.
    const versionSupported = snapshot.schemaVersion === SCHEMA_VERSION;

    if (treeIntact && versionSupported) {
      // Checksum and invariants cover the tree, not the selection pointer; a torn write could
      // leave a dangling id that would crash the first structural command after recovery.
      const selectedNodeId =
        snapshot.selectedNodeId !== null && snapshot.document.nodes[snapshot.selectedNodeId]
          ? snapshot.selectedNodeId
          : snapshot.document.rootId;
      const restored =
        selectedNodeId === snapshot.selectedNodeId ? snapshot : { ...snapshot, selectedNodeId };
      // D-24 — a snapshot written before the two-axis theme split carries `theme.themeId`.
      // Normalise it the same way import does, so the legacy single-key theme maps onto its
      // shape + palette pair instead of silently resetting to the defaults.
      const document = {
        ...restored.document,
        theme: normalizeThemeSelection(restored.document.theme)
      };
      const normalized = { ...restored, document };
      return skipped === 0
        ? { kind: "restored", snapshot: normalized }
        : { kind: "restored-earlier", snapshot: normalized, skipped };
    }
    skipped++;
  }

  return { kind: "unrecoverable", inspected: ids.length };
}

export function recoveryMessage(outcome: RecoveryOutcome): string | null {
  switch (outcome.kind) {
    case "restored":
    case "nothing-stored":
      return null;
    case "restored-earlier":
      return `The most recent save could not be read. Opened an earlier recovery point instead (${outcome.skipped} newer ${outcome.skipped === 1 ? "snapshot was" : "snapshots were"} skipped).`;
    case "unrecoverable":
      return `None of the ${outcome.inspected} stored snapshots could be read. Started a new document; nothing stored was deleted.`;
  }
}
