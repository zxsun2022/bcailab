import { SCHEMA_VERSION, type MindMapDocument, type NodeId } from "../model/types";
import type { CloudPublication } from "../cloud/types";

/**
 * Local persistence, per `storage-export.md` §3–§6.
 *
 * The storage backend sits behind an interface for one reason that matters more than testing:
 * §2.4 says browser storage is **not** presented as a durable backup, and §8 requires the app
 * to keep working when it fails outright. An app that can only run against a working IndexedDB
 * cannot honour that — so the failure path is a first-class implementation, not a `catch`.
 */

export interface Snapshot {
  id: string;
  documentId: string;
  document: MindMapDocument;
  selectedNodeId: NodeId | null;
  schemaVersion: number;
  savedAt: number;
  /** §5.3 — validation metadata, so a torn write is detectable rather than silently loaded. */
  checksum: string;
}

export interface DocumentIndexEntry {
  id: string;
  title: string;
  updatedAt: number;
  createdAt: number;
  nodeCount: number;
  /** The pointer §5.4 requires: only ever advanced after a snapshot is fully committed. */
  lastSnapshotId: string;
  sourceFilename?: string;
  /** Present only after an explicit account-save action; local autosave never creates it. */
  cloudDocumentId?: string;
  cloudVersion?: number;
  cloudSavedSnapshotId?: string;
  cloudUpdatedAt?: number;
  cloudPublication?: CloudPublication;
}

/** A complete local document, used for document-level operations and current-tab undo. */
export interface DocumentBundle {
  entry: DocumentIndexEntry;
  snapshots: Snapshot[];
}

export interface SnapshotStore {
  putSnapshot(snapshot: Snapshot): Promise<void>;
  getSnapshot(id: string): Promise<Snapshot | null>;
  listSnapshotIds(documentId: string): Promise<string[]>;
  deleteSnapshot(id: string): Promise<void>;
  putIndexEntry(entry: DocumentIndexEntry): Promise<void>;
  getIndexEntry(documentId: string): Promise<DocumentIndexEntry | null>;
  listIndexEntries(): Promise<DocumentIndexEntry[]>;
  getDocumentBundle(documentId: string): Promise<DocumentBundle | null>;
  putDocumentBundle(bundle: DocumentBundle): Promise<void>;
  deleteDocumentBundle(documentId: string): Promise<DocumentBundle | null>;
}

/**
 * A cheap content hash. Not cryptographic and does not need to be — its only job is to notice a
 * snapshot that was written partially or mangled, which is the failure §6 asks recovery to
 * survive.
 */
