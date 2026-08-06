import { beforeEach, describe, expect, it } from "vitest";
import kepanSource from "../fixtures/kepan.md?raw";
import { exportMarkdown } from "../markdown/serialize";
import { importMarkdown } from "../markdown/parse";
import { applyCommand, canMoveSide } from "../model/commands";
import { checkInvariants } from "../model/invariants";
import {
  createDocument,
  getNode,
  resetIdCounterForTests,
  type BranchSide,
  type MindMapDocument
} from "../model/types";
import {
  chooseSideForNewBranch,
  diffLayouts,
  layout,
  planTwoSidedSides,
  rootCentre,
  type Connector
} from "./layout";
import { clearMeasurementCache } from "./measure";

beforeEach(() => {
  resetIdCounterForTests();
  clearMeasurementCache();
});

function twoSided(doc: MindMapDocument): MindMapDocument {
  return { ...doc, layout: { mode: "two-sided" } };
}

/** Builds a two-sided document with `count` first-level branches, each with two children. */
function branches(count: number): MindMapDocument {
  let doc = twoSided(createDocument("Root"));
  for (let i = 0; i < count; i++) {
    const branch = applyCommand(doc, { type: "CreateChild", parentId: doc.rootId, text: `Branch ${i}` });
    doc = branch.doc;
    for (const label of ["a", "b"]) {
      doc = applyCommand(doc, { type: "CreateChild", parentId: branch.selection!, text: `${i}${label}` }).doc;
    }
  }
  return doc;
}

const sideOf = (doc: MindMapDocument, id: string): BranchSide | null => getNode(doc, id).side;

describe("§7.1 — partition by persisted side", () => {
  it("puts right branches at positive x and left branches at negative x", () => {
    const doc = branches(4);
    const result = layout(doc);
    for (const id of getNode(doc, doc.rootId).childIds) {
      const box = result.boxes[id]!;
      if (sideOf(doc, id) === "right") expect(box.x).toBeGreaterThan(0);
      else expect(box.x + box.width).toBeLessThan(0);
    }
  });

  it("gives descendants their first-level ancestor's side", () => {
    const doc = branches(2);
    const result = layout(doc);
    for (const branchId of getNode(doc, doc.rootId).childIds) {
      const expected = sideOf(doc, branchId);
      for (const childId of getNode(doc, branchId).childIds) {
        expect(result.boxes[childId]!.side).toBe(expected);
      }
    }
  });

  it("keeps the root centre at the origin (§3)", () => {
    const doc = branches(5);
    const centre = rootCentre(layout(doc), doc.rootId);
    expect(Math.abs(centre.x)).toBeLessThan(0.001);
    expect(Math.abs(centre.y)).toBeLessThan(0.001);
  });
});

describe("§7.4 — left-side hierarchy extends toward negative x", () => {
  it("places a left child entirely to the left of its parent", () => {
    const doc = branches(2);
    const leftBranch = getNode(doc, doc.rootId).childIds.find((id) => sideOf(doc, id) === "left");
    expect(leftBranch).toBeDefined();

    const result = layout(doc);
    const parent = result.boxes[leftBranch!]!;
    for (const childId of getNode(doc, leftBranch!).childIds) {
      const child = result.boxes[childId]!;
      expect(child.x + child.width).toBeLessThan(parent.x);
    }
  });

  it("reports outward and inward edges mirrored on the left", () => {
    const doc = branches(2);
    const result = layout(doc);
    for (const box of Object.values(result.boxes)) {
      if (box.depth === 0) continue;
      if (box.side === "left") {
        expect(box.outwardEdgeX).toBe(box.x);
        expect(box.inwardEdgeX).toBe(box.x + box.width);
      } else {
        expect(box.outwardEdgeX).toBe(box.x + box.width);
        expect(box.inwardEdgeX).toBe(box.x);
      }
    }
  });
});

