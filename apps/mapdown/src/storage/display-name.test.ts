import { describe, expect, it } from "vitest";
import type { MindMapDocument, MindMapNode } from "../model/types";
import type { DocumentIndexEntry } from "./store";
import {
  displayNameFromParts,
  documentDisplayName,
  entryDisplayName,
  rootLabelOf,
  UNNAMED_MAP
} from "./display-name";

const root = (text: string): MindMapNode => ({
  id: "n1",
  text,
  parentId: null,
  childIds: [],
  collapsed: false,
  side: null
});

const documentWith = (rootText: string, title: string): MindMapDocument => ({
  schemaVersion: 1,
  id: "doc-1",
  title,
  rootId: "n1",
  nodes: { n1: root(rootText) },
  layout: { mode: "right" },
  theme: { shapeId: "minimal-light", paletteId: "slate", branchColorMode: "single" },
  revision: 0
});

const entryWith = (fields: Partial<DocumentIndexEntry>): DocumentIndexEntry => ({
  id: "doc-1",
  title: "Untitled",
  createdAt: 1,
  updatedAt: 2,
  nodeCount: 1,
  lastSnapshotId: "s1",
  ...fields
});

describe("what a map is called", () => {
  /**
   * The regression this exists for: `createDocument` sets `title: "Untitled"` and nothing but an
   * explicit rename ever changed it, so the library and the published page named every map
   * `Untitled` while its root said something real. D-18 had already settled the same question
   * for download filenames — the root label is the identity.
   */
  it("prefers the root label over the stored title", () => {
    expect(documentDisplayName(documentWith("前行", "Untitled"))).toBe("前行");
    expect(entryDisplayName(entryWith({ rootLabel: "前行" }))).toBe("前行");
  });

  it("falls back to the stored title when the root is empty", () => {
    // An imported map carries its filename as `title`; that is better than a placeholder.
    expect(documentDisplayName(documentWith("", "notes-2026"))).toBe("notes-2026");
    expect(entryDisplayName(entryWith({ rootLabel: "", title: "notes-2026" }))).toBe("notes-2026");
  });

  it("falls back to the same placeholder in every surface when both are empty", () => {
    expect(documentDisplayName(documentWith("   ", "  "))).toBe(UNNAMED_MAP);
    expect(entryDisplayName(entryWith({ rootLabel: "", title: "" }))).toBe(UNNAMED_MAP);
    expect(displayNameFromParts(undefined, undefined)).toBe(UNNAMED_MAP);
  });

  it("names an entry written before rootLabel existed, rather than showing a placeholder", () => {
    // No migration runs; an old entry simply has no rootLabel until it is next written.
    expect(entryDisplayName(entryWith({ title: "Older map" }))).toBe("Older map");
  });

  it("collapses whitespace so a wrapped label reads as one name in a list", () => {
    expect(documentDisplayName(documentWith("Two\nlines   here", "Untitled"))).toBe("Two lines here");
    expect(rootLabelOf(documentWith("  padded  ", "Untitled"))).toBe("padded");
  });

  it("stores an empty root label rather than a whitespace one", () => {
    expect(rootLabelOf(documentWith("   ", "Untitled"))).toBe("");
  });
});
