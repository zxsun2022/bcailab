import { performance } from "node:perf_hooks";
import { exportSvg } from "../apps/mapdown/src/export/svg";
import { layout } from "../apps/mapdown/src/layout/layout";
import { exportMarkdown } from "../apps/mapdown/src/markdown/serialize";
import { applyCommand } from "../apps/mapdown/src/model/commands";
import { assertInvariants } from "../apps/mapdown/src/model/invariants";
import {
  createDocument,
  createNode,
  type MindMapDocument,
  type NodeId
} from "../apps/mapdown/src/model/types";

const BRANCHING = 4;

function fixture(count: number): MindMapDocument {
  const doc = createDocument("大型科判性能基线");
  const ids: NodeId[] = [doc.rootId];

  for (let index = 1; index < count; index++) {
    const id = `bench-${index}`;
    const parentIndex = Math.floor((index - 1) / BRANCHING);
    const parentId = ids[parentIndex]!;
    const firstLevel = parentId === doc.rootId;
    doc.nodes[id] = createNode({
      id,
      parentId,
      text: `第 ${index} 节点：暇满难得与寿命无常`,
      side: firstLevel ? (index % 2 === 0 ? "left" : "right") : null
    });
    doc.nodes[parentId]!.childIds.push(id);
    ids.push(id);
  }

  doc.layout = { mode: "two-sided" };
  assertInvariants(doc);
  return doc;
}

function sample(run: () => void, iterations = 7) {
  run();
  const values: number[] = [];
  for (let index = 0; index < iterations; index++) {
    const started = performance.now();
    run();
    values.push(performance.now() - started);
  }
  values.sort((a, b) => a - b);
  return {
    bestMs: Number(values[0]!.toFixed(3)),
    medianMs: Number(values[Math.floor(values.length / 2)]!.toFixed(3))
  };
}

const results: Record<string, unknown> = {};
for (const count of [100, 500, 2_000]) {
  const doc = fixture(count);
  const computed = layout(doc);
  const leafId = `bench-${count - 1}`;
  results[count] = {
    layout: sample(() => void layout(doc)),
    createChild: sample(() => void applyCommand(doc, {
      type: "CreateChild",
      parentId: leafId,
      text: "新节点"
    })),
    markdown: sample(() => void exportMarkdown(doc)),
    svg: sample(() => void exportSvg(doc, {}, computed))
  };
}

process.stdout.write(`${JSON.stringify({
  generatedAt: new Date().toISOString(),
  runtime: process.version,
  results
}, null, 2)}\n`);
