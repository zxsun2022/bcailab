import { escapeLabel } from "./escape";
import { getNode, type MindMapDocument, type NodeId } from "../model/types";

/**
 * Canonical Markdown export, per `markdown-format.md` §2 and §14.
 *
 * The promise this file keeps is the product's whole portability claim: **every node reachable
 * from the root is exported, regardless of collapse or viewport state** (§14.1). Collapse is
 * view state; omitting a collapsed branch here would be silent data loss, and `vision.md` §9
 * names it as a product regression by name.
 */

const DEFAULT_THEME = "minimal-light";
const DEFAULT_LAYOUT = "right";
const DEFAULT_BRANCH_COLORS = "single";

export interface ExportOptions {
  /** §2.3 — front matter is emitted when settings differ from defaults, or always if forced. */
  frontMatter?: "auto" | "always" | "never";
}

/**
 * Front matter carries only the documented keys (§7.1). Anything else is not invented here:
 * a reader must be able to trust that a key present in the file is a key this app acts on.
 */
function buildFrontMatter(doc: MindMapDocument): string {
  const lines: string[] = ["mindmap:", "  version: 1"];
  if (doc.layout.mode !== DEFAULT_LAYOUT) lines.push(`  layout: ${doc.layout.mode}`);
  if (doc.theme.themeId !== DEFAULT_THEME) lines.push(`  theme: ${doc.theme.themeId}`);
  if (doc.theme.branchColorMode !== DEFAULT_BRANCH_COLORS) {
    lines.push(`  branchColors: ${doc.theme.branchColorMode}`);
  }
  return lines.join("\n");
}

function isAllDefaults(doc: MindMapDocument): boolean {
  return (
    doc.layout.mode === DEFAULT_LAYOUT &&
    doc.theme.themeId === DEFAULT_THEME &&
    doc.theme.branchColorMode === DEFAULT_BRANCH_COLORS
  );
}

export function exportMarkdown(doc: MindMapDocument, options: ExportOptions = {}): string {
  const mode = options.frontMatter ?? "auto";
  const out: string[] = [];

  const wantFrontMatter = mode === "always" || (mode === "auto" && !isAllDefaults(doc));
  if (wantFrontMatter) {
    out.push("---", buildFrontMatter(doc), "---", ""); // §2.4 — exactly one blank line after
  }

  const root = getNode(doc, doc.rootId);
  // §14.3 (amended, decisions.md D-09): an empty root exports as a bare `#`, with no placeholder
  // text invented for it.
  out.push(root.text === "" ? "#" : `# ${escapeLabel(root.text)}`);

  if (root.childIds.length > 0) {
    out.push(""); // §2.6 — exactly one blank line between heading and first item

    const emit = (id: NodeId, depth: number) => {
      const node = getNode(doc, id);
      const indent = "  ".repeat(depth); // §2.8 — two spaces per level
      // §14.3 — an empty ordinary node is a bare marker with no trailing whitespace.
      out.push(node.text === "" ? `${indent}-` : `${indent}- ${escapeLabel(node.text)}`);
      for (const childId of node.childIds) emit(childId, depth + 1);
    };

    for (const childId of root.childIds) emit(childId, 0);
  }

  // §2.10 — the file ends with exactly one newline.
  return out.join("\n") + "\n";
}

/** Export a single branch as its own document (`storage-export.md` §15, future clipboard work). */
export function exportBranchMarkdown(doc: MindMapDocument, nodeId: NodeId): string {
  const node = getNode(doc, nodeId);
  const out: string[] = [node.text === "" ? "#" : `# ${escapeLabel(node.text)}`];
  if (node.childIds.length > 0) {
    out.push("");
    const emit = (id: NodeId, depth: number) => {
      const child = getNode(doc, id);
      const indent = "  ".repeat(depth);
      out.push(child.text === "" ? `${indent}-` : `${indent}- ${escapeLabel(child.text)}`);
      for (const grandchild of child.childIds) emit(grandchild, depth + 1);
    };
    for (const childId of node.childIds) emit(childId, 0);
  }
  return out.join("\n") + "\n";
}