export function checksumOf(document: MindMapDocument): string {
  const canonical = JSON.stringify({
    rootId: document.rootId,
    nodes: Object.keys(document.nodes)
      .sort()
      .map((id) => {
        const node = document.nodes[id]!;
        return [id, node.text, node.parentId, node.childIds.join(","), node.collapsed, node.side];
      })
  });
  let hash = 2166136261;
  for (let i = 0; i < canonical.length; i++) {
    hash ^= canonical.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function makeSnapshot(
  document: MindMapDocument,
  selectedNodeId: NodeId | null,
  id: string,
  now: number
): Snapshot {
  return {
    id,
    documentId: document.id,
    document,
    selectedNodeId,
    schemaVersion: SCHEMA_VERSION,
    savedAt: now,
    checksum: checksumOf(document)
  };
}

/* ---------- in-memory backend ---------- */

/**
 * Used by tests, and as the fallback when IndexedDB is unavailable — private browsing, a
 * corrupted database, a browser that refuses the origin. The editor stays fully usable; only
 * the promise of surviving a reload is lost, which §8 says must be visible rather than silent.
 */
export class MemoryStore implements SnapshotStore {
  private snapshots = new Map<string, Snapshot>();
  private index = new Map<string, DocumentIndexEntry>();
  /** Test hook: make the next write fail the way a quota error would. */
  failNextWrite: string | null = null;

  private rejectFailedWrite(): void {
    if (this.failNextWrite) {
      const message = this.failNextWrite;
      this.failNextWrite = null;
      throw new Error(message);
    }
  }

  async putSnapshot(snapshot: Snapshot): Promise<void> {
    this.rejectFailedWrite();
    this.snapshots.set(snapshot.id, structuredClone(snapshot));
  }

  async getSnapshot(id: string): Promise<Snapshot | null> {
    const found = this.snapshots.get(id);
    return found ? structuredClone(found) : null;
  }

  async listSnapshotIds(documentId: string): Promise<string[]> {
    return [...this.snapshots.values()]
      .filter((s) => s.documentId === documentId)
      .sort((a, b) => a.savedAt - b.savedAt)
      .map((s) => s.id);
  }

  async deleteSnapshot(id: string): Promise<void> {
    this.snapshots.delete(id);
  }

  async putIndexEntry(entry: DocumentIndexEntry): Promise<void> {
    this.index.set(entry.id, { ...entry });
  }

  async getIndexEntry(documentId: string): Promise<DocumentIndexEntry | null> {
    const found = this.index.get(documentId);
    return found ? { ...found } : null;
  }

  async listIndexEntries(): Promise<DocumentIndexEntry[]> {
    return [...this.index.values()];
  }

  async getDocumentBundle(documentId: string): Promise<DocumentBundle | null> {
    const entry = this.index.get(documentId);
    if (!entry) return null;
    const snapshots = [...this.snapshots.values()]
      .filter((snapshot) => snapshot.documentId === documentId)
      .sort((a, b) => a.savedAt - b.savedAt);
    return structuredClone({ entry, snapshots });
  }

  async putDocumentBundle(bundle: DocumentBundle): Promise<void> {
    this.rejectFailedWrite();
    for (const snapshot of bundle.snapshots) {
      this.snapshots.set(snapshot.id, structuredClone(snapshot));
    }
    this.index.set(bundle.entry.id, { ...bundle.entry });
  }

  async deleteDocumentBundle(documentId: string): Promise<DocumentBundle | null> {
    const bundle = await this.getDocumentBundle(documentId);
    for (const [id, snapshot] of this.snapshots) {
      if (snapshot.documentId === documentId) this.snapshots.delete(id);
    }
    this.index.delete(documentId);
    return bundle;
  }

  /** Test helper: corrupt a stored snapshot the way a torn write would. */
  corrupt(id: string, mutate: (snapshot: Snapshot) => void): void {
    const found = this.snapshots.get(id);
    if (found) mutate(found);
  }
}

/* ---------- IndexedDB backend ---------- */

const DB_NAME = "mapdown";
const DB_VERSION = 1;
const SNAPSHOTS = "snapshots";
const INDEX = "documentIndex";

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

export class IndexedDbStore implements SnapshotStore {
  private db: Promise<IDBDatabase> | null = null;

  async close(): Promise<void> {
    const db = await this.db;
    db?.close();
    this.db = null;
  }

  private open(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    this.db = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(SNAPSHOTS)) {
          const store = db.createObjectStore(SNAPSHOTS, { keyPath: "id" });
          store.createIndex("documentId", "documentId");
        }
        if (!db.objectStoreNames.contains(INDEX)) {
          db.createObjectStore(INDEX, { keyPath: "id" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("IndexedDB could not be opened"));
    });
    return this.db;
  }

  private async txStores<T>(
    stores: string[],
    mode: IDBTransactionMode,
    run: (store: (name: string) => IDBObjectStore) => Promise<T>
  ) {
    const db = await this.open();
    const transaction = db.transaction(stores, mode);
    const completion = new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Transaction failed"));
      transaction.onabort = () => reject(transaction.error ?? new Error("Transaction aborted"));
    });
    let result: T;
    try {
      result = await run((name) => transaction.objectStore(name));
    } catch (error) {
      try {
        transaction.abort();
      } catch {
        // The transaction may already have aborted because the request failed.
      }
      await completion.catch(() => {});
      throw error;
    }
    // §5.4 — the write is not "done" until the transaction completes. Resolving on the request
    // alone would let the index pointer advance past a snapshot that never landed.
    await completion;
    return result;
  }

  private tx<T>(store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => Promise<T>) {
    return this.txStores([store], mode, (getStore) => run(getStore(store)));
  }

  putSnapshot(snapshot: Snapshot) {
    return this.tx(SNAPSHOTS, "readwrite", async (s) => void (await request(s.put(snapshot))));
  }

  getSnapshot(id: string) {
    return this.tx(SNAPSHOTS, "readonly", async (s) => (await request(s.get(id))) ?? null);
  }

  async listSnapshotIds(documentId: string) {
    const all = await this.tx(SNAPSHOTS, "readonly", async (s) =>
      request<Snapshot[]>(s.index("documentId").getAll(documentId))
    );
    return all.sort((a, b) => a.savedAt - b.savedAt).map((s) => s.id);
  }

  deleteSnapshot(id: string) {
    return this.tx(SNAPSHOTS, "readwrite", async (s) => void (await request(s.delete(id))));
  }

  putIndexEntry(entry: DocumentIndexEntry) {
    return this.tx(INDEX, "readwrite", async (s) => void (await request(s.put(entry))));
  }

  getIndexEntry(documentId: string) {
    return this.tx(INDEX, "readonly", async (s) => (await request(s.get(documentId))) ?? null);
  }

  listIndexEntries() {
    return this.tx(INDEX, "readonly", async (s) => request<DocumentIndexEntry[]>(s.getAll()));
  }

  getDocumentBundle(documentId: string) {
    return this.txStores([SNAPSHOTS, INDEX], "readonly", async (getStore) => {
      const entry = await request<DocumentIndexEntry | undefined>(getStore(INDEX).get(documentId));
      if (!entry) return null;
      const snapshots = await request<Snapshot[]>(
        getStore(SNAPSHOTS).index("documentId").getAll(documentId)
      );
      return {
        entry,
        snapshots: snapshots.sort((a, b) => a.savedAt - b.savedAt)
      };
    });
  }

  putDocumentBundle(bundle: DocumentBundle) {
    return this.txStores([SNAPSHOTS, INDEX], "readwrite", async (getStore) => {
      await Promise.all(
        bundle.snapshots.map((snapshot) => request(getStore(SNAPSHOTS).put(snapshot)))
      );
      await request(getStore(INDEX).put(bundle.entry));
    });
  }

  deleteDocumentBundle(documentId: string) {
    return this.txStores([SNAPSHOTS, INDEX], "readwrite", async (getStore) => {
      const entry = await request<DocumentIndexEntry | undefined>(getStore(INDEX).get(documentId));
      const snapshots = await request<Snapshot[]>(
        getStore(SNAPSHOTS).index("documentId").getAll(documentId)
      );
      await Promise.all(
        snapshots.map((snapshot) => request(getStore(SNAPSHOTS).delete(snapshot.id)))
      );
      await request(getStore(INDEX).delete(documentId));
      return entry
        ? { entry, snapshots: snapshots.sort((a, b) => a.savedAt - b.savedAt) }
        : null;
    });
  }
}

/** §3.3 — localStorage holds only a bootstrap pointer, never document JSON. */
const LAST_DOCUMENT_KEY = "mapdown.lastDocumentId";

export function rememberLastDocument(id: string): void {
  try {
    localStorage.setItem(LAST_DOCUMENT_KEY, id);
  } catch {
    // A blocked localStorage is not worth surfacing on its own; the document itself lives in
    // IndexedDB and the index can be scanned instead.
  }
}

export function recallLastDocument(): string | null {
  try {
    return localStorage.getItem(LAST_DOCUMENT_KEY);
  } catch {
    return null;
  }
}

export function createStore(): SnapshotStore {
  if (typeof indexedDB === "undefined") return new MemoryStore();
  try {
    return new IndexedDbStore();
  } catch {
    return new MemoryStore();
  }
}
