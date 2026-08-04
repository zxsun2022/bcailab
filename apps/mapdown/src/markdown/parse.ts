import { unescapeLabel } from "./escape";
import {
  SCHEMA_VERSION,
  createNode,
  newNodeId,
  normalizeText,
  type MindMapDocument,
  type MindMapNode,
  type NodeId
} from "../model/types";

/**
 * Markdown import for the documented subset, per `markdown-format.md` §10.
 *
 * Phase 1 needs this to *verify export*: §15's round-trip guarantee is the specification's
 * strongest claim about portability, and it is untestable without a reader. Full import — the
 * CommonMark pipeline, ordered lists, continuation paragraphs, inline-formatting warnings — is
 * Phase 2 scope. What is here handles the canonical form this app writes plus the ordinary
 * hand-written variations (§4.1 markers, §4.2 indentation).
 *
 * §12: import **never** mutates the active document. It returns a new one or fails; the caller
 * decides whether to swap.
 */

export type WarningCategory =
  | "ordered-list-converted"
  | "mixed-indentation"
  | "unsupported-front-matter-key"
  | "additional-heading-ignored";

export interface ImportWarning {
  category: WarningCategory;
  line: number;
  detail: string;
}

export type ImportResult =
  | { ok: true; doc: MindMapDocument; warnings: ImportWarning[] }
  | { ok: false; error: string; line?: number };

const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const EMPTY_LIST_ITEM = /^(\s*)([-*+]|\d+[.)])\s*$/;

interface FrontMatter {
  layout?: "right" | "two-sided";
  theme?: string;
  branchColors?: "single" | "by-first-level-branch";
  version?: number;
}

/**
 * A deliberately tiny reader for the documented `mindmap:` block only (§7.1).
 *
 * Not a YAML parser: a general one would accept anchors, aliases and merge keys, which §7.2
 * forbids acting on and which are a genuine attack surface in a tool that opens files people
 * were sent. Unknown keys are reported, never interpreted.
 */
function parseFrontMatter(lines: string[]): { data: FrontMatter; warnings: ImportWarning[] } {
  const data: FrontMatter = {};
  const warnings: ImportWarning[] = [];
  let inMindmap = false;

  lines.forEach((raw, index) => {
    const line = raw.replace(/\s+$/, "");
    if (line === "") return;
    if (/^mindmap:\s*$/.test(line)) {
      inMindmap = true;
      return;
    }
    if (!/^\s/.test(line)) {
      inMindmap = false;
      warnings.push({
        category: "unsupported-front-matter-key",
        line: index + 2,
        detail: `Ignored top-level key: ${line.split(":")[0]}`
      });
      return;
    }
    if (!inMindmap) return;

    const match = /^\s+([A-Za-z][A-Za-z0-9_]*):\s*(.*)$/.exec(line);
    if (!match) return;
    const key = match[1]!;
    const value = (match[2] ?? "").trim();

    switch (key) {
      case "layout":
        // §7.3 — an invalid value falls back to the default with a warning rather than failing.
        if (value === "right" || value === "two-sided") data.layout = value;
        break;
      case "theme":
        if (value) data.theme = value;
        break;
      case "branchColors":
        if (value === "single" || value === "by-first-level-branch") data.branchColors = value;
        break;
      case "version":
        data.version = Number(value);
        break;
      default:
        warnings.push({
          category: "unsupported-front-matter-key",
          line: index + 2,
          detail: `Ignored mindmap key: ${key}`
        });
    }
  });

  return { data, warnings };
}

