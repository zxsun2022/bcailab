import { useMemo, useState } from "react";
import kepanSource from "../../fixtures/kepan.md?raw";
import { FONT_STACK } from "../svg-export/measure";
import {
  DEFAULT_SPACING,
  diffLayouts,
  layoutRightOnly,
  layoutTwoSided,
  type LayoutResult
} from "./layout";
import { countNodes, generateTree, maxDepth, parseOutline, type Tree } from "./tree";

/*
 * Phase 0 spike 3 — variable-size tidy-tree layout.
 *
 * Three questions, in order of how much they could hurt:
 *   1. does a deterministic two-pass layout handle variable CJK node sizes at 7 levels?
 *   2. how much geometry moves when one node is edited?  (layout-engine.md §11)
 *   3. does it stay responsive at the 500 nodes §19 requires?
 */

type Check = { label: string; pass: boolean; detail: string };

function cloneTree(tree: Tree): Tree {
  return {
    rootId: tree.rootId,
    nodes: Object.fromEntries(
      Object.entries(tree.nodes).map(([id, n]) => [id, { ...n, childIds: [...n.childIds] }])
    )
  };
}

export function LayoutSpike() {
  const [mode, setMode] = useState<"right" | "two-sided">("two-sided");
  const [collapseDeep, setCollapseDeep] = useState(false);

  const base = useMemo(() => parseOutline(kepanSource), []);

  const tree = useMemo(() => {
    const t = cloneTree(base);
    if (collapseDeep) {
      for (const n of Object.values(t.nodes)) if (n.depth >= 3 && n.childIds.length) n.collapsed = true;
    }
    return t;
  }, [base, collapseDeep]);

  const result = useMemo<LayoutResult>(
    () => (mode === "right" ? layoutRightOnly(tree) : layoutTwoSided(tree)),
    [tree, mode]
  );

  const checks = useMemo<Check[]>(() => {
    const out: Check[] = [];
    const run = (t: Tree) => (mode === "right" ? layoutRightOnly(t) : layoutTwoSided(t));

    out.push({
      label: "Fixture parses to the expected shape",
      // depth 6 == 7 levels counting the root, which is what the source 科判 has.
      pass: countNodes(base) === 72 && maxDepth(base) === 6,
      detail: `${countNodes(base)} nodes, max depth ${maxDepth(base)} → ${maxDepth(base) + 1} levels including root`
    });

    // Determinism first: without it, exports, tests and undo are all unreliable (§8).
    const a = run(cloneTree(tree));
    const b = run(cloneTree(tree));
    const same = diffLayouts(a, b);
    out.push({
      label: "Deterministic — identical input gives identical geometry",
      pass: same.moved === 0,
      detail: `${same.shared} nodes compared, ${same.moved} moved`
    });

    // No two visible boxes may overlap, or the map is unreadable.
    const boxes = Object.values(result.boxes);
    let overlaps = 0;
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const p = boxes[i]!;
        const q = boxes[j]!;
        if (p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h) overlaps++;
      }
    }
    out.push({
      label: "No overlapping node boxes",
      pass: overlaps === 0,
      detail: overlaps === 0 ? `${boxes.length} boxes, none intersecting` : `${overlaps} overlapping pairs`
    });

    // The stability question (§11). Edit one deep leaf and ask two things: how far the cascade
    // spreads at all, and — the sharper question — whether the side the user never touched moved.
    const leafId = Object.values(tree.nodes)
      .filter((n) => n.childIds.length === 0 && n.depth >= 4)
      .at(-1)?.id;

    if (leafId) {
      const edited = cloneTree(tree);
      edited.nodes[leafId]!.text += "，加长这个标签以改变它的宽度";

      // Which first-level branch owns the edited leaf, and therefore which side is "untouched".
      let ancestor = tree.nodes[leafId]!;
      while (ancestor.parentId && ancestor.parentId !== tree.rootId) ancestor = tree.nodes[ancestor.parentId]!;
      const editedSide = ancestor.side;
      const untouched = (id: string) =>
        a.boxes[id] !== undefined && a.boxes[id]!.side !== "root" && a.boxes[id]!.side !== editedSide;

      const after = run(edited);
      const all = diffLayouts(a, after);
      out.push({
        label: "Cascade from one leaf edit is measured, not assumed",
        pass: true, // information, not a verdict — see the report
        detail: `${all.moved}/${all.shared} nodes moved (${all.movedPct.toFixed(1)}%), max ${all.maxShift.toFixed(1)}px, mean ${all.meanShift.toFixed(1)}px`
      });

      if (mode === "two-sided" && editedSide) {
        const other = diffLayouts(a, after, untouched);
        out.push({
          label: "§11.5 — the untouched side stays put (root centred per §7.6)",
          pass: other.moved === 0,
          detail: `${other.moved}/${other.shared} nodes on the ${editedSide === "left" ? "right" : "left"} side moved, max ${other.maxShift.toFixed(1)}px`
        });

        // Same edit, root anchored instead of centred. If this holds the untouched side still,
        // the conflict is §7.6's centring rule and nothing else.
        const aAnchored = layoutTwoSided(cloneTree(tree), undefined, "anchored");
        const afterAnchored = layoutTwoSided(edited, undefined, "anchored");
        const otherAnchored = diffLayouts(aAnchored, afterAnchored, (id) => {
          const box = aAnchored.boxes[id];
          return box !== undefined && box.side !== "root" && box.side !== editedSide;
        });
        out.push({
          label: "Same edit with the root anchored instead of centred",
          pass: otherAnchored.moved === 0,
          detail: `${otherAnchored.moved}/${otherAnchored.shared} nodes on the untouched side moved — this is the §7.6 vs §11.5 tradeoff, quantified`
        });
      }
    }

    // Sticky side (§7.2/§11.2): content edits must never flip a branch to the other side.
    if (mode === "two-sided") {
      const edited = cloneTree(tree);
      const firstLevel = base.nodes[base.rootId]!.childIds;
      const target = firstLevel[0];
      if (target) edited.nodes[target]!.text = "极大幅度加长的第一层标签用于测试侧边粘性是否被内容编辑改变";
      const after = run(edited);
      const flipped = firstLevel.filter(
        (id) => a.boxes[id] && after.boxes[id] && Math.sign(a.boxes[id]!.x) !== Math.sign(after.boxes[id]!.x)
      ).length;
      out.push({
        label: "Sticky side — a content edit never flips a branch",
        pass: flipped === 0,
        detail: `${firstLevel.length} first-level branches, ${flipped} changed side`
      });
    }

    return out;
  }, [tree, mode, base, result]);

  const [scale, setScale] = useState<{ n: number; ms: number; depth: number }[]>([]);
  const runScaleTest = () => {
    const rows: { n: number; ms: number; depth: number }[] = [];
    for (const n of [100, 500, 1000, 2000]) {
      const t = generateTree(n);
      const runs = [0, 0, 0].map(() => (mode === "right" ? layoutRightOnly(t) : layoutTwoSided(t)).ms);
      rows.push({ n: countNodes(t), ms: Math.min(...runs), depth: maxDepth(t) });
    }
    setScale(rows);
  };

  const { bounds } = result;
  const pad = 40;
  const vb = `${bounds.minX - pad} ${bounds.minY - pad} ${bounds.maxX - bounds.minX + pad * 2} ${bounds.maxY - bounds.minY + pad * 2}`;
  const passed = checks.filter((c) => c.pass).length;

  return (
    <div style={{ display: "grid", gap: "1.5rem" }}>
      <section style={{ display: "flex", gap: "1.25rem", alignItems: "center", flexWrap: "wrap" }}>
        <label>
          <input type="radio" checked={mode === "two-sided"} onChange={() => setMode("two-sided")} />{" "}
          Two-sided
        </label>
        <label>
          <input type="radio" checked={mode === "right"} onChange={() => setMode("right")} /> Right-only
        </label>
        <label>
          <input
            type="checkbox"
            checked={collapseDeep}
            onChange={(e) => setCollapseDeep(e.target.checked)}
          />{" "}
          Collapse at depth ≥ 3
        </label>
        <span style={{ color: "var(--chrome-text-muted)" }}>
          {Object.keys(result.boxes).length} visible · layout {result.ms.toFixed(2)}ms
        </span>
        <button onClick={runScaleTest} style={{ font: "inherit", cursor: "pointer" }}>
          Run scale test
        </button>
      </section>

      <section>
        <h3 style={{ fontSize: "0.95rem", margin: "0 0 0.5rem" }}>
          Checks — {passed}/{checks.length} passing
        </h3>
        <div
          style={{
            border: "1px solid var(--chrome-border)",
            borderRadius: "var(--chrome-radius)",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: "12px"
          }}
        >
          {checks.map((c) => (
            <div key={c.label} style={{ padding: "0.4rem 0.75rem", borderBottom: "1px solid var(--chrome-border)" }}>
              <span style={{ color: c.pass ? "var(--chrome-accent)" : "#d94f4f" }}>
                {c.pass ? "PASS" : "FAIL"}
              </span>{" "}
              {c.label}
              <div style={{ color: "var(--chrome-text-muted)" }}>{c.detail}</div>
            </div>
          ))}
        </div>
      </section>

      {scale.length > 0 && (
        <section>
          <h3 style={{ fontSize: "0.95rem", margin: "0 0 0.5rem" }}>
            Scale — best of 3, §19 asks for 500 nodes responsive
          </h3>
          <div style={{ fontFamily: "ui-monospace, monospace", fontSize: "12px" }}>
            {scale.map((r) => (
              <div key={r.n}>
                {String(r.n).padStart(5)} nodes · depth {r.depth} · {r.ms.toFixed(2)}ms
                {r.ms > 16 ? "  ← over one frame" : ""}
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h3 style={{ fontSize: "0.95rem" }}>科判 fixture, laid out</h3>
        <div style={{ border: "1px solid var(--chrome-border)", background: "#fff", overflow: "auto", maxHeight: "34rem" }}>
          <svg viewBox={vb} width="100%" style={{ display: "block", minHeight: "24rem" }}>
            {Object.values(result.boxes).map((b) => {
              const parentId = tree.nodes[b.id]!.parentId;
              const p = parentId ? result.boxes[parentId] : null;
              if (!p) return null;
              const fromX = b.side === "left" ? p.x : p.x + p.w;
              const toX = b.side === "left" ? b.x + b.w : b.x;
              const midX = (fromX + toX) / 2;
              return (
                <path
                  key={`e${b.id}`}
                  d={`M${fromX},${p.y + p.h / 2} C${midX},${p.y + p.h / 2} ${midX},${b.y + b.h / 2} ${toX},${b.y + b.h / 2}`}
                  fill="none"
                  stroke="#b9bec6"
                  strokeWidth={1.2}
                />
              );
            })}
            {Object.values(result.boxes).map((b) => (
              <g key={b.id}>
                <rect
                  x={b.x}
                  y={b.y}
                  width={b.w}
                  height={b.h}
                  rx={5}
                  fill={b.depth === 0 ? "#2f6feb" : "#fff"}
                  stroke={b.depth === 0 ? "#2f6feb" : "#c8ccd1"}
                />
                <text
                  x={b.x + DEFAULT_SPACING.paddingX}
                  y={b.y + b.h / 2}
                  fontFamily={FONT_STACK}
                  fontSize={DEFAULT_SPACING.fontSize}
                  fill={b.depth === 0 ? "#fff" : "#1c1e21"}
                  dominantBaseline="central"
                >
                  {tree.nodes[b.id]!.text}
                </text>
              </g>
            ))}
          </svg>
        </div>
      </section>
    </div>
  );
}
