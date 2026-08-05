import { beforeEach, describe, expect, it } from "vitest";
import { applyCommand } from "../model/commands";
import { createDocument, getNode, resetIdCounterForTests, type MindMapDocument } from "../model/types";
import { layout } from "../layout/layout";
import { navigateFrom, resolveKey, type KeyEvent } from "./keymap";

beforeEach(() => resetIdCounterForTests());

const key = (k: string, mods: Partial<KeyEvent> = {}): KeyEvent => ({
  key: k,
  shiftKey: false,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  ...mods
});

/** root → a(a1, a2), b */
function fixture() {
  let doc = createDocument("root");
  const ids: Record<string, string> = { root: doc.rootId };
  const run = (command: Parameters<typeof applyCommand>[1], name: string) => {
    const result = applyCommand(doc, command);
    doc = result.doc;
    ids[name] = result.selection;
  };
  run({ type: "CreateChild", parentId: doc.rootId, text: "a" }, "a");
  run({ type: "CreateChild", parentId: ids["a"]!, text: "a1" }, "a1");
  run({ type: "CreateSibling", anchorId: ids["a1"]!, text: "a2" }, "a2");
  run({ type: "CreateSibling", anchorId: ids["a"]!, text: "b" }, "b");
  return { doc, ids };
}

describe("node mode (§6, §7, §8)", () => {
  it("maps Enter to a sibling and Tab to a child", () => {
    const { doc, ids } = fixture();
    expect(resolveKey(doc, ids["a1"]!, "node-selected", key("Enter"))).toEqual({ type: "create-sibling" });
    expect(resolveKey(doc, ids["a1"]!, "node-selected", key("Tab"))).toEqual({ type: "create-child" });
  });

  it("maps Shift+Tab to promote, and to nothing where promotion is illegal (§7.1)", () => {
    const { doc, ids } = fixture();
    expect(resolveKey(doc, ids["a1"]!, "node-selected", key("Tab", { shiftKey: true }))).toEqual({
      type: "promote"
    });
    // First-level and root have nowhere to go.
    expect(resolveKey(doc, ids["a"]!, "node-selected", key("Tab", { shiftKey: true }))).toEqual({
      type: "none"
    });
    expect(resolveKey(doc, doc.rootId, "node-selected", key("Tab", { shiftKey: true }))).toEqual({
      type: "none"
    });
  });

  it("deletes on Delete and Backspace, but never the root (§8.2)", () => {
    const { doc, ids } = fixture();
    expect(resolveKey(doc, ids["a"]!, "node-selected", key("Delete"))).toEqual({ type: "delete" });
    expect(resolveKey(doc, ids["a"]!, "node-selected", key("Backspace"))).toEqual({ type: "delete" });
    expect(resolveKey(doc, doc.rootId, "node-selected", key("Backspace"))).toEqual({ type: "none" });
  });

  it("starts editing on a printable key and replaces the text (§5.4)", () => {
    const { doc, ids } = fixture();
    expect(resolveKey(doc, ids["a"]!, "node-selected", key("x"))).toEqual({
      type: "begin-edit",
      selectAll: true
    });
    expect(resolveKey(doc, ids["a"]!, "node-selected", key("暇"))).toEqual({
      type: "begin-edit",
      selectAll: true
    });
    expect(resolveKey(doc, ids["a"]!, "node-selected", key("F2"))).toEqual({
      type: "begin-edit",
      selectAll: true
    });
  });

  it("does not start editing on a shortcut that merely contains a letter", () => {
    const { doc, ids } = fixture();
    expect(resolveKey(doc, ids["a"]!, "node-selected", key("s", { metaKey: true }))).toEqual({
      type: "none"
    });
  });

  it("clears the current selection on Escape", () => {
    const { doc, ids } = fixture();
    expect(resolveKey(doc, ids["a"]!, "node-selected", key("Escape"))).toEqual({
      type: "clear-selection"
    });
  });
});

