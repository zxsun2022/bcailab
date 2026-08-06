import { beforeEach, describe, expect, it } from "vitest";
import {
  applyCommand,
  canDelete,
  canPromote,
  canReorder,
  canReparent,
  nextSiblingId,
  previousSiblingId,
  resolveDropTarget,
  type Command
} from "./commands";
import { checkInvariants } from "./invariants";
import {
  createDocument,
  getNode,
  normalizeText,
  resetIdCounterForTests,
  visibleNodes,
  walk,
  type MindMapDocument,
  type NodeId
} from "./types";

/**
 * Behaviour is asserted against the specification section that requires it, so a failure points
 * at a rule rather than at an implementation detail.
 */

beforeEach(() => resetIdCounterForTests());

/** Builds `root → a(a1, a2), b` and returns the ids by name. */
function fixture() {
  let doc = createDocument("root");
  const ids: Record<string, string> = { root: doc.rootId };
  const run = (command: Command, name?: string) => {
    const result = applyCommand(doc, command);
    doc = result.doc;
    if (name) ids[name] = result.selection!;
  };
  run({ type: "CreateChild", parentId: doc.rootId, text: "a" }, "a");
  run({ type: "CreateChild", parentId: ids["a"]!, text: "a1" }, "a1");
  run({ type: "CreateSibling", anchorId: ids["a1"]!, text: "a2" }, "a2");
  run({ type: "CreateSibling", anchorId: ids["a"]!, text: "b" }, "b");
  return { doc, ids };
}

const expectValid = (doc: MindMapDocument) => expect(checkInvariants(doc)).toEqual([]);

describe("text normalization (§4.3, invariant 10)", () => {
  it("collapses newlines and tabs to spaces and trims", () => {
    expect(normalizeText("  a\nb\tc  ")).toBe("a b c");
  });

  it("strips control characters that would corrupt Markdown or SVG", () => {
    expect(normalizeText("a\u0000b\u001Fc")).toBe("abc");
  });

  it("preserves CJK and internal spaces", () => {
    expect(normalizeText("暇满难得 与 寿命无常")).toBe("暇满难得 与 寿命无常");
  });

  it("normalizes on write, so a document never holds unnormalized text", () => {
    const doc = createDocument();
    const { doc: next } = applyCommand(doc, { type: "RenameNode", nodeId: doc.rootId, text: "x\ny" });
    expect(getNode(next, next.rootId).text).toBe("x y");
    expectValid(next);
  });
});

describe("CreateSibling (§6.1)", () => {
  it("inserts immediately after the anchor, not at the end", () => {
    const { doc, ids } = fixture();
    const { doc: next, selection } = applyCommand(doc, { type: "CreateSibling", anchorId: ids["a1"]!, text: "mid" });
    expect(getNode(next, ids["a"]!).childIds).toEqual([ids["a1"], selection, ids["a2"]]);
    expectValid(next);
  });

  it("creates a first-level child when the anchor is the root, since the root has no siblings", () => {
    const { doc, ids } = fixture();
    const { doc: next, selection } = applyCommand(doc, { type: "CreateSibling", anchorId: doc.rootId, text: "c" });
    expect(getNode(next, selection!).parentId).toBe(doc.rootId);
    expect(getNode(next, doc.rootId).childIds.at(-1)).toBe(selection);
    expect(ids["root"]).toBe(doc.rootId);
    expectValid(next);
  });

  it("selects the new node", () => {
    const { doc, ids } = fixture();
    const { selection } = applyCommand(doc, { type: "CreateSibling", anchorId: ids["a"]! });
    expect(selection).not.toBe(ids["a"]);
  });
});

