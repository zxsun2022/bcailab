import { beforeEach, describe, expect, it } from "vitest";
import {
  canRedo,
  canUndo,
  createHistory,
  dispatch,
  dropLastEntry,
  redo,
  resetHistoryIdsForTests,
  undo
} from "./history";
import { createDocument, getNode, resetIdCounterForTests, walk } from "./types";

/**
 * The grouping rules of §8.2–§8.4 are the part worth testing: a naive stack passes none of them,
 * and every failure is the kind a user notices immediately (undo removing one character at a
 * time, or resurrecting a node they abandoned).
 */

beforeEach(() => {
  resetIdCounterForTests();
  resetHistoryIdsForTests();
});

const startedDoc = () => createDocument("root");

describe("undo and redo basics", () => {
  it("restores the previous document and selection", () => {
    const doc = startedDoc();
    let state = createHistory(doc);
    state = dispatch(state, { type: "CreateChild", parentId: doc.rootId, text: "a" });
    const created = state.selection!;

    expect(canUndo(state)).toBe(true);
    state = undo(state);
    expect(Object.keys(state.doc.nodes)).toEqual([doc.rootId]);
    expect(state.selection).toBe(doc.rootId);

    expect(canRedo(state)).toBe(true);
    state = redo(state);
    expect(state.doc.nodes[created]).toBeDefined();
    expect(state.selection).toBe(created);
  });

  it("clears the redo stack once new work happens", () => {
    const doc = startedDoc();
    let state = createHistory(doc);
    state = dispatch(state, { type: "CreateChild", parentId: doc.rootId, text: "a" });
    state = undo(state);
    expect(canRedo(state)).toBe(true);
    state = dispatch(state, { type: "CreateChild", parentId: doc.rootId, text: "b" });
    expect(canRedo(state)).toBe(false);
  });

  it("preserves an explicitly empty selection through undo", () => {
    const doc = startedDoc();
    let state = createHistory(doc, null);
    expect(state.selection).toBeNull();

    state = dispatch(state, { type: "CreateChild", parentId: doc.rootId, text: "a" });
    state = undo(state);

    expect(state.selection).toBeNull();
  });

  it("keeps the current selection when a presentation command reports selection: null", () => {
    const doc = startedDoc();
    let state = createHistory(doc);
    state = dispatch(state, { type: "CreateChild", parentId: doc.rootId, text: "a" });
    const selected = state.selection!;

    state = dispatch(state, { type: "SetLayoutMode", mode: "two-sided" });
    expect(state.selection).toBe(selected);

    state = undo(state);
    expect(state.selection).toBe(selected);
    state = redo(state);
    expect(state.selection).toBe(selected);
  });
});

describe("§8.2 — typing coalesces into one entry", () => {
  it("one undo restores the text from before the editing session, not one keystroke", () => {
    const doc = startedDoc();
    let state = createHistory(doc, doc.rootId);
    for (const text of ["r", "ro", "roo", "root!"]) {
      state = dispatch(state, { type: "RenameNode", nodeId: doc.rootId, text }, { groupId: "edit-1" });
    }
    expect(state.past).toHaveLength(1);
    expect(getNode(state.doc, doc.rootId).text).toBe("root!");

    state = undo(state);
    expect(getNode(state.doc, doc.rootId).text).toBe("root");
  });

  it("a new session starts a new entry", () => {
    const doc = startedDoc();
    let state = createHistory(doc, doc.rootId);
    state = dispatch(state, { type: "RenameNode", nodeId: doc.rootId, text: "a" }, { groupId: "s1" });
    state = dispatch(state, { type: "RenameNode", nodeId: doc.rootId, text: "b" }, { groupId: "s2" });
    expect(state.past).toHaveLength(2);
    state = undo(state);
    expect(getNode(state.doc, doc.rootId).text).toBe("a");
  });
});

describe("§8.3 — creation plus typing is one entry", () => {
  it("undo removes the node rather than only clearing its text", () => {
    const doc = startedDoc();
    let state = createHistory(doc, doc.rootId);
    state = dispatch(state, { type: "CreateChild", parentId: doc.rootId }, { groupId: "new-1" });
    const created = state.selection!;
    for (const text of ["暇", "暇满", "暇满难得"]) {
      state = dispatch(state, { type: "RenameNode", nodeId: created, text }, { groupId: "new-1" });
    }
    expect(state.past).toHaveLength(1);
    expect(getNode(state.doc, created).text).toBe("暇满难得");

    state = undo(state);
    expect(state.doc.nodes[created]).toBeUndefined();
    expect(state.selection).toBe(doc.rootId);
  });

  it("redo of a merged entry replays it whole", () => {
    const doc = startedDoc();
    let state = createHistory(doc, doc.rootId);
    state = dispatch(state, { type: "CreateChild", parentId: doc.rootId }, { groupId: "g" });
    const created = state.selection!;
    state = dispatch(state, { type: "RenameNode", nodeId: created, text: "hello" }, { groupId: "g" });

    const before = walk(state.doc);
    state = redo(undo(state));
    expect(walk(state.doc)).toEqual(before);
    expect(getNode(state.doc, created).text).toBe("hello");
  });
});

describe("§8.4 — creating an empty node and cancelling leaves no history", () => {
  it("removes the node and the entry together", () => {
    const doc = startedDoc();
    let state = createHistory(doc, doc.rootId);
    state = dispatch(state, { type: "CreateChild", parentId: doc.rootId }, { groupId: "new" });
    const created = state.selection!;

    state = dropLastEntry(state);

    expect(state.doc.nodes[created]).toBeUndefined();
    expect(state.past).toHaveLength(0);
    expect(canUndo(state)).toBe(false);
    expect(state.selection).toBe(doc.rootId);
  });

  it("does not resurrect the abandoned node on a later undo", () => {
    const doc = startedDoc();
    let state = createHistory(doc, doc.rootId);
    state = dispatch(state, { type: "CreateChild", parentId: doc.rootId, text: "kept" });
    const kept = state.selection!;

    state = dispatch(state, { type: "CreateChild", parentId: doc.rootId }, { groupId: "new" });
    const abandoned = state.selection!;
    state = dropLastEntry(state);

    state = undo(state);
    expect(state.doc.nodes[kept]).toBeUndefined();
    expect(state.doc.nodes[abandoned]).toBeUndefined();
  });
});

describe("history survives a long mixed session", () => {
  it("unwinds to the starting document exactly", () => {
    const doc = startedDoc();
    const initial = walk(doc);
    let state = createHistory(doc, doc.rootId);

    state = dispatch(state, { type: "CreateChild", parentId: doc.rootId, text: "a" });
    const a = state.selection!;
    state = dispatch(state, { type: "CreateChild", parentId: a, text: "a1" });
    const a1 = state.selection!;
    state = dispatch(state, { type: "CreateSibling", anchorId: a1, text: "a2" });
    state = dispatch(state, { type: "PromoteNode", nodeId: a1 });
    state = dispatch(state, { type: "SetCollapsed", nodeId: a, collapsed: true });
    state = dispatch(state, { type: "DeleteSubtree", nodeId: a });

    const steps = state.past.length;
    for (let i = 0; i < steps; i++) state = undo(state);

    expect(walk(state.doc)).toEqual(initial);
    expect(canUndo(state)).toBe(false);

    for (let i = 0; i < steps; i++) state = redo(state);
    expect(state.doc.nodes[a]).toBeUndefined();
  });
});
