import type { MindMapDocument, NodeId } from "../model/types";
import { entryDisplayName, rootLabelOf } from "./display-name";
import type { CloudDocumentSummary } from "../cloud/types";
import {
  checksumOf,
  makeSnapshot,
  type DocumentBundle,
  type DocumentIndexEntry,
  type SnapshotStore
} from "./store";

export const DOCUMENT_TITLE_MAX_LENGTH = 120;

export function normalizeDocumentTitle(value: string): string {
  const title = value.trim().replace(/\s+/g, " ");
  if (!title) throw new Error("Enter a title.");
  if ([...title].length > DOCUMENT_TITLE_MAX_LENGTH) {
    throw new Error(`Keep the title to ${DOCUMENT_TITLE_MAX_LENGTH} characters or fewer.`);
  }
  return title;
}

export async function listLocalDocuments(
  store: SnapshotStore
): Promise<DocumentIndexEntry[]> {
  return (await store.listIndexEntries()).sort(
    (a, b) => b.updatedAt - a.updatedAt || a.title.localeCompare(b.title) || a.id.localeCompare(b.id)
  );
}

interface StoreDocumentOptions {
  now?: number;
  snapshotId?: string;
  sourceFilename?: string;
  /** The document this one forked from when a stale online save was rejected. */
  conflictedCopyOf?: string;
  /** The published map this one was copied from, kept as provenance for the copy flow. */
  copiedFromPublicId?: string;
}

let localSnapshotSequence = 0;