describe("CreateChild (§6.2)", () => {
  it("appends as the last child", () => {
    const { doc, ids } = fixture();
    const { doc: next, selection } = applyCommand(doc, { type: "CreateChild", parentId: ids["a"]!, text: "a3" });
    expect(getNode(next, ids["a"]!).childIds).toEqual([ids["a1"], ids["a2"], selection]);
    expectValid(next);
  });

  it("expands a collapsed parent, so the new node is never created invisible", () => {
    const { doc, ids } = fixture();
    const collapsed = applyCommand(doc, { type: "SetCollapsed", nodeId: ids["a"]!, collapsed: true }).doc;
    expect(getNode(collapsed, ids["a"]!).collapsed).toBe(true);

    const { doc: next, selection } = applyCommand(collapsed, { type: "CreateChild", parentId: ids["a"]! });
    expect(getNode(next, ids["a"]!).collapsed).toBe(false);
    expect(visibleNodes(next)).toContain(selection);
  });

  it("skips ids already present after restoring a document", () => {
    const { doc } = fixture();
    const existingIds = Object.keys(doc.nodes);
    resetIdCounterForTests();

    const { doc: next, selection } = applyCommand(doc, {
      type: "CreateChild",
      parentId: doc.rootId,
      text: "restored-session child"
    });

    expect(existingIds).not.toContain(selection);
    expect(Object.keys(next.nodes)).toHaveLength(existingIds.length + 1);
    expectValid(next);
  });
});

describe("DeleteSubtree (§8.1, §8.2)", () => {
  it("removes the whole subtree, not just the node", () => {
    const { doc, ids } = fixture();
    const { doc: next } = applyCommand(doc, { type: "DeleteSubtree", nodeId: ids["a"]! });
    expect(Object.keys(next.nodes).sort()).toEqual([ids["root"], ids["b"]].sort());
    expectValid(next);
  });

  it("moves selection to the next sibling first", () => {
    const { doc, ids } = fixture();
    expect(applyCommand(doc, { type: "DeleteSubtree", nodeId: ids["a1"]! }).selection).toBe(ids["a2"]);
  });

  it("falls back to the previous sibling when there is no next one", () => {
    const { doc, ids } = fixture();
    expect(applyCommand(doc, { type: "DeleteSubtree", nodeId: ids["a2"]! }).selection).toBe(ids["a1"]);
  });

  it("falls back to the parent when the node was an only child", () => {
    const { doc, ids } = fixture();
    const oneChild = applyCommand(doc, { type: "DeleteSubtree", nodeId: ids["a2"]! }).doc;
    expect(applyCommand(oneChild, { type: "DeleteSubtree", nodeId: ids["a1"]! }).selection).toBe(ids["a"]);
  });

  it("refuses to delete the root", () => {
    const { doc } = fixture();
    expect(canDelete(doc, doc.rootId)).toBe(false);
    expect(() => applyCommand(doc, { type: "DeleteSubtree", nodeId: doc.rootId })).toThrow(/root/i);
  });

  it("restores position, not merely existence, when inverted", () => {
    const { doc, ids } = fixture();
    const { doc: deleted, inverse } = applyCommand(doc, { type: "DeleteSubtree", nodeId: ids["a"]! });
    const restored = applyCommand(deleted, inverse).doc;
    expect(walk(restored)).toEqual(walk(doc));
    expect(getNode(restored, doc.rootId).childIds).toEqual(getNode(doc, doc.rootId).childIds);
    expectValid(restored);
  });
});

describe("PromoteNode (§7.1, §7.5)", () => {
  it("lands immediately after the former parent", () => {
    const { doc, ids } = fixture();
    const { doc: next } = applyCommand(doc, { type: "PromoteNode", nodeId: ids["a1"]! });
    expect(getNode(next, doc.rootId).childIds).toEqual([ids["a"], ids["a1"], ids["b"]]);
    expectValid(next);
  });

  it("carries the whole subtree with it", () => {
    const { doc, ids } = fixture();
    const withGrandchild = applyCommand(doc, { type: "CreateChild", parentId: ids["a1"]!, text: "deep" });
    const deepId = withGrandchild.selection!;
    const { doc: next } = applyCommand(withGrandchild.doc, { type: "PromoteNode", nodeId: ids["a1"]! });
    expect(getNode(next, deepId).parentId).toBe(ids["a1"]);
    expectValid(next);
  });

  it("is unavailable on the root and on first-level nodes", () => {
    const { doc, ids } = fixture();
    expect(canPromote(doc, doc.rootId)).toBe(false);
    expect(canPromote(doc, ids["a"]!)).toBe(false);
    expect(canPromote(doc, ids["a1"]!)).toBe(true);
    expect(() => applyCommand(doc, { type: "PromoteNode", nodeId: ids["a"]! })).toThrow(/first-level/i);
  });

  it("gives the promoted node a side once it reaches the first level, and only there", () => {
    const { doc, ids } = fixture();
    const { doc: next } = applyCommand(doc, { type: "PromoteNode", nodeId: ids["a1"]! });
    expect(getNode(next, ids["a1"]!).side).not.toBeNull();
    expectValid(next); // invariant 8 would fail if a deeper node kept a side
  });

  it("round-trips through its own inverse", () => {
    const { doc, ids } = fixture();
    const { doc: promoted, inverse } = applyCommand(doc, { type: "PromoteNode", nodeId: ids["a1"]! });
    const back = applyCommand(promoted, inverse).doc;
    expect(walk(back)).toEqual(walk(doc));
    expect(getNode(back, ids["a1"]!).side).toBeNull();
    expectValid(back);
  });
});