describe("§10 — root connectors mirror across the two sides", () => {
  it("starts each root→first-level connector on the edge facing its branch", () => {
    // Two identical first-level branches at mirrored positions: the first is assigned right,
    // the second left (§7.2.3), and both carry identically sized children.
    const doc = branches(2);
    const result = layout(doc);

    const root = result.boxes[doc.rootId]!;
    const right = result.connectors.find(
      (c) => c.fromId === doc.rootId && result.boxes[c.toId]!.side === "right"
    )!;
    const left = result.connectors.find(
      (c) => c.fromId === doc.rootId && result.boxes[c.toId]!.side === "left"
    )!;

    // Regression: the left connector must leave the root's *left* edge. A single stored
    // outward edge (the right edge) made it span the whole root and broke the mirror.
    expect(left.path.x1).toBe(root.x);
    expect(right.path.x1).toBe(root.x + root.width);

    // The branches are identical and sit on the same vertical line, so every x coordinate of
    // the two paths must be a strict mirror about x = 0 — same magnitude, opposite sign —
    // with matching y coordinates.
    const xs = (connector: Connector) => [
      connector.path.x1,
      connector.path.c1x,
      connector.path.c2x,
      connector.path.x2
    ];
    expect(xs(left)).toEqual(xs(right).map((x) => -x));
    expect(left.path.y1).toBe(right.path.y1);
    expect(left.path.y2).toBe(right.path.y2);
  });
});

describe("§7.5 — semantic order is never reversed to suit geometry", () => {
  it("renders left-side branches top-to-bottom in document order", () => {
    const doc = branches(6);
    const result = layout(doc);
    const leftIds = getNode(doc, doc.rootId).childIds.filter((id) => sideOf(doc, id) === "left");
    const ys = leftIds.map((id) => result.boxes[id]!.y);
    expect(ys).toEqual([...ys].sort((a, b) => a - b));
  });

  it("renders left-side children top-to-bottom too", () => {
    const doc = branches(4);
    const result = layout(doc);
    const leftBranch = getNode(doc, doc.rootId).childIds.find((id) => sideOf(doc, id) === "left")!;
    const ys = getNode(doc, leftBranch).childIds.map((id) => result.boxes[id]!.y);
    expect(ys).toEqual([...ys].sort((a, b) => a - b));
  });
});

describe("§7.2 — side assignment is deterministic and sticky", () => {
  it("sends the first branch right and the second left", () => {
    let doc = twoSided(createDocument("Root"));
    const first = applyCommand(doc, { type: "CreateChild", parentId: doc.rootId, text: "one" });
    doc = first.doc;
    const second = applyCommand(doc, { type: "CreateChild", parentId: doc.rootId, text: "two" });
    doc = second.doc;

    expect(sideOf(doc, first.selection!)).toBe("right");
    expect(sideOf(doc, second.selection!)).toBe("left");
  });

  it("chooses the shorter side by measured subtree height", () => {
    let doc = twoSided(createDocument("Root"));
    const heavy = applyCommand(doc, { type: "CreateChild", parentId: doc.rootId, text: "heavy" });
    doc = heavy.doc;
    for (let i = 0; i < 5; i++) {
      doc = applyCommand(doc, { type: "CreateChild", parentId: heavy.selection!, text: `child ${i}` }).doc;
    }
    const light = applyCommand(doc, { type: "CreateChild", parentId: doc.rootId, text: "light", side: "left" });
    doc = light.doc;

    // Right is now far taller, so the next branch must go left.
    expect(chooseSideForNewBranch(doc)).toBe("left");
  });

  it("never rebalances an existing branch when a new one is added (§7.2.5)", () => {
    let doc = branches(4);
    const before = new Map(getNode(doc, doc.rootId).childIds.map((id) => [id, sideOf(doc, id)]));

    doc = applyCommand(doc, { type: "CreateChild", parentId: doc.rootId, text: "newcomer" }).doc;

    for (const [id, side] of before) expect(sideOf(doc, id)).toBe(side);
  });

  it("is stable across identical runs", () => {
    resetIdCounterForTests();
    const a = branches(6);
    resetIdCounterForTests();
    const b = branches(6);
    expect(getNode(a, a.rootId).childIds.map((id) => sideOf(a, id))).toEqual(
      getNode(b, b.rootId).childIds.map((id) => sideOf(b, id))
    );
  });
});