describe("editing mode (§5.3, §8.3)", () => {
  it("maps Enter to commit-only instead of the selected-mode sibling action", () => {
    const { doc, ids } = fixture();
    expect(resolveKey(doc, ids["a"]!, "node-editing", key("Enter"))).toEqual({ type: "commit-edit" });
    expect(resolveKey(doc, ids["a"]!, "node-selected", key("Enter"))).toEqual({ type: "create-sibling" });
  });

  it("creates a child on Tab without leaving text behind", () => {
    const { doc, ids } = fixture();
    expect(resolveKey(doc, ids["a"]!, "node-editing", key("Tab"))).toEqual({ type: "create-child" });
  });

  it("treats Backspace and Delete as text keys — they must never delete the node", () => {
    const { doc, ids } = fixture();
    expect(resolveKey(doc, ids["a"]!, "node-editing", key("Backspace"))).toEqual({ type: "none" });
    expect(resolveKey(doc, ids["a"]!, "node-editing", key("Delete"))).toEqual({ type: "none" });
  });

  it("does not navigate while editing — arrows belong to the caret", () => {
    const { doc, ids } = fixture();
    for (const k of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]) {
      expect(resolveKey(doc, ids["a"]!, "node-editing", key(k))).toEqual({ type: "none" });
    }
  });

  it("cancels on Escape", () => {
    const { doc, ids } = fixture();
    expect(resolveKey(doc, ids["a"]!, "node-editing", key("Escape"))).toEqual({ type: "cancel-edit" });
  });
});

describe("undo and redo", () => {
  it("accepts both platform conventions", () => {
    const { doc, ids } = fixture();
    expect(resolveKey(doc, ids["a"]!, "node-selected", key("z", { metaKey: true }))).toEqual({ type: "undo" });
    expect(resolveKey(doc, ids["a"]!, "node-selected", key("z", { ctrlKey: true }))).toEqual({ type: "undo" });
    expect(
      resolveKey(doc, ids["a"]!, "node-selected", key("z", { metaKey: true, shiftKey: true }))
    ).toEqual({ type: "redo" });
    expect(resolveKey(doc, ids["a"]!, "node-selected", key("y", { ctrlKey: true }))).toEqual({ type: "redo" });
  });

  it("works while editing too, so a mistake mid-label is recoverable", () => {
    const { doc, ids } = fixture();
    expect(resolveKey(doc, ids["a"]!, "node-editing", key("z", { metaKey: true }))).toEqual({ type: "undo" });
  });
});

describe("Alt+Arrow sibling reordering (§7.3, keyboard.md §14)", () => {
  it("maps Alt+ArrowUp to before-previous and Alt+ArrowDown to after-next", () => {
    const { doc, ids } = fixture();
    expect(resolveKey(doc, ids["a2"]!, "node-selected", key("ArrowUp", { altKey: true }))).toEqual({
      type: "reorder",
      direction: "before-previous"
    });
    expect(resolveKey(doc, ids["a1"]!, "node-selected", key("ArrowDown", { altKey: true }))).toEqual({
      type: "reorder",
      direction: "after-next"
    });
  });

  it("resolves to nothing at the ends of the sibling list, rather than throwing", () => {
    const { doc, ids } = fixture();
    expect(resolveKey(doc, ids["a1"]!, "node-selected", key("ArrowUp", { altKey: true }))).toEqual({
      type: "none"
    });
    expect(resolveKey(doc, ids["a2"]!, "node-selected", key("ArrowDown", { altKey: true }))).toEqual({
      type: "none"
    });
  });

  it("does not shadow plain ArrowUp/ArrowDown navigation", () => {
    const { doc, ids } = fixture();
    expect(resolveKey(doc, ids["a1"]!, "node-selected", key("ArrowDown"))).toEqual({
      type: "navigate",
      to: ids["a2"]
    });
  });

  it("is inert in editing mode — Alt+Arrow is left to the browser/IME there", () => {
    const { doc, ids } = fixture();
    expect(resolveKey(doc, ids["a1"]!, "node-editing", key("ArrowUp", { altKey: true }))).toEqual({
      type: "none"
    });
  });
});