/** Builds `root → p(w, x, y, z)` — four same-level siblings, for move tests. */
function fourSiblings() {
  let doc = createDocument("root");
  const ids: Record<string, string> = { root: doc.rootId };
  const run = (command: Command, name: string) => {
    const result = applyCommand(doc, command);
    doc = result.doc;
    ids[name] = result.selection!;
  };
  run({ type: "CreateChild", parentId: doc.rootId, text: "p" }, "p");
  run({ type: "CreateChild", parentId: ids["p"]!, text: "w" }, "w");
  run({ type: "CreateSibling", anchorId: ids["w"]!, text: "x" }, "x");
  run({ type: "CreateSibling", anchorId: ids["x"]!, text: "y" }, "y");
  run({ type: "CreateSibling", anchorId: ids["y"]!, text: "z" }, "z");
  return { doc, ids };
}

const names = (doc: MindMapDocument, ids: NodeId[]) => ids.map((id) => getNode(doc, id).text);

describe("ReorderNode (§7.3)", () => {
  it("swaps with the previous or next sibling", () => {
    const { doc, ids } = fourSiblings();
    const before = applyCommand(doc, {
      type: "ReorderNode",
      nodeId: ids["y"]!,
      direction: "before-previous"
    }).doc;
    expect(names(before, getNode(before, ids["p"]!).childIds)).toEqual(["w", "y", "x", "z"]);

    const after = applyCommand(doc, {
      type: "ReorderNode",
      nodeId: ids["x"]!,
      direction: "after-next"
    }).doc;
    expect(names(after, getNode(after, ids["p"]!).childIds)).toEqual(["w", "y", "x", "z"]);
    expectValid(after);
  });

  it("lands exactly when moving forward at the end", () => {
    const { doc, ids } = fourSiblings();
    const { doc: next } = applyCommand(doc, {
      type: "ReorderNode",
      nodeId: ids["y"]!,
      direction: "after-next"
    });
    expect(names(next, getNode(next, ids["p"]!).childIds)).toEqual(["w", "x", "z", "y"]);
    expectValid(next);
  });

  it("round-trips through its inverse", () => {
    const { doc, ids } = fourSiblings();
    const moved = applyCommand(doc, {
      type: "ReorderNode",
      nodeId: ids["x"]!,
      direction: "after-next"
    });
    expect(walk(applyCommand(moved.doc, moved.inverse).doc)).toEqual(walk(doc));
  });

  it("guards the ends and exposes adjacent sibling ids", () => {
    const { doc, ids } = fourSiblings();
    expect(canReorder(doc, ids["w"]!, "before-previous")).toBe(false);
    expect(canReorder(doc, ids["z"]!, "after-next")).toBe(false);
    expect(canReorder(doc, ids["x"]!, "before-previous")).toBe(true);
    expect(previousSiblingId(doc, ids["x"]!)).toBe(ids["w"]);
    expect(nextSiblingId(doc, ids["x"]!)).toBe(ids["y"]);
  });
});

