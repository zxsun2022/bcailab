import { describe, expect, it } from "vitest";
import { checkInvariants } from "../model/invariants";
import type { MindMapDocument, MindMapNode } from "../model/types";
import {
  documentFromPublishedView,
  parsePublishedView,
  PUBLISHED_VIEW_FORMAT,
  toPublishedView
} from "./published-view";

const node = (
  id: string,
  text: string,
  parentId: string | null,
  childIds: string[],
  side: "left" | "right" | null = null,
  collapsed = false
): MindMapNode => ({ id, text, parentId, childIds, collapsed, side });

const document: MindMapDocument = {
  schemaVersion: 1,
  id: "doc-1",
  title: "Publishing",
  rootId: "root",
  nodes: {
    root: node("root", "Publishing", null, ["a", "b"]),
    a: node("a", "Right branch", "root", ["a1"], "right"),
    a1: node("a1", "Leaf", "a", []),
    b: node("b", "Left branch", "root", [], "left", true)
  },
  layout: { mode: "two-sided" },
  theme: { shapeId: "minimal-light", paletteId: "ember", branchColorMode: "by-first-level-branch" },
  revision: 7
};

describe("published view round trip", () => {
  it("preserves exactly what Markdown loses — branch sides and collapse state", () => {
    const view = toPublishedView(document);
    expect(view.nodes.a!.side).toBe("right");
    expect(view.nodes.b!.side).toBe("left");
    expect(view.nodes.b!.collapsed).toBe(true);

    const rebuilt = documentFromPublishedView(view, "viewer");
    expect(rebuilt.nodes).toEqual(document.nodes);
    expect(rebuilt.layout).toEqual(document.layout);
    expect(rebuilt.theme).toEqual(document.theme);
    expect(rebuilt.title).toBe(document.title);
    expect(checkInvariants(rebuilt)).toEqual([]);
  });

  it("carries no private identity across the boundary", () => {
    const view = toPublishedView(document) as unknown as Record<string, unknown>;
    expect(view.id).toBeUndefined();
    expect(view.revision).toBeUndefined();
    expect(view.selectedNodeId).toBeUndefined();
    // The reader supplies the id, so a published map can never collide with a local document.
    expect(documentFromPublishedView(toPublishedView(document), "chosen").id).toBe("chosen");
    expect(documentFromPublishedView(toPublishedView(document), "chosen").revision).toBe(0);
  });

  it("survives a JSON trip, which is how it actually travels", () => {
    const parsed = parsePublishedView(JSON.parse(JSON.stringify(toPublishedView(document))));
    expect(parsed).toEqual(toPublishedView(document));
  });

  it("does not share the array instances it was built from", () => {
    const view = toPublishedView(document);
    view.nodes.root!.childIds.push("injected");
    expect(document.nodes.root!.childIds).toEqual(["a", "b"]);
  });
});

describe("published view parsing", () => {
  const valid = () => JSON.parse(JSON.stringify(toPublishedView(document))) as Record<string, unknown>;

  it("refuses a version it was not written for, so an old viewer falls back instead of guessing", () => {
    expect(parsePublishedView({ ...valid(), formatVersion: PUBLISHED_VIEW_FORMAT + 1 })).toBeNull();
    expect(parsePublishedView({ ...valid(), formatVersion: "1" })).toBeNull();
    expect(parsePublishedView({ ...valid(), formatVersion: undefined })).toBeNull();
  });

  it("refuses payloads that are not a view at all", () => {
    expect(parsePublishedView(null)).toBeNull();
    expect(parsePublishedView("not a view")).toBeNull();
    expect(parsePublishedView([])).toBeNull();
    expect(parsePublishedView({})).toBeNull();
  });

  it("refuses a root that is missing or is not a root", () => {
    expect(parsePublishedView({ ...valid(), rootId: "nope" })).toBeNull();
    const orphanedRoot = valid();
    (orphanedRoot.nodes as Record<string, MindMapNode>).root!.parentId = "a";
    expect(parsePublishedView(orphanedRoot)).toBeNull();
  });

  it("refuses a node whose key and id disagree", () => {
    const mismatched = valid();
    (mismatched.nodes as Record<string, MindMapNode>).a!.id = "b";
    expect(parsePublishedView(mismatched)).toBeNull();
  });

  it("refuses invalid field types rather than coercing them", () => {
    const badSide = valid();
    (badSide.nodes as Record<string, Record<string, unknown>>).a!.side = "up";
    expect(parsePublishedView(badSide)).toBeNull();

    const badCollapse = valid();
    (badCollapse.nodes as Record<string, Record<string, unknown>>).a!.collapsed = "yes";
    expect(parsePublishedView(badCollapse)).toBeNull();

    const badChildren = valid();
    (badChildren.nodes as Record<string, Record<string, unknown>>).a!.childIds = [1];
    expect(parsePublishedView(badChildren)).toBeNull();

    expect(parsePublishedView({ ...valid(), layout: { mode: "radial" } })).toBeNull();
    expect(parsePublishedView({ ...valid(), theme: { shapeId: "x", paletteId: "y", branchColorMode: "rainbow" } })).toBeNull();
  });

  it("keeps node text verbatim, including text that looks like markup", () => {
    const hostile = valid();
    (hostile.nodes as Record<string, Record<string, unknown>>).a!.text = "<script>alert(1)</script>";
    const parsed = parsePublishedView(hostile);
    // Escaping is the renderer's job and it does it structurally, by never producing markup from
    // node text. The format must not silently rewrite what the author published.
    expect(parsed?.nodes.a!.text).toBe("<script>alert(1)</script>");
  });
});