describe("navigation over the visible projection (§10)", () => {
  it("returns directly to the root on Home", () => {
    const { doc, ids } = fixture();
    expect(resolveKey(doc, ids["a1"]!, "node-selected", key("Home"))).toEqual({
      type: "navigate",
      to: doc.rootId
    });
  });

  it("moves into children on ArrowRight and to the parent on ArrowLeft", () => {
    const { doc, ids } = fixture();
    expect(navigateFrom(doc, ids["a"]!, "ArrowRight")).toBe(ids["a1"]);
    expect(navigateFrom(doc, ids["a1"]!, "ArrowLeft")).toBe(ids["a"]);
  });

  it("mirrors inward/outward arrows on the left and chooses a side from the root", () => {
    const { doc, ids } = fixture();
    const twoSided = {
      ...doc,
      layout: { mode: "two-sided" as const }
    };
    const withLeft = applyCommand(twoSided, {
      type: "MoveFirstLevelBranchSide",
      nodeId: ids["a"]!,
      side: "left"
    }).doc;

    expect(navigateFrom(withLeft, ids["a"]!, "ArrowLeft")).toBe(ids["a1"]);
    expect(navigateFrom(withLeft, ids["a1"]!, "ArrowRight")).toBe(ids["a"]);
    expect(navigateFrom(withLeft, withLeft.rootId, "ArrowLeft", layout(withLeft))).toBe(ids["a"]);
    expect(navigateFrom(withLeft, withLeft.rootId, "ArrowRight", layout(withLeft))).toBe(ids["b"]);
  });

  it("uses layout geometry for visual up/down navigation", () => {
    const { doc, ids } = fixture();
    const geometry = layout(doc);
    const below = navigateFrom(doc, ids["a1"]!, "ArrowDown", geometry);
    expect(below).not.toBeNull();
    const from = geometry.boxes[ids["a1"]!]!;
    const to = geometry.boxes[below!]!;
    expect(to.y + to.height / 2).toBeGreaterThan(from.y + from.height / 2);
  });

  it("moves between siblings on ArrowDown and ArrowUp", () => {
    const { doc, ids } = fixture();
    expect(navigateFrom(doc, ids["a1"]!, "ArrowDown")).toBe(ids["a2"]);
    expect(navigateFrom(doc, ids["a2"]!, "ArrowUp")).toBe(ids["a1"]);
  });

  it("stops at the ends rather than wrapping", () => {
    const { doc, ids } = fixture();
    expect(navigateFrom(doc, ids["a1"]!, "ArrowUp")).toBeNull();
    expect(navigateFrom(doc, ids["a2"]!, "ArrowDown")).toBeNull();
    expect(navigateFrom(doc, doc.rootId, "ArrowLeft")).toBeNull();
  });

  it("never expands a collapsed branch as a side effect of navigating (§10)", () => {
    const { doc, ids } = fixture();
    const collapsed = applyCommand(doc, { type: "SetCollapsed", nodeId: ids["a"]!, collapsed: true }).doc;
    expect(navigateFrom(collapsed, ids["a"]!, "ArrowRight")).toBeNull();
    expect(getNode(collapsed, ids["a"]!).collapsed).toBe(true);
  });

  it("skips nodes hidden by a collapsed ancestor", () => {
    const { doc, ids } = fixture();
    const collapsed: MindMapDocument = applyCommand(doc, {
      type: "SetCollapsed",
      nodeId: ids["a"]!,
      collapsed: true
    }).doc;
    // a1 is hidden, so sibling navigation from it finds nothing visible to move to.
    expect(navigateFrom(collapsed, ids["a1"]!, "ArrowDown")).toBeNull();
  });

  it("toggles collapse on Space", () => {
    const { doc, ids } = fixture();
    expect(resolveKey(doc, ids["a"]!, "node-selected", key(" "))).toEqual({ type: "toggle-collapse" });
  });
});

describe("editing mode honours Shift+Tab (regression)", () => {
  it("promotes rather than creating a child, matching node mode", () => {
    const { doc, ids } = fixture();
    expect(resolveKey(doc, ids["a1"]!, "node-editing", key("Tab", { shiftKey: true }))).toEqual({
      type: "promote"
    });
  });

  it("still refuses to promote where node mode would", () => {
    const { doc, ids } = fixture();
    expect(resolveKey(doc, ids["a"]!, "node-editing", key("Tab", { shiftKey: true }))).toEqual({
      type: "none"
    });
  });
});
