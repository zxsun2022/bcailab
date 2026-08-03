import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyCommand } from "../model/commands";
import { createDocument, getNode, resetIdCounterForTests, type MindMapDocument } from "../model/types";
import {
  createAutosave,
  recoverDocument,
  recoveryMessage,
  resetSnapshotIdsForTests,
  saveStatusLabel,
  SNAPSHOTS_RETAINED,
  type SaveStatus
} from "./autosave";
import { checksumOf, makeSnapshot, MemoryStore } from "./store";

beforeEach(() => {
  resetIdCounterForTests();
  resetSnapshotIdsForTests();
  vi.useRealTimers();
});

function docWith(labels: string[]): MindMapDocument {
  let doc = createDocument("Root");
  for (const text of labels) {
    doc = applyCommand(doc, { type: "CreateChild", parentId: doc.rootId, text }).doc;
  }
  return doc;
}

function harness(store = new MemoryStore()) {
  const statuses: SaveStatus[] = [];
  let clock = 1_000;
  const autosave = createAutosave({
    store,
    onStatus: (s) => statuses.push(s),
    debounceMs: 5,
    now: () => (clock += 10)
  });
  return { store, statuses, autosave, last: () => statuses.at(-1)! };
}

describe("§5 — autosave", () => {
  it("reports unsaved immediately and saved once the write lands", async () => {
    const { autosave, statuses, last } = harness();
    autosave.schedule(docWith(["a"]), null);

    expect(statuses[0]).toEqual({ kind: "unsaved" });
    await autosave.flush();
    expect(last().kind).toBe("saved");
    expect(saveStatusLabel(last())).toBe("Saved on this device");
  });

  it("coalesces a burst of edits into one write (§5.2)", async () => {
    const { store, autosave } = harness();
    const doc = docWith(["a"]);
    for (let i = 0; i < 10; i++) autosave.schedule(doc, null);
    await autosave.flush();
    expect(await store.listSnapshotIds(doc.id)).toHaveLength(1);
  });

  it("stores the selection alongside the document (§5.3)", async () => {
    const { store, autosave } = harness();
    const doc = docWith(["a"]);
    const childId = getNode(doc, doc.rootId).childIds[0]!;
    autosave.schedule(doc, childId);
    await autosave.flush();

    const [id] = await store.listSnapshotIds(doc.id);
    expect((await store.getSnapshot(id!))!.selectedNodeId).toBe(childId);
  });

  it("keeps a bounded number of snapshots (§5.4)", async () => {
    const { store, autosave } = harness();
    const doc = docWith(["a"]);
    for (let i = 0; i < SNAPSHOTS_RETAINED + 4; i++) {
      autosave.schedule({ ...doc, revision: i }, null);
      await autosave.flush();
    }
    // Pruning is asynchronous by design, so let it settle before counting.
    await new Promise((r) => setTimeout(r, 20));
    expect((await store.listSnapshotIds(doc.id)).length).toBeLessThanOrEqual(SNAPSHOTS_RETAINED);
  });
});

describe("§5.4 — atomicity", () => {
  it("does not advance the index pointer when the snapshot write fails", async () => {
    const { store, autosave } = harness();
    const doc = docWith(["first"]);

    autosave.schedule(doc, null);
    await autosave.flush();
    const goodPointer = (await store.getIndexEntry(doc.id))!.lastSnapshotId;

    store.failNextWrite = "QuotaExceededError: quota reached";
    autosave.schedule({ ...doc, revision: 99 }, null);
    await autosave.flush();

    // The pointer still names the snapshot that actually exists.
    expect((await store.getIndexEntry(doc.id))!.lastSnapshotId).toBe(goodPointer);
    expect(await store.getSnapshot(goodPointer)).not.toBeNull();
  });

  it("keeps the previous snapshot readable after a failed save", async () => {
    const { store, autosave } = harness();
    const doc = docWith(["keep me"]);
    autosave.schedule(doc, null);
    await autosave.flush();

    store.failNextWrite = "disk error";
    autosave.schedule(docWith(["lost"]), null);
    await autosave.flush();

    const outcome = await recoverDocument(store, doc.id);
    expect(outcome.kind).toBe("restored");
    if (outcome.kind === "restored") {
      expect(Object.values(outcome.snapshot.document.nodes).map((n) => n.text)).toContain("keep me");
    }
  });
});