export function importMarkdown(source: string): ImportResult {
  // §10.1–§10.2 — strip a BOM and normalise line endings before anything else looks at the text.
  const text = source.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const lines = text.split("\n");
  const warnings: ImportWarning[] = [];

  let bodyStart = 0;
  let front: FrontMatter = {};

  if (lines[0]?.trim() === "---") {
    const close = lines.findIndex((line, i) => i > 0 && line.trim() === "---");
    if (close === -1) {
      return { ok: false, error: "Front matter is opened with --- but never closed", line: 1 };
    }
    const parsed = parseFrontMatter(lines.slice(1, close));
    front = parsed.data;
    warnings.push(...parsed.warnings);
    bodyStart = close + 1;
  }

  if (front.version !== undefined && front.version > 1) {
    // §7.4 — refuse a profile version this build cannot interpret rather than guessing.
    return {
      ok: false,
      error: `This file declares mindmap format version ${front.version}, which this version of Mapdown cannot read.`
    };
  }

  // §3.1 — the root comes from the first level-1 heading. `#` alone is a valid empty root
  // (§3.3), so the space after the marker is optional.
  const firstHeading = lines.findIndex((line, i) => i >= bodyStart && /^#(\s|$)/.test(line));
  if (firstHeading === -1) {
    return {
      ok: false,
      error: "No level-1 heading found. A document needs exactly one `# ` heading for its root."
    };
  }

  // §3.2 — additional level-1 headings are reported, never silently turned into extra roots.
  for (let i = firstHeading + 1; i < lines.length; i++) {
    if (/^#(\s|$)/.test(lines[i]!)) {
      warnings.push({
        category: "additional-heading-ignored",
        line: i + 1,
        detail: "Only the first level-1 heading becomes the root; this heading was ignored."
      });
    }
  }

  const rootText = normalizeText(unescapeLabel(lines[firstHeading]!.replace(/^#\s*/, "")));
  const rootId = newNodeId();
  const nodes: Record<NodeId, MindMapNode> = {
    [rootId]: createNode({ id: rootId, text: rootText })
  };

  // stack[level] is the node most recently seen at that indentation level.
  const stack: NodeId[] = [rootId];
  const indentWidths = new Set<number>();

  for (let i = firstHeading + 1; i < lines.length; i++) {
    const raw = lines[i]!;
    if (raw.trim() === "" || /^#(\s|$)/.test(raw)) continue;

    const match = LIST_ITEM.exec(raw) ?? EMPTY_LIST_ITEM.exec(raw);
    if (!match) continue;

    const indent = (match[1] ?? "").replace(/\t/g, "  ");
    const marker = match[2] ?? "-";
    const body = match[3] ?? "";

    if (/^\d/.test(marker)) {
      warnings.push({
        category: "ordered-list-converted",
        line: i + 1,
        detail: "Ordered-list numbering was dropped; the item became an ordinary node."
      });
    }
    if (indent.length > 0) indentWidths.add(indent.length);

    // §4.3 — a depth jump does not invent intermediate nodes. The level is clamped to one
    // deeper than the deepest node so far, which is what a CommonMark parser resolves to.
    const unit = smallestIndentUnit(indentWidths);
    const rawLevel = Math.floor(indent.length / unit) + 1;
    const level = Math.min(rawLevel, stack.length);

    const parentId = stack[level - 1] ?? rootId;
    const id = newNodeId();
    nodes[id] = createNode({ id, parentId, text: normalizeText(unescapeLabel(body)) });
    nodes[parentId]!.childIds.push(id);
    stack[level] = id;
    stack.length = level + 1;
  }

  // §4.2 — indentation that mixes widths is normalised, and the user is told.
  if (indentWidths.size > 1) {
    const widths = [...indentWidths].sort((a, b) => a - b);
    const unit = widths[0]!;
    if (widths.some((w) => w % unit !== 0)) {
      warnings.push({
        category: "mixed-indentation",
        line: 0,
        detail: `Mixed indentation widths (${widths.join(", ")}) were normalised by nesting depth.`
      });
    }
  }

  // §10.12 — first-level nodes get a side; deeper nodes must not have one.
  for (const childId of nodes[rootId]!.childIds) nodes[childId]!.side = "right";

  const doc: MindMapDocument = {
    schemaVersion: SCHEMA_VERSION,
    id: `doc-${rootId}`,
    title: "Untitled",
    rootId,
    nodes,
    layout: { mode: front.layout ?? "right" },
    theme: {
      themeId: front.theme ?? "minimal-light",
      branchColorMode: front.branchColors ?? "single"
    },
    revision: 0
  };

  return { ok: true, doc, warnings };
}

function smallestIndentUnit(widths: Set<number>): number {
  if (widths.size === 0) return 2;
  return Math.min(...widths);
}