function generatedId(prefix: string): string {
  const nonce =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${++localSnapshotSequence}`;
  return `${prefix}-${nonce}`;
}

export async function storeLocalDocument(
  store: SnapshotStore,
  document: MindMapDocument,
  selectedNodeId: NodeId | null,
  options: StoreDocumentOptions = {}
): Promise<DocumentBundle> {
  const now = options.now ?? Date.now();
  const snapshot = makeSnapshot(
    document,
    selectedNodeId,
    options.snapshotId ?? generatedId(document.id),
    now
  );
  const bundle: DocumentBundle = {
    entry: {
      id: document.id,
      title: document.title,
      createdAt: now,
      updatedAt: now,
      nodeCount: Object.keys(document.nodes).length,
      rootLabel: rootLabelOf(document),
      lastSnapshotId: snapshot.id,
      ...(options.sourceFilename ? { sourceFilename: options.sourceFilename } : {}),
      ...(options.conflictedCopyOf ? { conflictedCopyOf: options.conflictedCopyOf } : {}),
      ...(options.copiedFromPublicId ? { copiedFromPublicId: options.copiedFromPublicId } : {})
    },
    snapshots: [snapshot]
  };
  await store.putDocumentBundle(bundle);
  return bundle;
}

/**
 * Rename a map that is **not** open in the editor, by rewriting its root node.
 *
 * The root label is the map's name (D-18), so renaming has to change the root or it is a button
 * with no visible effect. That makes rename a content edit rather than a metadata edit, and it
 * is the asymmetry the owner accepted on 2026-08-26: the open map renames through the editor's
 * history and is undoable per `spec/vision.md` §4.8, while a map that is not open has no history
 * to write to and is covered by the library's in-tab undo instead.
 *
 * `title` is deliberately untouched. `spec/storage-export.md` §10.3 forbids forcing the root
 * text to equal the filename/title, and `title` keeps its own job as import provenance.
 */
export async function renameLocalDocument(
  store: SnapshotStore,
  documentId: string,
  requestedName: string,
  now = Date.now()
): Promise<DocumentBundle> {
  const name = normalizeDocumentTitle(requestedName);
  const current = await store.getDocumentBundle(documentId);
  if (!current || current.snapshots.length === 0) {
    throw new Error("This local document could not be found.");
  }
  const renamed: DocumentBundle = {
    entry: { ...current.entry, rootLabel: name, updatedAt: now },
    snapshots: current.snapshots.map((snapshot) => {
      const root = snapshot.document.nodes[snapshot.document.rootId];
      if (!root) return snapshot;
      const document = {
        ...snapshot.document,
        nodes: { ...snapshot.document.nodes, [root.id]: { ...root, text: name } }
      };
      // The checksum covers node text, so a renamed snapshot must be re-stamped or recovery
      // reads it as a torn write (§5.3).
      return { ...snapshot, document, checksum: checksumOf(document) };
    })
  };
  if (renamed.entry.cloudDocumentId) delete renamed.entry.cloudSavedSnapshotId;
  await store.putDocumentBundle(renamed);
  return renamed;
}

function copyTitle(title: string, existingTitles: Set<string>): string {
  for (let number = 1; ; number++) {
    const suffix = number === 1 ? " copy" : ` copy ${number}`;
    const baseLength = DOCUMENT_TITLE_MAX_LENGTH - [...suffix].length;
    const base = [...title].slice(0, baseLength).join("").trimEnd();
    const candidate = `${base}${suffix}`;
    if (!existingTitles.has(candidate.toLocaleLowerCase())) return candidate;
  }
}

interface DuplicateDocumentOptions {
  now?: number;
  documentId?: string;
  snapshotId?: string;
}

export async function duplicateLocalDocument(
  store: SnapshotStore,
  documentId: string,
  options: DuplicateDocumentOptions = {}
): Promise<DocumentBundle> {
  const source = await store.getDocumentBundle(documentId);
  if (!source || source.snapshots.length === 0) {
    throw new Error("This local document could not be found.");
  }
  const sourceSnapshot =
    source.snapshots.find((snapshot) => snapshot.id === source.entry.lastSnapshotId) ??
    source.snapshots.at(-1)!;
  // The copy suffix has to land on the **root label**, because that is the name the library
  // shows (D-18). Suffixing `title` instead leaves two rows reading identically, which is what
  // shipped the first time this was written against the old naming rule.
  const existingNames = new Set(
    (await store.listIndexEntries()).map((entry) => entryDisplayName(entry).toLocaleLowerCase())
  );
  const name = copyTitle(entryDisplayName(source.entry), existingNames);
  const id = options.documentId ?? generatedId("doc");
  const cloned = structuredClone(sourceSnapshot.document);
  const root = cloned.nodes[cloned.rootId];
  const document: MindMapDocument = {
    ...cloned,
    id,
    // `title` is provenance and is inherited unchanged; §10.3 keeps it independent of the root.
    nodes: root ? { ...cloned.nodes, [root.id]: { ...root, text: name } } : cloned.nodes,
    revision: 0
  };
  return storeLocalDocument(store, document, sourceSnapshot.selectedNodeId, {
    now: options.now,
    snapshotId: options.snapshotId,
    sourceFilename: source.entry.sourceFilename
  });
}

export async function deleteLocalDocument(
  store: SnapshotStore,
  documentId: string
): Promise<DocumentBundle> {
  const deleted = await store.deleteDocumentBundle(documentId);
  if (!deleted) throw new Error("This local document could not be found.");
  return deleted;
}

export async function restoreLocalDocument(
  store: SnapshotStore,
  deleted: DocumentBundle
): Promise<void> {
  await store.putDocumentBundle(deleted);
}

export async function linkLocalDocumentToCloud(
  store: SnapshotStore,
  localDocumentId: string,
  cloud: CloudDocumentSummary,
  savedSnapshotId: string
): Promise<DocumentIndexEntry> {
  const entry = await store.getIndexEntry(localDocumentId);
  if (!entry) throw new Error("This local document could not be found.");
  const linked: DocumentIndexEntry = {
    ...entry,
    cloudDocumentId: cloud.id,
    cloudVersion: cloud.version,
    cloudSavedSnapshotId: savedSnapshotId,
    cloudUpdatedAt: cloud.updatedAt,
    ...(cloud.publication ? { cloudPublication: cloud.publication } : {})
  };
  if (!cloud.publication) delete linked.cloudPublication;
  await store.putIndexEntry(linked);
  return linked;
}

/**
 * A stale save did not reach the cloud, so no local snapshot may still claim to match it.
 * Refresh the server metadata needed for an explicit retry and clear that saved pointer.
 */
export async function refreshLocalDocumentCloudMetadata(
  store: SnapshotStore,
  localDocumentId: string,
  cloud: CloudDocumentSummary
): Promise<DocumentIndexEntry> {
  const entry = await store.getIndexEntry(localDocumentId);
  if (!entry || entry.cloudDocumentId !== cloud.id) {
    throw new Error("This local document is not linked to the conflicted online copy.");
  }
  const refreshed: DocumentIndexEntry = {
    ...entry,
    cloudVersion: cloud.version,
    cloudUpdatedAt: cloud.updatedAt,
    ...(cloud.publication ? { cloudPublication: cloud.publication } : {})
  };
  delete refreshed.cloudSavedSnapshotId;
  if (!cloud.publication) delete refreshed.cloudPublication;
  await store.putIndexEntry(refreshed);
  return refreshed;
}

export async function unlinkLocalDocumentFromCloud(
  store: SnapshotStore,
  localDocumentId: string
): Promise<DocumentIndexEntry> {
  const entry = await store.getIndexEntry(localDocumentId);
  if (!entry) throw new Error("This local document could not be found.");
  const localOnly = { ...entry };
  delete localOnly.cloudDocumentId;
  delete localOnly.cloudVersion;
  delete localOnly.cloudSavedSnapshotId;
  delete localOnly.cloudUpdatedAt;
  delete localOnly.cloudPublication;
  await store.putIndexEntry(localOnly);
  return localOnly;
}
