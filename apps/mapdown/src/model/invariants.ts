import { normalizeText, type MindMapDocument, type NodeId } from "./types";

/**
 * The ten tree invariants of `data-model.md` §5, checked individually so a failure names the
 * rule it broke rather than "the document is corrupt".
 *
 * §5 asks that a development build assert these after each structural command. `applyCommand`
 * does exactly that, which is why every command below can be written without defensive checks
 * of its own: a command that produces an inconsistent tree fails loudly in development instead
 * of writing a document that cannot be exported or recovered.
 */

export type InvariantViolation = { rule: number; name: string; detail: string };

const RULES: { rule: number; name: string; check: (doc: MindMapDocument) => string | null }[] = [
  {
    rule: 1,
    name: "exactly one root",
    check: (doc) => {
      if (!doc.nodes[doc.rootId]) return `rootId ${doc.rootId} is not in nodes`;
      const parentless = Object.values(doc.nodes).filter((n) => n.parentId === null);
      return parentless.length === 1 ? null : `${parentless.length} nodes have no parent`;
    }
  },
  {
    rule: 2,
    name: "root parent is null",
    check: (doc) => (doc.nodes[doc.rootId]?.parentId === null ? null : "root has a parent")
  },
  {
    rule: 3,
    name: "every node reachable from root exactly once",
    check: (doc) => {
      const seen = new Set<NodeId>();
      const stack: NodeId[] = [doc.rootId];
      while (stack.length) {
        const id = stack.pop()!;
        if (seen.has(id)) return `${id} reachable more than once`;
        seen.add(id);
        const node = doc.nodes[id];
        if (!node) return `${id} referenced but missing`;
        stack.push(...node.childIds);
      }
      const orphans = Object.keys(doc.nodes).filter((id) => !seen.has(id));
      return orphans.length === 0 ? null : `unreachable: ${orphans.join(", ")}`;
    }
  },
  {
    rule: 4,
    name: "no cycle",
    check: (doc) => {
      for (const id of Object.keys(doc.nodes)) {
        const seen = new Set<NodeId>([id]);
        let current = doc.nodes[id]?.parentId ?? null;
        while (current !== null) {
          if (seen.has(current)) return `cycle through ${id}`;
          seen.add(current);
          current = doc.nodes[current]?.parentId ?? null;
        }
      }
      return null;
    }
  },
  {
    rule: 5,
    name: "child links are bidirectional",
    check: (doc) => {
      for (const node of Object.values(doc.nodes)) {
        for (const childId of node.childIds) {
          const child = doc.nodes[childId];
          if (!child) return `${node.id} lists missing child ${childId}`;
          if (child.parentId !== node.id) {
            return `${childId}.parentId is ${child.parentId}, but ${node.id} lists it as a child`;
          }
        }
      }
      return null;
    }
  },
  {
    rule: 6,
    name: "sibling ids unique within a parent",
    check: (doc) => {
      for (const node of Object.values(doc.nodes)) {
        if (new Set(node.childIds).size !== node.childIds.length) {
          return `${node.id} lists a duplicate child`;
        }
      }
      return null;
    }
  },
  {
    rule: 7,
    name: "all childIds exist",
    check: (doc) => {
      for (const node of Object.values(doc.nodes)) {
        const missing = node.childIds.find((id) => !doc.nodes[id]);
        if (missing) return `${node.id} references missing ${missing}`;
      }
      return null;
    }
  },
  {
    rule: 8,
    name: "only first-level nodes carry a side",
    check: (doc) => {
      for (const node of Object.values(doc.nodes)) {
        const first = node.parentId === doc.rootId;
        if (!first && node.side !== null) return `${node.id} is not first-level but has a side`;
      }
      return null;
    }
  },
  {
    rule: 9,
    name: "root is not collapsed",
    check: (doc) => (doc.nodes[doc.rootId]?.collapsed ? "root is collapsed" : null)
  },
  {
    rule: 10,
    name: "text is normalized",
    check: (doc) => {
      for (const node of Object.values(doc.nodes)) {
        if (node.text !== normalizeText(node.text)) {
          return `${node.id} text is not normalized: ${JSON.stringify(node.text)}`;
        }
      }
      return null;
    }
  }
];

export function checkInvariants(doc: MindMapDocument): InvariantViolation[] {
  const out: InvariantViolation[] = [];
  for (const { rule, name, check } of RULES) {
    const detail = check(doc);
    if (detail !== null) out.push({ rule, name, detail });
  }
  return out;
}

export function assertInvariants(doc: MindMapDocument, context: string): void {
  const violations = checkInvariants(doc);
  if (violations.length === 0) return;
  const lines = violations.map((v) => `  §5.${v.rule} ${v.name} — ${v.detail}`);
  throw new Error(`Tree invariants violated after ${context}:\n${lines.join("\n")}`);
}