describe("§8 — storage failure is visible and actionable", () => {
  it("names the export as the remedy on a quota error", async () => {
    const { store, autosave, last } = harness();
    store.failNextWrite = "QuotaExceededError";
    autosave.schedule(docWith(["a"]), null);
    await autosave.flush();

    expect(last().kind).toBe("failed");
    expect(saveStatusLabel(last())).toMatch(/Storage is full/);
    expect(saveStatusLabel(last())).toMatch(/Export a Markdown copy/);
  });

  it("reports a generic failure without blaming quota", async () => {
    const { store, autosave, last } = harness();
    store.failNextWrite = "InvalidStateError";
    autosave.schedule(docWith(["a"]), null);
    await autosave.flush();
    expect(saveStatusLabel(last())).toMatch(/could not be saved in the browser/);
  });

  it("recovers on the next edit rather than staying stuck", async () => {
    const { store, autosave, last } = harness();
    store.failNextWrite = "transient";
    autosave.schedule(docWith(["a"]), null);
    await autosave.flush();
    expect(last().kind).toBe("failed");

    autosave.schedule(docWith(["b"]), null);
    await autosave.flush();
    expect(last().kind).toBe("saved");
  });
});

describe("§6 — recovery validates before it activates", () => {
  it("restores the newest snapshot when it is intact", async () => {
    const { store, autosave } = harness();
    const doc = docWith(["one"]);
    autosave.schedule(doc, null);
    await autosave.flush();

    const outcome = await recoverDocument(store, doc.id);
    expect(outcome.kind).toBe("restored");
    expect(recoveryMessage(outcome)).toBeNull();
  });

  it("falls back to an earlier snapshot when the newest fails its checksum", async () => {
    const { store, autosave } = harness();
    const doc = docWith(["good"]);
    autosave.schedule(doc, null);
    await autosave.flush();

    const newer = { ...doc, revision: 2 };
    autosave.schedule(newer, null);
    await autosave.flush();

    const ids = await store.listSnapshotIds(doc.id);
    // A torn write: bytes changed, checksum did not follow.
    store.corrupt(ids.at(-1)!, (snapshot) => {
      snapshot.document.nodes[snapshot.document.rootId]!.text = "tampered";
    });

    const outcome = await recoverDocument(store, doc.id);
    expect(outcome.kind).toBe("restored-earlier");
    if (outcome.kind === "restored-earlier") {
      expect(getNode(outcome.snapshot.document, outcome.snapshot.document.rootId).text).toBe("Root");
      expect(recoveryMessage(outcome)).toMatch(/earlier recovery point/);
    }
  });

  it("rejects a snapshot whose tree violates an invariant, even with a matching checksum", async () => {
    const store = new MemoryStore();
    const doc = docWith(["a"]);
    const broken: MindMapDocument = {
      ...doc,
      nodes: {
        ...doc.nodes,
        [doc.rootId]: { ...getNode(doc, doc.rootId), childIds: ["does-not-exist"] }
      }
    };
    // Checksum computed over the broken document, so only the invariant check can catch it.
    const snapshot = makeSnapshot(broken, null, "s-broken", 1);
    expect(snapshot.checksum).toBe(checksumOf(broken));
    await store.putSnapshot(snapshot);

    const outcome = await recoverDocument(store, doc.id);
    expect(outcome.kind).toBe("unrecoverable");
    expect(recoveryMessage(outcome)).toMatch(/nothing stored was deleted/);
  });

  it("reports nothing stored for a document that was never saved", async () => {
    expect((await recoverDocument(new MemoryStore(), "never-saved")).kind).toBe("nothing-stored");
  });
});

describe("round trip through storage", () => {
  it("returns a document that is byte-identical and still valid", async () => {
    const { store, autosave } = harness();
    let doc = docWith(["暇满难得", "寿命无常"]);
    const branch = getNode(doc, doc.rootId).childIds[1]!;
    doc = applyCommand(doc, { type: "CreateChild", parentId: branch, text: "思维死缘无定" }).doc;
    doc = applyCommand(doc, { type: "SetCollapsed", nodeId: branch, collapsed: true }).doc;

    autosave.schedule(doc, branch);
    await autosave.flush();

    const outcome = await recoverDocument(store, doc.id);
    expect(outcome.kind).toBe("restored");
    if (outcome.kind !== "restored") return;

    expect(outcome.snapshot.document).toEqual(doc);
    // Collapse state is view state but is part of the *local* snapshot (§5.3), unlike Markdown.
    expect(getNode(outcome.snapshot.document, branch).collapsed).toBe(true);
    expect(outcome.snapshot.selectedNodeId).toBe(branch);
  });
});
