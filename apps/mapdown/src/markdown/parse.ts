import { Parser as CommonMarkParser, type Node as CommonMarkNode } from "commonmark";
import {
  SCHEMA_VERSION,
  createNode,
  newNodeId,
  normalizeText,
  type MindMapDocument,
  type MindMapNode,
  type NodeId
} from "../model/types";
import { isKnownPaletteId, isKnownShapeId, normalizeThemeSelection } from "../theme/presets";

/**
 * Markdown import for the documented subset, per `markdown-format.md` §10.
 *
 * §10.4 requires "a documented CommonMark-compatible parser" for step 4 of the pipeline
 * (parse Markdown into an AST). This uses `commonmark` — the reference implementation of the
 * CommonMark spec — to build that AST; everything below it (root/list walking, inline-to-plain
 * flattening, front matter) is this app's own mapping from that AST to the node tree.
 *
 * See `decisions.md` D-14: the hand-written reader this replaced never interpreted inline syntax,
 * which made its own round-trip tests measure agreement with itself rather than correctness. A
 * real parser resolves ambiguous indentation and inline escaping per the CommonMark spec, which
 * is not always the same answer the old regex reader gave — see the depth-jump case in
 * `markdown.test.ts`, updated here to the spec-correct resolution.
 *
 * §12: import **never** mutates the active document. It returns a new one or fails; the caller
 * decides whether to swap.
 */

export type WarningCategory =
  | "ordered-list-converted"
  | "continuation-merged"
  | "unsupported-block-removed"
  | "unsupported-front-matter-key"
  | "unsupported-theme-fallback"
  | "additional-heading-ignored";

export interface ImportWarning {
  category: WarningCategory;
  line: number;
  detail: string;
}

export type ImportResult =
  | { ok: true; doc: MindMapDocument; warnings: ImportWarning[] }
  | { ok: false; error: string; line?: number };

export const IMPORT_LIMITS = {
  bytes: 5 * 1024 * 1024,
  nodes: 10_000,
  depth: 100,
  labelCodePoints: 10_000
} as const;

class ImportLimitError extends Error {}

