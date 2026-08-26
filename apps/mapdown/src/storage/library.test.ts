import { beforeEach, describe, expect, it } from "vitest";
import { applyCommand } from "../model/commands";
import { createDocument, resetIdCounterForTests } from "../model/types";
import {
  deleteLocalDocument,
  duplicateLocalDocument,
  listLocalDocuments,
  linkLocalDocumentToCloud,
  normalizeDocumentTitle,
  refreshLocalDocumentCloudMetadata,
  renameLocalDocument,
  restoreLocalDocument,
  storeLocalDocument
} from "./library";
import { checksumOf, makeSnapshot, MemoryStore } from "./store";

beforeEach(() => resetIdCounterForTests());

function namedDocument(title: string) {
  return { ...createDocument(title), title };
}

describe("local document library", () => {
  it("lists every indexed document newest first with deterministic tie-breaking", async () => {
    const store = new MemoryStore();
    const alpha = namedDocument("Alpha");
    const beta = namedDocument("Beta");
    const gamma = namedDocument("Gamma");
    await storeLocalDocument(store, alpha, null, { now: 100, snapshotId: "alpha" });
    await storeLocalDocument(store, beta, null, { now: 300, snapshotId: "beta" });
    await storeLocalDocument(store, gamma, null, { now: 300, snapshotId: "gamma" });

    expect((await listLocalDocuments(store)).map((entry) => entry.title)).toEqual([
      "Beta",
      "Gamma",
      "Alpha"
    ]);
  });

  it("renames the index and every recovery snapshot together", async () => {
    const store = new MemoryStore();
    const document = namedDocument("Original");
    const stored = await storeLocalDocument(store, document, document.rootId, {
      now: 100,
      snapshotId: "first"
    });
    const laterDocument = { ...document, revision: 1 };
    const laterSnapshot = makeSnapshot(laterDocument, document.rootId, "second", 200);
    await store.putDocumentBundle({
      entry: { ...stored.entry, updatedAt: 200, lastSnapshotId: laterSnapshot.id },
      snapshots: [...stored.snapshots, laterSnapshot]
    });

    const renamed = await renameLocalDocument(store, document.id, "  Research   notes  ", 400);

    // The root label is the map's name (D-18), so rename rewrites the root, not `title`.
    expect(renamed.entry).toMatchObject({ rootLabel: "Research notes", updatedAt: 400 });
    expect(renamed.snapshots.map((snapshot) => snapshot.document.nodes[document.rootId]!.text))
      .toEqual(["Research notes", "Research notes"]);
    expect(await store.getDocumentBundle(document.id)).toEqual(renamed);
  });

  it("leaves `title` alone, because the spec forbids forcing it to equal the root", async () => {
    const store = new MemoryStore();
    const document = namedDocument("Original");
    await storeLocalDocument(store, document, document.rootId, { now: 100, snapshotId: "first" });

    const renamed = await renameLocalDocument(store, document.id, "Research notes", 400);

    // `storage-export.md` §10.3: the root text is not automatically forced to equal the
    // filename/title. `title` keeps its own job as import provenance.
    expect(renamed.entry.title).toBe(document.title);
    expect(renamed.snapshots.every((snapshot) => snapshot.document.title === document.title))
      .toBe(true);
  });

  it("re-stamps the checksum, so a renamed snapshot is not read back as a torn write", async () => {
    const store = new MemoryStore();
    const document = namedDocument("Original");
    await storeLocalDocument(store, document, document.rootId, { now: 100, snapshotId: "first" });

    const renamed = await renameLocalDocument(store, document.id, "Research notes", 400);

    // §5.3 — the checksum covers node text; leaving it stale would make recovery reject the
    // very snapshot the rename just wrote.
    for (const snapshot of renamed.snapshots) {
      expect(snapshot.checksum).toBe(checksumOf(snapshot.document));
    }
  });

  it("duplicates the current snapshot under a new document id and collision-free title", async () => {
    const store = new MemoryStore();
    let document = namedDocument("Plan");
    document = applyCommand(document, {
      type: "CreateChild",
      parentId: document.rootId,
      text: "Milestone"
    }).doc;
    await storeLocalDocument(store, document, document.rootId, {
      now: 100,
      snapshotId: "source",
      sourceFilename: "plan.md"
    });

    const first = await duplicateLocalDocument(store, document.id, {
      now: 200,
      documentId: "doc-copy-1",
      snapshotId: "copy-1"
    });
    const second = await duplicateLocalDocument(store, document.id, {
      now: 300,
      documentId: "doc-copy-2",
      snapshotId: "copy-2"
    });

    // The copy suffix lands on the root label, because that is the name the library shows
    // (D-18). Suffixing `title` alone would leave both rows reading identically.
    expect(first.entry).toMatchObject({
      id: "doc-copy-1",
      rootLabel: "Plan copy",
      sourceFilename: "plan.md",
      nodeCount: 2
    });
    expect(second.entry.rootLabel).toBe("Plan copy 2");
    expect(first.snapshots[0]!.document.nodes[document.rootId]!.text).toBe("Plan copy");

    // `title` is provenance and is inherited unchanged (§10.3), and nothing but the root moves.
    expect(first.entry.title).toBe(document.title);
    const withoutRoot = (nodes: Record<string, unknown>) =>
      Object.fromEntries(Object.entries(nodes).filter(([id]) => id !== document.rootId));
    expect(withoutRoot(first.snapshots[0]!.document.nodes)).toEqual(withoutRoot(document.nodes));
    expect(first.snapshots[0]!.document.id).toBe("doc-copy-1");
  });

  it("refreshes a conflicted cloud version without claiming pending local work was saved", async () => {
    const store = new MemoryStore();
    const document = namedDocument("Plan");
    const stored = await storeLocalDocument(store, document, document.rootId, {
      now: 100,
      snapshotId: "saved-online"
    });
    const originalCloud = {
      id: "cloud-1",
      clientDocumentId: document.id,
      title: document.title,
      nodeCount: 1,
      version: 1,
      createdAt: 100,
      updatedAt: 100,
      publication: null
    };
    await linkLocalDocumentToCloud(store, document.id, originalCloud, stored.entry.lastSnapshotId);

    const edited = { ...document, revision: 1, title: "Plan locally edited" };
    const linked = await store.getDocumentBundle(document.id);
    const pendingSnapshot = makeSnapshot(edited, document.rootId, "pending-local", 200);
    await store.putDocumentBundle({
      entry: {
        ...linked!.entry,
        title: edited.title,
        updatedAt: 200,
        lastSnapshotId: pendingSnapshot.id
      },
      snapshots: [...linked!.snapshots, pendingSnapshot]
    });
    const refreshed = await refreshLocalDocumentCloudMetadata(store, document.id, {
      ...originalCloud,
      title: "Plan edited elsewhere",
      version: 2,
      updatedAt: 300
    });

    expect(refreshed).toMatchObject({
      cloudDocumentId: "cloud-1",
      cloudVersion: 2,
      lastSnapshotId: "pending-local",
      cloudUpdatedAt: 300
    });
    expect(refreshed.cloudSavedSnapshotId).toBeUndefined();
  });

  it("deletes every snapshot and restores the complete document for current-tab undo", async () => {
    const store = new MemoryStore();
    const document = namedDocument("Delete me");
    const stored = await storeLocalDocument(store, document, null, {
      now: 100,
      snapshotId: "first"
    });
    const later = makeSnapshot({ ...document, revision: 1 }, document.rootId, "second", 200);
    await store.putDocumentBundle({
      entry: { ...stored.entry, lastSnapshotId: later.id, updatedAt: 200 },
      snapshots: [...stored.snapshots, later]
    });

    const deleted = await deleteLocalDocument(store, document.id);
    expect(await store.getIndexEntry(document.id)).toBeNull();
    expect(await store.listSnapshotIds(document.id)).toEqual([]);

    await restoreLocalDocument(store, deleted);
    expect((await store.getDocumentBundle(document.id))?.snapshots.map((item) => item.id)).toEqual([
      "first",
      "second"
    ]);
  });

  it("rejects blank and overlong titles before touching storage", () => {
    expect(() => normalizeDocumentTitle("   ")).toThrow("Enter a title");
    expect(() => normalizeDocumentTitle("x".repeat(121))).toThrow("120 characters");
  });

  it("does not create a partial index entry when a document write fails", async () => {
    const store = new MemoryStore();
    const document = namedDocument("Unsaved");
    store.failNextWrite = "QuotaExceededError";

    await expect(
      storeLocalDocument(store, document, null, { now: 100, snapshotId: "failed" })
    ).rejects.toThrow("QuotaExceededError");
    expect(await store.listIndexEntries()).toEqual([]);
    expect(await store.listSnapshotIds(document.id)).toEqual([]);
  });
});