describe("ReparentNode (§7.2, accessibility.md §9)", () => {
  it("defaults to the last child and honours an explicit index", () => {
    const { doc, ids } = fixture();
    const last = applyCommand(doc, {
      type: "ReparentNode",
      nodeId: ids["b"]!,
      parentId: ids["a"]!
    }).doc;
    expect(getNode(last, ids["a"]!).childIds).toEqual([ids["a1"], ids["a2"], ids["b"]]);

    const first = applyCommand(doc, {
      type: "ReparentNode",
      nodeId: ids["b"]!,
      parentId: ids["a"]!,
      index: 0
    }).doc;
    expect(getNode(first, ids["a"]!).childIds).toEqual([ids["b"], ids["a1"], ids["a2"]]);
    expectValid(first);
  });

  it("moves within one parent without overshooting", () => {
    const { doc, ids } = fourSiblings();
    const { doc: next } = applyCommand(doc, {
      type: "ReparentNode",
      nodeId: ids["w"]!,
      parentId: ids["p"]!,
      index: 3
    });
    expect(names(next, getNode(next, ids["p"]!).childIds)).toEqual(["x", "y", "z", "w"]);
  });

  it("moves the whole subtree and normalizes first-level side state", () => {
    const { doc, ids } = fixture();
    const grandchild = applyCommand(doc, {
      type: "CreateChild",
      parentId: ids["a1"]!,
      text: "deep"
    });
    const moved = applyCommand(grandchild.doc, {
      type: "ReparentNode",
      nodeId: ids["a1"]!,
      parentId: ids["b"]!
    }).doc;
    expect(getNode(moved, grandchild.selection!).parentId).toBe(ids["a1"]);

    const promoted = applyCommand(doc, {
      type: "ReparentNode",
      nodeId: ids["a2"]!,
      parentId: doc.rootId
    }).doc;
    expect(getNode(promoted, ids["a2"]!).side).not.toBeNull();
    const demoted = applyCommand(doc, {
      type: "ReparentNode",
      nodeId: ids["b"]!,
      parentId: ids["a"]!
    }).doc;
    expect(getNode(demoted, ids["b"]!).side).toBeNull();
  });

  it("rejects self, descendant, and root moves", () => {
    const { doc, ids } = fixture();
    expect(canReparent(doc, ids["a"]!, ids["a"]!)).toBe(false);
    expect(canReparent(doc, ids["a"]!, ids["a1"]!)).toBe(false);
    expect(canReparent(doc, doc.rootId, ids["a"]!)).toBe(false);
    expect(canReparent(doc, ids["a1"]!, ids["a"]!)).toBe(true);
  });

  it("round-trips through its inverse", () => {
    const { doc, ids } = fixture();
    const moved = applyCommand(doc, {
      type: "ReparentNode",
      nodeId: ids["a1"]!,
      parentId: ids["b"]!
    });
    expect(walk(applyCommand(moved.doc, moved.inverse).doc)).toEqual(walk(doc));
  });
});

describe("resolveDropTarget (§7.2, §7.3 drag-and-drop)", () => {
  it("resolves inside and cross-parent before/after positions", () => {
    const { doc, ids } = fixture();
    expect(resolveDropTarget(doc, ids["b"]!, ids["a"]!, "inside")).toEqual({
      parentId: ids["a"],
      index: 2
    });
    expect(resolveDropTarget(doc, ids["b"]!, ids["a1"]!, "before")).toEqual({
      parentId: ids["a"],
      index: 0
    });
    expect(resolveDropTarget(doc, ids["b"]!, ids["a1"]!, "after")).toEqual({
      parentId: ids["a"],
      index: 1
    });
  });

  it("corrects same-parent indices in both directions", () => {
    const { doc, ids } = fourSiblings();
    expect(resolveDropTarget(doc, ids["w"]!, ids["z"]!, "after")).toEqual({
      parentId: ids["p"],
      index: 3
    });
    expect(resolveDropTarget(doc, ids["z"]!, ids["w"]!, "before")).toEqual({
      parentId: ids["p"],
      index: 0
    });
  });

  it("rejects invalid targets while allowing an inside-root drop", () => {
    const { doc, ids } = fixture();
    expect(resolveDropTarget(doc, ids["a"]!, ids["a"]!, "inside")).toBeNull();
    expect(resolveDropTarget(doc, ids["a"]!, ids["a1"]!, "inside")).toBeNull();
    expect(resolveDropTarget(doc, ids["a"]!, doc.rootId, "before")).toBeNull();
    expect(resolveDropTarget(doc, ids["a"]!, "missing", "inside")).toBeNull();
    expect(resolveDropTarget(doc, ids["a1"]!, doc.rootId, "inside")).toEqual({
      parentId: doc.rootId,
      index: 2
    });
  });
});