describe("§7.3 — moving a branch between sides", () => {
  it("changes only the side, leaving the Markdown byte-identical", () => {
    const doc = branches(3);
    const branchId = getNode(doc, doc.rootId).childIds[0]!;
    const target: BranchSide = sideOf(doc, branchId) === "right" ? "left" : "right";

    const moved = applyCommand(doc, { type: "MoveFirstLevelBranchSide", nodeId: branchId, side: target }).doc;

    expect(sideOf(moved, branchId)).toBe(target);
    expect(exportMarkdown(moved)).toBe(exportMarkdown(doc));
    expect(checkInvariants(moved)).toEqual([]);
  });

  it("round-trips through its own inverse", () => {
    const doc = branches(3);
    const branchId = getNode(doc, doc.rootId).childIds[0]!;
    const original = sideOf(doc, branchId);
    const { doc: moved, inverse } = applyCommand(doc, {
      type: "MoveFirstLevelBranchSide",
      nodeId: branchId,
      side: original === "right" ? "left" : "right"
    });
    expect(sideOf(applyCommand(moved, inverse).doc, branchId)).toBe(original);
  });

  it("refuses a node that is not first-level", () => {
    const doc = branches(2);
    const branchId = getNode(doc, doc.rootId).childIds[0]!;
    const grandchild = getNode(doc, branchId).childIds[0]!;

    expect(canMoveSide(doc, grandchild)).toBe(false);
    expect(() =>
      applyCommand(doc, { type: "MoveFirstLevelBranchSide", nodeId: grandchild, side: "left" })
    ).toThrow(/first-level/i);
  });

  it("is unavailable in right-only mode", () => {
    const doc = branches(2);
    const rightOnly: MindMapDocument = { ...doc, layout: { mode: "right" } };
    expect(canMoveSide(rightOnly, getNode(doc, doc.rootId).childIds[0]!)).toBe(false);
  });
});

describe("§11.5 — the sides do not move each other", () => {
  it("leaves the other side's geometry untouched when one side grows", () => {
    const doc = branches(4);
    const firstLevel = getNode(doc, doc.rootId).childIds;
    const rightBranch = firstLevel.find((id) => sideOf(doc, id) === "right")!;
    const leftLeaf = getNode(doc, firstLevel.find((id) => sideOf(doc, id) === "left")!).childIds[0]!;

    const before = layout(doc);
    const edited = applyCommand(doc, {
      type: "RenameNode",
      nodeId: leftLeaf,
      text: "a considerably longer label that changes this branch's measured size"
    }).doc;
    const after = layout(edited);

    const rightIds = new Set([rightBranch, ...getNode(doc, rightBranch).childIds]);
    expect(diffLayouts(before, after, (id) => rightIds.has(id)).moved).toBe(0);
  });
});

