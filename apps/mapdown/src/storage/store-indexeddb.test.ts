import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { IDBKeyRange, indexedDB } from "fake-indexeddb";
import { createDocument } from "../model/types";
import {
  IndexedDbStore,
  makeSnapshot,
  type DocumentIndexEntry
} from "./store";

const DB_NAME = "mapdown";

function deleteDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("IndexedDB deletion was blocked"));
  });
}

describe("IndexedDbStore production backend", () => {
  let store: IndexedDbStore;

  beforeEach(async () => {
    Object.assign(globalThis, { indexedDB, IDBKeyRange });
    await deleteDatabase();
    store = new IndexedDbStore();
  });

  afterEach(async () => {
    await store.close();
    await deleteDatabase();
  });

  it("persists snapshot and index records through separate transactions", async () => {
    const document = createDocument("Root");
    const snapshot = makeSnapshot(document, document.rootId, "snapshot-1", 100);
    const entry: DocumentIndexEntry = {
      id: document.id,
      title: document.title,
      createdAt: 100,
      updatedAt: 100,
      nodeCount: 1,
      lastSnapshotId: snapshot.id
    };

    await store.putSnapshot(snapshot);
    await store.putIndexEntry(entry);

    expect(await store.getSnapshot(snapshot.id)).toEqual(snapshot);
    expect(await store.getIndexEntry(document.id)).toEqual(entry);
    expect(await store.listIndexEntries()).toEqual([entry]);
  });

  it("uses the documentId index and returns snapshots oldest first", async () => {
    const firstDocument = createDocument("First");
    const secondDocument = createDocument("Second");
    await store.putSnapshot(makeSnapshot(firstDocument, null, "later", 200));
    await store.putSnapshot(makeSnapshot(firstDocument, null, "earlier", 100));
    await store.putSnapshot(makeSnapshot(secondDocument, null, "other-document", 50));

    expect(await store.listSnapshotIds(firstDocument.id)).toEqual(["earlier", "later"]);
  });

  it("deletes only the requested snapshot", async () => {
    const document = createDocument("Root");
    await store.putSnapshot(makeSnapshot(document, null, "keep", 100));
    await store.putSnapshot(makeSnapshot(document, null, "delete", 200));

    await store.deleteSnapshot("delete");

    expect(await store.getSnapshot("delete")).toBeNull();
    expect(await store.getSnapshot("keep")).not.toBeNull();
  });
});