describe("SetCollapsed (§9, §7.7)", () => {
  it("hides descendants from the visible projection but keeps them in the document", () => {
    const { doc, ids } = fixture();
    const { doc: next } = applyCommand(doc, { type: "SetCollapsed", nodeId: ids["a"]!, collapsed: true });
    expect(visibleNodes(next)).not.toContain(ids["a1"]);
    expect(walk(next)).toContain(ids["a1"]);
  });

  it("preserves a descendant's own collapse state through an ancestor's collapse and expand", () => {
    const { doc, ids } = fixture();
    // a1 must have a child of its own, or §7.7 normalizes its collapse away as a leaf.
    let next = applyCommand(doc, { type: "CreateChild", parentId: ids["a1"]!, text: "deep" }).doc;
    next = applyCommand(next, { type: "SetCollapsed", nodeId: ids["a1"]!, collapsed: true }).doc;
    next = applyCommand(next, { type: "SetCollapsed", nodeId: ids["a"]!, collapsed: true }).doc;
    next = applyCommand(next, { type: "SetCollapsed", nodeId: ids["a"]!, collapsed: false }).doc;

    expect(getNode(next, ids["a1"]!).collapsed).toBe(true);
    expect(visibleNodes(next)).toContain(ids["a1"]);
  });

  it("normalizes a leaf to expanded rather than storing a meaningless collapse", () => {
    const { doc, ids } = fixture();
    const { doc: next } = applyCommand(doc, { type: "SetCollapsed", nodeId: ids["a1"]!, collapsed: true });
    expect(getNode(next, ids["a1"]!).collapsed).toBe(false);
  });

  it("never collapses the root", () => {
    const { doc } = fixture();
    const { doc: next } = applyCommand(doc, { type: "SetCollapsed", nodeId: doc.rootId, collapsed: true });
    expect(getNode(next, doc.rootId).collapsed).toBe(false);
    expectValid(next);
  });
});

describe("invariants are enforced, not assumed (§5)", () => {
  it("rejects a document whose child link is one-directional", () => {
    const doc = createDocument("root");
    const broken: MindMapDocument = {
      ...doc,
      nodes: { ...doc.nodes, [doc.rootId]: { ...getNode(doc, doc.rootId), childIds: ["ghost"] } }
    };
    const violations = checkInvariants(broken);
    expect(violations.map((v) => v.rule)).toContain(7);
  });

  it("rejects an unreachable node", () => {
    const doc = createDocument("root");
    const broken: MindMapDocument = {
      ...doc,
      nodes: { ...doc.nodes, orphan: { id: "orphan", text: "x", parentId: null, childIds: [], collapsed: false, side: null } }
    };
    expect(checkInvariants(broken).map((v) => v.rule)).toContain(1);
  });

  it("every command in this suite left a valid tree", () => {
    const { doc } = fixture();
    expectValid(doc);
  });
});

describe("ReparentNode keeps a first-level branch's side (§7.1/§11.1)", () => {
  it("preserves the stored side when reordering a first-level branch through a drag drop", () => {
    let doc = createDocument("root");
    doc = { ...doc, layout: { mode: "two-sided" } };
    doc = applyCommand(doc, { type: "CreateChild", parentId: doc.rootId, text: "a", side: "right" }).doc;
    const a = doc.nodes[doc.rootId]!.childIds[0]!;
    doc = applyCommand(doc, { type: "CreateChild", parentId: doc.rootId, text: "b", side: "right" }).doc;
    const b = doc.nodes[doc.rootId]!.childIds[1]!;

    // Drag path: a first-level branch dropped after its sibling resolves to ReparentNode.
    const { doc: next } = applyCommand(doc, {
      type: "ReparentNode",
      nodeId: a,
      parentId: doc.rootId,
      index: 1
    });
    expect(getNode(next, doc.rootId).childIds).toEqual([b, a]);
    // Regression: this used to reassign a fresh default side and flip the branch to "left".
    expect(getNode(next, a).side).toBe("right");
    expectValid(next);
  });

  it("still clears the side when a first-level branch is demoted", () => {
    let doc = createDocument("root");
    doc = { ...doc, layout: { mode: "two-sided" } };
    doc = applyCommand(doc, { type: "CreateChild", parentId: doc.rootId, text: "a", side: "left" }).doc;
    const a = doc.nodes[doc.rootId]!.childIds[0]!;
    doc = applyCommand(doc, { type: "CreateChild", parentId: doc.rootId, text: "b" }).doc;
    const b = doc.nodes[doc.rootId]!.childIds[1]!;

    const { doc: next } = applyCommand(doc, { type: "ReparentNode", nodeId: a, parentId: b });
    expect(getNode(next, a).side).toBeNull();
    expectValid(next);
  });
});

