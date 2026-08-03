/*
 * Phase 0 spike 3 — minimal outline parser.
 *
 * Not the real importer: markdown-format.md §10 specifies a CommonMark-based pipeline with
 * front matter, warnings and validation. This reads just enough of the fixture to feed the
 * layout engine, and is disposable with the rest of the spike.
 */

export type Node = {
  id: string;
  text: string;
  parentId: string | null;
  childIds: string[];
  collapsed: boolean;
  side: "left" | "right" | null;
  depth: number;
};

export type Tree = { rootId: string; nodes: Record<string, Node> };

export function parseOutline(markdown: string): Tree {
  const body = markdown.replace(/^---\n[\s\S]*?\n---\n/, "");
  const lines = body.split("\n");
  const nodes: Record<string, Node> = {};
  let seq = 0;
  const id = () => `n${++seq}`;

  const headingLine = lines.find((l) => /^#\s+/.test(l));
  const rootId = id();
  nodes[rootId] = {
    id: rootId,
    text: headingLine ? headingLine.replace(/^#\s+/, "").trim() : "Untitled",
    parentId: null,
    childIds: [],
    collapsed: false,
    side: null,
    depth: 0
  };

  // stack[i] holds the most recent node at indent level i.
  const stack: string[] = [rootId];

  for (const line of lines) {
    const m = /^(\s*)-\s+(.*)$/.exec(line);
    if (!m) continue;
    const indent = m[1] ?? "";
    const text = (m[2] ?? "").trim();
    if (!text) continue;

    const level = Math.floor(indent.length / 2) + 1;
    const parentId = stack[level - 1] ?? rootId;
    const nodeId = id();

    nodes[nodeId] = {
      id: nodeId,
      text,
      parentId,
      childIds: [],
      collapsed: false,
      side: null,
      depth: level
    };
    nodes[parentId]!.childIds.push(nodeId);
    stack[level] = nodeId;
    stack.length = level + 1;
  }

  return { rootId, nodes };
}

/** Synthetic tree for the scale test — layout cost, not realism. */
export function generateTree(target: number, branching = 4): Tree {
  const nodes: Record<string, Node> = {};
  let seq = 0;
  const rootId = `g${++seq}`;
  nodes[rootId] = {
    id: rootId,
    text: `${target} 节点压力测试`,
    parentId: null,
    childIds: [],
    collapsed: false,
    side: null,
    depth: 0
  };

  const queue = [rootId];
  while (Object.keys(nodes).length < target && queue.length > 0) {
    const parentId = queue.shift()!;
    const parent = nodes[parentId]!;
    for (let i = 0; i < branching && Object.keys(nodes).length < target; i++) {
      const childId = `g${++seq}`;
      // Varying label length is the point: uniform boxes would not exercise variable sizing.
      const width = 2 + ((seq * 7) % 12);
      nodes[childId] = {
        id: childId,
        text: "节点".repeat(Math.max(1, Math.floor(width / 2))) + ` ${seq}`,
        parentId,
        childIds: [],
        collapsed: false,
        side: null,
        depth: parent.depth + 1
      };
      parent.childIds.push(childId);
      queue.push(childId);
    }
  }
  return { rootId, nodes };
}

export function countNodes(tree: Tree): number {
  return Object.keys(tree.nodes).length;
}

export function maxDepth(tree: Tree): number {
  return Math.max(...Object.values(tree.nodes).map((n) => n.depth));
}
