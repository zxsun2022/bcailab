import { beforeEach, describe, expect, it } from "vitest";
import { applyCommand } from "../model/commands";
import { createDocument, resetIdCounterForTests } from "../model/types";
import {
  deleteLocalDocument,
  duplicateLocalDocument,
  listLocalDocuments,
  normalizeDocumentTitle,
  renameLocalDocument,
  restoreLocalDocument,
  storeLocalDocument
} from "./library";
import { makeSnapshot, MemoryStore } from "./store";

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

    expect(renamed.entry).toMatchObject({ title: "Research notes", updatedAt: 400 });
    expect(renamed.snapshots.map((snapshot) => snapshot.document.title)).toEqual([
      "Research notes",
      "Research notes"
    ]);
    expect(await store.getDocumentBundle(document.id)).toEqual(renamed);
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

    expect(first.entry).toMatchObject({
      id: "doc-copy-1",
      title: "Plan copy",
      sourceFilename: "plan.md",
      nodeCount: 2
    });
    expect(second.entry.title).toBe("Plan copy 2");
    expect(first.snapshots[0]!.document.nodes).toEqual(document.nodes);
    expect(first.snapshots[0]!.document.id).toBe("doc-copy-1");
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
