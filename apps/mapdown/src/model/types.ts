/**
 * The semantic document. Mirrors `docs/mapdown/spec/data-model.md` §2.
 *
 * Content, document presentation, ephemeral UI state and derived layout are kept apart on
 * purpose. This file is only the first: what a document *is*, independent of how it looks or
 * what is currently selected. Layout output never lives here (§4), and neither does selection.
 */

export type NodeId = string;
export type BranchSide = "left" | "right";

export interface MindMapNode {
  id: NodeId;
  text: string;
  parentId: NodeId | null;
  /** Semantic sibling order. Layout renders this order; balancing must never reorder it (§4.4). */
  childIds: NodeId[];
  collapsed: boolean;
  /** Only first-level nodes carry a side; descendants derive it from their first-level ancestor. */
  side: BranchSide | null;
}

export interface DocumentLayoutSettings {
  mode: "right" | "two-sided";
}

export interface ThemeSelection {
  /** Step 3 (D-24) — the two axes of the document theme, both persisted in front matter. */
  shapeId: string;
  paletteId: string;
  branchColorMode: "single" | "by-first-level-branch";
}

export interface MindMapDocument {
  schemaVersion: number;
  id: string;
  title: string;
  rootId: NodeId;
  nodes: Record<NodeId, MindMapNode>;
  layout: DocumentLayoutSettings;
  theme: ThemeSelection;
  /** Incremented by every semantic or presentation transaction; layout keys off it. */
  revision: number;
}

export const SCHEMA_VERSION = 1;

/**
 * Node text is plain Unicode, single-line (§4.3). Normalisation is applied on every write
 * rather than trusted at the call site, because invariant 10 is otherwise unenforceable.
 */
export function normalizeText(text: string): string {
  return (
    text
      // A node label is one logical line (§4.3) and MVP has no manual line break, so every
      // newline, tab and Unicode line/paragraph separator collapses to a space.
      .replace(/[\r\n\t\u2028\u2029]/g, " ")
      // Strip C0/C1 controls, which would otherwise survive into Markdown and into SVG text.
      .replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g, "")
      .trim()
  );
}

let counter = 0;

/**
 * Ids are opaque and only need to be unique within a document. Deliberately not random: a
 * deterministic sequence keeps tests and exported snapshots reproducible, and nothing in the
 * spec requires unguessable ids.
 */
export function newNodeId(existing?: Readonly<Record<NodeId, unknown>>): NodeId {
  let candidate: NodeId;
  do {
    counter += 1;
    candidate = `n${counter}`;
  } while (existing?.[candidate] !== undefined);
  return candidate;
}

export function resetIdCounterForTests(): void {
  counter = 0;
}

export function createNode(partial: Partial<MindMapNode> & { id: NodeId }): MindMapNode {
  return {
    text: "",
    parentId: null,
    childIds: [],
    collapsed: false,
    side: null,
    ...partial
  };
}

export function createDocument(rootText = ""): MindMapDocument {
  const rootId = newNodeId();
  return {
    schemaVersion: SCHEMA_VERSION,
    id: `doc-${rootId}`,
    title: "Untitled",
    rootId,
    nodes: { [rootId]: createNode({ id: rootId, text: normalizeText(rootText) }) },
    layout: { mode: "right" },
    theme: { shapeId: "minimal-light", paletteId: "slate", branchColorMode: "single" },
    revision: 0
  };
}

/* ---------- read helpers ---------- */

export function getNode(doc: MindMapDocument, id: NodeId): MindMapNode {
  const node = doc.nodes[id];
  if (!node) throw new Error(`Unknown node id: ${id}`);
  return node;
}

export function isRoot(doc: MindMapDocument, id: NodeId): boolean {
  return doc.rootId === id;
}

/** Depth 1 = a direct child of the root. */
export function depthOf(doc: MindMapDocument, id: NodeId): number {
  let depth = 0;
  let current = getNode(doc, id);
  while (current.parentId !== null) {
    depth += 1;
    current = getNode(doc, current.parentId);
  }
  return depth;
}

export function isFirstLevel(doc: MindMapDocument, id: NodeId): boolean {
  const node = doc.nodes[id];
  return node?.parentId === doc.rootId;
}

/** The first-level ancestor a node inherits its side from, or null for the root itself. */
export function firstLevelAncestor(doc: MindMapDocument, id: NodeId): NodeId | null {
  let current = doc.nodes[id];
  if (!current || current.parentId === null) return null;
  while (current.parentId !== null && current.parentId !== doc.rootId) {
    current = getNode(doc, current.parentId);
  }
  return current.id;
}

export function siblingIndex(doc: MindMapDocument, id: NodeId): number {
  const node = getNode(doc, id);
  if (node.parentId === null) return -1;
  return getNode(doc, node.parentId).childIds.indexOf(id);
}

/** Pre-order depth-first, ignoring collapse. This is the export order (§14.2). */
export function walk(doc: MindMapDocument, from: NodeId = doc.rootId): NodeId[] {
  const out: NodeId[] = [];
  const visit = (id: NodeId) => {
    out.push(id);
    for (const child of getNode(doc, id).childIds) visit(child);
  };
  visit(from);
  return out;
}

/**
 * Nodes reachable without passing through a collapsed ancestor (§9). Hidden nodes stay in the
 * document and in Markdown export — this projection is for layout and navigation only.
 */
export function visibleNodes(doc: MindMapDocument): NodeId[] {
  const out: NodeId[] = [];
  const visit = (id: NodeId) => {
    out.push(id);
    const node = getNode(doc, id);
    if (node.collapsed) return;
    for (const child of node.childIds) visit(child);
  };
  visit(doc.rootId);
  return out;
}

export function subtreeIds(doc: MindMapDocument, id: NodeId): NodeId[] {
  return walk(doc, id);
}

export function isDescendantOf(doc: MindMapDocument, candidate: NodeId, ancestor: NodeId): boolean {
  let current = doc.nodes[candidate];
  while (current?.parentId != null) {
    if (current.parentId === ancestor) return true;
    current = doc.nodes[current.parentId];
  }
  return false;
}