interface FrontMatter {
  layout?: "right" | "two-sided";
  /** Step 3 (D-24) — the two theme axes; `theme` remains for legacy single-key documents. */
  shape?: string;
  palette?: string;
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
      case "shape":
        if (value) {
          if (!isKnownShapeId(value)) {
            warnings.push({
              category: "unsupported-theme-fallback",
              line: index + 2,
              detail: `Unknown shape: ${value}. Using the default instead.`
            });
          }
          data.shape = value;
        }
        break;
      case "palette":
        if (value) {
          if (!isKnownPaletteId(value)) {
            warnings.push({
              category: "unsupported-theme-fallback",
              line: index + 2,
              detail: `Unknown palette: ${value}. Using the default instead.`
            });
          }
          data.palette = value;
        }
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

/**
 * Flattens the inline content of a block node (paragraph or heading) to plain text, per §5.
 *
 * CommonMark itself resolves backslash escaping during inline parsing, so a backslash-escaped
 * `\*` never reaches this function as a literal backslash — it is already the character it
 * escaped. This function's own job is only normalization §5 asks for beyond that: emphasis,
 * strong, code and link/image wrappers are dropped and their text content kept; soft/hard breaks
 * become a single space, because a node label is one logical line (§4.4, §9).
 */
function flattenInline(block: CommonMarkNode): string {
  let out = "";
  const walker = block.walker();
  let step = walker.next();
  while (step) {
    const { node, entering } = step;
    if (entering && (node.type === "text" || node.type === "code")) {
      out += node.literal ?? "";
    } else if (entering && node.type === "html_inline") {
      // §5 — "text content where safe, otherwise removed with warning". This app never executes
      // or renders a label as HTML, so keeping the raw text is safe and lossless; there is
      // nothing here for a warning to protect against.
      out += node.literal ?? "";
    } else if (node.type === "softbreak" || node.type === "linebreak") {
      out += " ";
    }
    step = walker.next();
  }
  return out;
}

/** Every direct block child of a node, in document order. */
function children(node: CommonMarkNode): CommonMarkNode[] {
  const out: CommonMarkNode[] = [];
  let child = node.firstChild;
  while (child) {
    out.push(child);
    child = child.next;
  }
  return out;
}

function sourceLine(node: CommonMarkNode, bodyStart: number): number {
  return bodyStart + (node.sourcepos?.[0]?.[0] ?? 1);
}

/**
 * §4.4 — an item's label is every paragraph block it directly contains, concatenated with a
 * single space (a "loose" list item has more than one, i.e. a continuation paragraph). A nested
 * list is not concatenated; it becomes child nodes via `convertList`. Anything else — block
 * quotes, code blocks, thematic breaks, raw HTML blocks — is unsupported block structure (§4.4)
 * and is dropped with a warning rather than silently folded into the label.
 */
function itemLabelAndChildren(
  item: CommonMarkNode,
  bodyStart: number,
  warnings: ImportWarning[]
): { text: string; lists: CommonMarkNode[] } {
  const parts: string[] = [];
  const lists: CommonMarkNode[] = [];
  const blocks = children(item);
  const paragraphCount = blocks.filter((block) => block.type === "paragraph").length;

  if (paragraphCount > 1) {
    warnings.push({
      category: "continuation-merged",
      line: sourceLine(item, bodyStart),
      detail: "A continuation paragraph was merged into the node label with a single space."
    });
  }

  for (const block of blocks) {
    switch (block.type) {
      case "paragraph":
        parts.push(flattenInline(block));
        break;
      case "list":
        lists.push(block);
        break;
      default:
        warnings.push({
          category: "unsupported-block-removed",
          line: sourceLine(block, bodyStart),
          detail: `A ${block.type.replace("_", " ")} inside a list item is not supported and was removed.`
        });
    }
  }

  return { text: parts.join(" "), lists };
}

function convertList(
  list: CommonMarkNode,
  parentId: NodeId,
  nodes: Record<NodeId, MindMapNode>,
  bodyStart: number,
  warnings: ImportWarning[],
  depth: number,
  budget: { nodes: number }
): void {
  if (depth > IMPORT_LIMITS.depth) {
    throw new ImportLimitError(`The outline exceeds the maximum depth of ${IMPORT_LIMITS.depth}.`);
  }
  for (const item of children(list)) {
    if (item.type !== "item") continue;

    if (list.listType === "ordered") {
      warnings.push({
        category: "ordered-list-converted",
        line: sourceLine(item, bodyStart),
        detail: "Ordered-list numbering was dropped; the item became an ordinary node."
      });
    }

    const { text, lists } = itemLabelAndChildren(item, bodyStart, warnings);
    if ([...text].length > IMPORT_LIMITS.labelCodePoints) {
      throw new ImportLimitError(
        `A node label exceeds the maximum of ${IMPORT_LIMITS.labelCodePoints.toLocaleString()} characters.`
      );
    }
    budget.nodes += 1;
    if (budget.nodes > IMPORT_LIMITS.nodes) {
      throw new ImportLimitError(
        `The outline exceeds the maximum of ${IMPORT_LIMITS.nodes.toLocaleString()} nodes.`
      );
    }
    const id = newNodeId();
    nodes[id] = createNode({ id, parentId, text: normalizeText(text) });
    nodes[parentId]!.childIds.push(id);

    for (const nested of lists) {
      convertList(nested, id, nodes, bodyStart, warnings, depth + 1, budget);
    }
  }
}

export function importMarkdown(source: string): ImportResult {
  if (new TextEncoder().encode(source).byteLength > IMPORT_LIMITS.bytes) {
    return {
      ok: false,
      error: `This file exceeds the ${IMPORT_LIMITS.bytes / 1024 / 1024} MB import limit.`
    };
  }
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

  // §10.4 — step 4 of the pipeline: parse the body into an AST with a documented
  // CommonMark-compatible parser. Everything from here on walks that AST rather than raw lines.
  const body = lines.slice(bodyStart).join("\n");
  const ast = new CommonMarkParser().parse(body);
  const topLevel = children(ast);

  // §3.1 — the root comes from the first level-1 heading. `#` alone is a valid empty root
  // (§3.3), so a heading with no inline content is fine.
  const rootIndex = topLevel.findIndex((node) => node.type === "heading" && node.level === 1);
  if (rootIndex === -1) {
    return {
      ok: false,
      error: "No level-1 heading found. A document needs exactly one `# ` heading for its root."
    };
  }

  // §3.2 — additional level-1 headings are reported, never silently turned into extra roots.
  for (let i = rootIndex + 1; i < topLevel.length; i++) {
    const node = topLevel[i]!;
    if (node.type === "heading" && node.level === 1) {
      warnings.push({
        category: "additional-heading-ignored",
        line: sourceLine(node, bodyStart),
        detail: "Only the first level-1 heading becomes the root; this heading was ignored."
      });
    }
  }

  const rootHeading = topLevel[rootIndex]!;
  const rawRootText = flattenInline(rootHeading);
  if ([...rawRootText].length > IMPORT_LIMITS.labelCodePoints) {
    return {
      ok: false,
      error: `The root label exceeds the maximum of ${IMPORT_LIMITS.labelCodePoints.toLocaleString()} characters.`
    };
  }
  const rootText = normalizeText(rawRootText);
  const rootId = newNodeId();
  const nodes: Record<NodeId, MindMapNode> = {
    [rootId]: createNode({ id: rootId, text: rootText })
  };

  // Every top-level list after the root heading becomes root children, in document order.
  // Content of any other block type (a stray paragraph, a block quote, a second heading level
  // that is not level-1) is not part of this format's mapping and is silently ignored, matching
  // the pre-D-14 reader's behaviour for any line that was not a list item.
  try {
    const budget = { nodes: 1 };
    for (let i = rootIndex + 1; i < topLevel.length; i++) {
      const node = topLevel[i]!;
      if (node.type === "list") {
        convertList(node, rootId, nodes, bodyStart, warnings, 1, budget);
      }
    }
  } catch (error) {
    if (error instanceof ImportLimitError) return { ok: false, error: error.message };
    throw error;
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
    // D-24 — `theme` is the legacy single-key form; `shape` / `palette` are the two axes and
    // win per-axis when both are present. `normalizeThemeSelection` maps legacy ids onto the
    // pair and falls back to defaults for unknown values (§7.3).
    theme: normalizeThemeSelection({
      themeId: front.theme,
      shapeId: front.shape,
      paletteId: front.palette,
      branchColorMode: front.branchColors
    }),
    revision: 0
  };

  return { ok: true, doc, warnings };
}
