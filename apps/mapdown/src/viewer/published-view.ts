import {
  SCHEMA_VERSION,
  type BranchSide,
  type MindMapDocument,
  type MindMapNode,
  type NodeId
} from "../model/types";

/**
 * The public view snapshot: what a published map ships so the public page can render the map
 * the author actually published, rather than a picture of it (D-32).
 *
 * **Why not the published Markdown.** Markdown is the portable interchange format and it is
 * lossy on purpose: `markdown/parse.ts` assigns every first-level node `side: "right"`, and
 * `storage-export.md` §14.4 requires Markdown to contain collapsed descendants with no record
 * that they were collapsed. A viewer built on it would put every branch on the right and expand
 * everything — and then disagree with the frozen SVG sitting beside it as the no-JavaScript
 * fallback. Two public renderings of one publication that do not match is a correctness bug.
 *
 * **Why not the private snapshot.** D-27 keeps the private cloud format free to change
 * *because it is never a public contract*. Serving it publicly would make it one. This type is
 * that contract instead: separately versioned, carrying only what a renderer needs, and with no
 * document id, revision or selection in it.
 *
 * **Forward compatibility is the whole point of `formatVersion`.** A published map is frozen;
 * a viewer shipped two years from now still has to render one written today. Add fields, never
 * repurpose them, and read an unknown newer version by refusing rather than guessing — the page
 * falls back to the frozen SVG, which is exactly the behaviour of a publication made before this
 * format existed.
 */
export const PUBLISHED_VIEW_FORMAT = 1;

export interface PublishedViewNode {
  id: NodeId;
  text: string;
  parentId: NodeId | null;
  childIds: NodeId[];
  collapsed: boolean;
  side: BranchSide | null;
}

export interface PublishedView {
  formatVersion: number;
  title: string;
  rootId: NodeId;
  nodes: Record<NodeId, PublishedViewNode>;
  layout: { mode: "right" | "two-sided" };
  theme: {
    shapeId: string;
    paletteId: string;
    branchColorMode: "single" | "by-first-level-branch";
  };
}

export function toPublishedView(document: MindMapDocument): PublishedView {
  const nodes: Record<NodeId, PublishedViewNode> = {};
  for (const [id, node] of Object.entries(document.nodes)) {
    nodes[id] = {
      id: node.id,
      text: node.text,
      parentId: node.parentId,
      childIds: [...node.childIds],
      collapsed: node.collapsed,
      side: node.side
    };
  }
  return {
    formatVersion: PUBLISHED_VIEW_FORMAT,
    title: document.title,
    rootId: document.rootId,
    nodes,
    layout: { mode: document.layout.mode },
    theme: {
      shapeId: document.theme.shapeId,
      paletteId: document.theme.paletteId,
      branchColorMode: document.theme.branchColorMode
    }
  };
}

/**
 * A document the layout engine and theme resolver can consume. The id is supplied by the
 * caller — the viewer uses a throwaway, the copy flow uses a freshly generated local id — so a
 * published map can never carry an id that collides with something the reader already has.
 */
export function documentFromPublishedView(view: PublishedView, id: string): MindMapDocument {
  const nodes: Record<NodeId, MindMapNode> = {};
  for (const [key, node] of Object.entries(view.nodes)) {
    nodes[key] = {
      id: node.id,
      text: node.text,
      parentId: node.parentId,
      childIds: [...node.childIds],
      collapsed: node.collapsed,
      side: node.side
    };
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    id,
    title: view.title,
    rootId: view.rootId,
    nodes,
    layout: { mode: view.layout.mode },
    theme: { ...view.theme },
    revision: 0
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Structural validation, shared by the publish endpoint and the reader.
 *
 * Both sides run it for different reasons: the server refuses to store a payload it cannot
 * describe, and the reader refuses to render a payload that does not match what it expects —
 * because the reader is a public page rendering someone else's content, and "the server checked
 * it once, at publish time, possibly under an older version of this code" is not a guarantee it
 * gets to rely on. Tree consistency (`checkInvariants`) is layered on top of this by the server.
 */
export function parsePublishedView(value: unknown): PublishedView | null {
  if (!isRecord(value)) return null;
  if (value.formatVersion !== PUBLISHED_VIEW_FORMAT) return null;
  if (typeof value.title !== "string" || typeof value.rootId !== "string") return null;

  const layout = isRecord(value.layout) ? value.layout : null;
  if (!layout || (layout.mode !== "right" && layout.mode !== "two-sided")) return null;

  const theme = isRecord(value.theme) ? value.theme : null;
  if (
    !theme ||
    typeof theme.shapeId !== "string" ||
    typeof theme.paletteId !== "string" ||
    (theme.branchColorMode !== "single" && theme.branchColorMode !== "by-first-level-branch")
  ) {
    return null;
  }

  const sourceNodes = isRecord(value.nodes) ? value.nodes : null;
  if (!sourceNodes) return null;
  const nodes: Record<NodeId, PublishedViewNode> = {};
  for (const [key, raw] of Object.entries(sourceNodes)) {
    const node = isRecord(raw) ? raw : null;
    if (!node || node.id !== key) return null;
    if (typeof node.text !== "string") return null;
    if (node.parentId !== null && typeof node.parentId !== "string") return null;
    if (!Array.isArray(node.childIds) || node.childIds.some((child) => typeof child !== "string")) {
      return null;
    }
    if (typeof node.collapsed !== "boolean") return null;
    if (node.side !== null && node.side !== "left" && node.side !== "right") return null;
    nodes[key] = {
      id: key,
      text: node.text,
      parentId: node.parentId as NodeId | null,
      childIds: [...node.childIds] as NodeId[],
      collapsed: node.collapsed,
      side: node.side as BranchSide | null
    };
  }
  if (!nodes[value.rootId] || nodes[value.rootId]!.parentId !== null) return null;

  return {
    formatVersion: PUBLISHED_VIEW_FORMAT,
    title: value.title,
    rootId: value.rootId,
    nodes,
    layout: { mode: layout.mode },
    theme: {
      shapeId: theme.shapeId,
      paletteId: theme.paletteId,
      branchColorMode: theme.branchColorMode
    }
  };
}