describe("SetLayoutMode (§12 — undoable document-view command)", () => {
  it("applies supplied sides when entering two-sided layout", () => {
    let doc = createDocument("root");
    doc = applyCommand(doc, { type: "CreateChild", parentId: doc.rootId, text: "a" }).doc;
    doc = applyCommand(doc, { type: "CreateChild", parentId: doc.rootId, text: "b" }).doc;
    const [a, b] = doc.nodes[doc.rootId]!.childIds;
    const { doc: next } = applyCommand(doc, {
      type: "SetLayoutMode",
      mode: "two-sided",
      sides: { [a!]: "left", [b!]: "right" }
    });
    expect(next.layout.mode).toBe("two-sided");
    expect(getNode(next, a!).side).toBe("left");
    expect(getNode(next, b!).side).toBe("right");
    expectValid(next);
  });

  it("falls back to a deterministic alternating assignment without supplied sides", () => {
    let doc = createDocument("root");
    doc = applyCommand(doc, { type: "CreateChild", parentId: doc.rootId, text: "a" }).doc;
    doc = applyCommand(doc, { type: "CreateChild", parentId: doc.rootId, text: "b" }).doc;
    doc = applyCommand(doc, { type: "CreateChild", parentId: doc.rootId, text: "c" }).doc;
    const ids = doc.nodes[doc.rootId]!.childIds;
    const { doc: next } = applyCommand(doc, { type: "SetLayoutMode", mode: "two-sided" });
    expect(ids.map((id) => getNode(next, id).side)).toEqual(["right", "left", "right"]);
    expectValid(next);
  });

  it("undo restores the previous mode and the exact previous sides", () => {
    let doc = createDocument("root");
    doc = applyCommand(doc, { type: "CreateChild", parentId: doc.rootId, text: "a" }).doc;
    const a = doc.nodes[doc.rootId]!.childIds[0]!;
    const switched = applyCommand(doc, {
      type: "SetLayoutMode",
      mode: "two-sided",
      sides: { [a]: "left" }
    });
    expect(getNode(switched.doc, a).side).toBe("left");

    const back = applyCommand(switched.doc, switched.inverse).doc;
    expect(back.layout.mode).toBe("right");
    expect(getNode(back, a).side).toBe("right");
    expectValid(back);

    const again = applyCommand(back, switched.resolved).doc;
    expect(again.layout.mode).toBe("two-sided");
    expect(getNode(again, a).side).toBe("left");
  });

  it("keeps selection untouched (selection: null)", () => {
    const { doc } = fixture();
    const { selection } = applyCommand(doc, { type: "SetLayoutMode", mode: "two-sided" });
    expect(selection).toBeNull();
  });
});

describe("presentation commands are undoable (§12, theme.md §14, theme.md §8)", () => {
  it("theme changes undo and redo", () => {
    const doc = createDocument("root");
    const changed = applyCommand(doc, { type: "SetTheme", themeId: "dark" });
    expect(changed.doc.theme.themeId).toBe("dark");
    expect(applyCommand(changed.doc, changed.inverse).doc.theme.themeId).toBe("minimal-light");
    expect(applyCommand(changed.doc, changed.resolved).doc.theme.themeId).toBe("dark");
  });

  it("branch-colour mode changes undo and redo", () => {
    const doc = createDocument("root");
    const changed = applyCommand(doc, { type: "SetBranchColorMode", mode: "by-first-level-branch" });
    expect(changed.doc.theme.branchColorMode).toBe("by-first-level-branch");
    expect(applyCommand(changed.doc, changed.inverse).doc.theme.branchColorMode).toBe("single");
  });
});