describe("mode switching preserves content (§11.3)", () => {
  it("keeps hierarchy, order and stored sides when switching right-only ↔ two-sided", () => {
    const imported = importMarkdown(kepanSource);
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;

    const rightOnly = imported.doc;
    const both = twoSided(rightOnly);

    // The *content* is untouched, but the file is not byte-identical and should not be:
    // §2.3 emits front matter once a setting differs from the default, so switching modes is
    // recorded in the document rather than lost. Compare the body, and assert the record.
    const body = (markdown: string) => markdown.slice(markdown.lastIndexOf("---\n") + 4).trimStart();
    expect(body(exportMarkdown(both))).toBe(exportMarkdown(rightOnly));
    expect(exportMarkdown(both)).toContain("layout: two-sided");
    expect(checkInvariants(both)).toEqual([]);

    const result = layout(both);
    expect(Object.keys(result.boxes)).toHaveLength(Object.keys(rightOnly.nodes).length);
    expect(result.connectors).toHaveLength(Object.keys(result.boxes).length - 1);
  });

  it("never overlaps boxes on the 科判 fixture in two-sided mode", () => {
    const imported = importMarkdown(kepanSource);
    if (!imported.ok) throw new Error(imported.error);
    // Give the fixture two real sides rather than the all-right import default.
    let doc = twoSided(imported.doc);
    const firstLevel = getNode(doc, doc.rootId).childIds;
    firstLevel.forEach((id, index) => {
      doc = applyCommand(doc, {
        type: "MoveFirstLevelBranchSide",
        nodeId: id,
        side: index % 2 === 0 ? "right" : "left"
      }).doc;
    });

    const boxes = Object.values(layout(doc).boxes);
    let overlaps = 0;
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const p = boxes[i]!;
        const q = boxes[j]!;
        if (p.x < q.x + q.width && q.x < p.x + p.width && p.y < q.y + q.height && q.y < p.y + p.height) {
          overlaps++;
        }
      }
    }
    expect(overlaps).toBe(0);
  });
});

describe("§12 (amended) — entering two-sided layout balances an all-one-side map", () => {
  it("returns a balanced side map for a right-only placeholder document", () => {
    let doc = createDocument("Root");
    doc = applyCommand(doc, { type: "CreateChild", parentId: doc.rootId, text: "a" }).doc;
    doc = applyCommand(doc, { type: "CreateChild", parentId: doc.rootId, text: "b" }).doc;
    doc = applyCommand(doc, { type: "CreateChild", parentId: doc.rootId, text: "c" }).doc;

    const sides = planTwoSidedSides(doc);
    const ids = doc.nodes[doc.rootId]!.childIds;
    expect(ids.map((id) => sides[id])).toEqual(["right", "left", "right"]);
  });

  it("weighs subtree heights rather than sibling counts", () => {
    // One tall branch and two short branches: the tall branch owns one side alone.
    let doc = createDocument("Root");
    const tall = applyCommand(doc, { type: "CreateChild", parentId: doc.rootId, text: "tall" });
    doc = tall.doc;
    for (let i = 0; i < 8; i++) {
      doc = applyCommand(doc, { type: "CreateChild", parentId: tall.selection!, text: `t${i}` }).doc;
    }
    doc = applyCommand(doc, { type: "CreateChild", parentId: doc.rootId, text: "s1" }).doc;
    doc = applyCommand(doc, { type: "CreateChild", parentId: doc.rootId, text: "s2" }).doc;

    const sides = planTwoSidedSides(doc);
    const [tallId, s1, s2] = doc.nodes[doc.rootId]!.childIds;
    expect(sides[tallId!]).toBe("right");
    expect(sides[s1!]).toBe("left");
    expect(sides[s2!]).toBe("left");
  });

  it("returns an empty map when branches already sit on both sides", () => {
    let doc = twoSided(createDocument("Root"));
    const first = applyCommand(doc, { type: "CreateChild", parentId: doc.rootId, text: "a" });
    doc = first.doc;
    doc = applyCommand(doc, { type: "CreateChild", parentId: doc.rootId, text: "b" }).doc;

    // In two-sided mode creation alternates sides, so this map is already a user arrangement.
    expect(planTwoSidedSides(doc)).toEqual({});
    expect(planTwoSidedSides({ ...doc, layout: { mode: "right" } })).toEqual({});
  });

  it("leaves a one-branch document alone", () => {
    const doc = createDocument("Root");
    expect(planTwoSidedSides(doc)).toEqual({});
  });
});
