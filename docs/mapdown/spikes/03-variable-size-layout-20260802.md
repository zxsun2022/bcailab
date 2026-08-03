# Spike 3 — variable-size tidy-tree layout

**Date:** 2026-08-02 · **Phase:** 0 · **Status:** complete — **one specification conflict found
that needs an owner decision**
**Code:** `apps/mapdown/src/spikes/layout/` — disposable; the algorithm shape is what carries over
**Run it:** `pnpm --filter mapdown dev` → <http://localhost:5174/#layout>

Run against the real 科判 fixture: 72 nodes, seven levels including the root, long CJK labels of
sharply varying width.

## Finding 1 — the two-pass algorithm works, and is nowhere near a bottleneck

`layout-engine.md` §8's shape — measure bottom-up, place top-down — handles variable CJK node
sizes without difficulty. Deliberately the contour-free variant: §8 permits a contour-based
collision pass "to reduce excess whitespace" but requires determinism first, and whitespace is
cosmetic where non-determinism would break exports, tests and undo.

| Nodes | Depth | Layout (best of 3) |
|---:|---:|---:|
| 100 | 4 | 0.20 ms |
| 500 | 5 | **0.70 ms** |
| 1 000 | 5 | 2.00 ms |
| 2 000 | 6 | 5.60 ms |

`spec/product-specification.md` §19 asks for 500 nodes to stay responsive. Layout costs **0.70 ms**
there — roughly 4 % of a 60 fps frame — and scales close to linearly, including text measurement,
which is not yet cached (§4.4 permits caching; it is not needed for this).

**Layout is not the performance problem.** Rendering and React reconciliation will be, which is
why node coordinates must stay out of React state.

Also verified: geometry is **deterministic** (two runs on identical input, 0 nodes differ), and
**no two visible boxes overlap** (72 boxes, no intersecting pair).

## Finding 2 — §7.6 and §11.5 cannot both hold, and the cost is now measured

**This is the spike's real result and it needs an owner decision.**

- **§7.6** — "The root Y position SHOULD align with the center of the combined visible left/right
  extents… If one side is much taller, the other side should remain centered around root."
- **§11.5** — local reflow should "preserve unaffected side geometry where possible."

If the root centres on the *combined* extent, then growing either side moves the root, and moving
the root moves the other side. The second requirement is unreachable while the first holds. This
is not an implementation shortcoming; it is the rule composing with itself.

Measured by editing one deep leaf on the left branch and diffing only the right side:

| Root policy | Untouched side | Max shift |
|---|---|---|
| **Centred (§7.6 as written)** | **27 / 27 nodes moved** | 10.5 px |
| **Anchored** | **0 / 27 nodes moved** | 0 px |

The same edit, the same tree, one line of policy apart. The conflict is entirely §7.6's centring
rule and nothing else.

**Context that softens it:** the untouched side moves by at most **10.5 px**, and §11.4 already
says stability is delivered by *viewport compensation* — "treat the selected node's screen
position as a soft anchor and adjust viewport offset… This is viewport compensation, not
coordinate persistence." So the specification already accepts that coordinates move and mitigates
the *perceived* jump at the viewport layer.

**Options for the owner:**

1. **Keep §7.6, weaken §11.5.** A centred root is the conventional mind-map look. Say plainly that
   the untouched side may shift by a small amount and that §11.4's viewport anchoring is what
   makes it acceptable. Cheapest, and the map keeps its expected appearance.
2. **Anchor the root, weaken §7.6.** Perfect side independence at the cost of the root drifting
   from centre as sides grow — which will look wrong on an unbalanced map, and §7.6 exists
   because of that.
3. **Hysteresis** — re-centre only when the imbalance passes a threshold. Preserves both most of
   the time, at the cost of a rule that is harder to explain and a threshold to justify.

**Recommendation: option 1.** 10.5 px is below the threshold at which a shift reads as a jump,
the viewport compensation §11.4 already mandates absorbs it, and a mind map whose root wanders
off-centre violates the stronger expectation. The spec should be amended to say so rather than
leaving two rules that quietly contradict.

## Finding 3 — the whole-tree cascade is wide but shallow

Editing one deep leaf moved **42 of 72 nodes (58.3 %)**, mean 16.2 px, max 144.2 px.

The percentage looks alarming and mostly is not. The label grew past `maxNodeWidth`, wrapped to a
second line, and grew its box height — so its subtree height changed, every following sibling
shifted down, and each ancestor re-centred over its children. That is the correct behaviour of a
tree layout, not a defect.

The number that matters for the user is the **max 144.2 px** on nodes below the edit in the same
branch, not the count. §11.4's viewport anchoring is aimed exactly there.

**Sticky side holds:** a content edit, including one that greatly widens a first-level label,
never flipped a branch to the other side (§7.2, §11.2) — 2 first-level branches, 0 changed.

## Verification performed

6 of 7 checks pass; the one failure is Finding 2, which is a specification conflict rather than a
code defect, and is reported rather than worked around. Visual confirmation: the 科判 fixture
renders as a legible two-sided map, all seven levels, no overlaps, curved connectors landing on
the correct edges per side.

TypeScript 7 typecheck clean — `noUnusedParameters` caught a redundant argument during
development, which is the strict config earning its keep.

## What is NOT verified

- **Wrapping is approximated.** Box height uses `ceil(textWidth / maxNodeWidth)`. §4.2 requires
  breaking on grapheme clusters, which for CJK is nearly per-character. Good enough to size boxes
  for this spike; **not** good enough to ship, and the real implementation needs its own pass.
- **Collapse was exercised only in bulk** (collapse everything at depth ≥ 3), not the per-node
  expand/collapse stability §11.7 describes.
- **No connector-collision or whitespace analysis.** The contour-free variant leaves visible
  whitespace on unbalanced subtrees; acceptable for MVP, and §8 already sanctions a later contour
  pass.
- **Measurement caching** (§4.4) is unimplemented — unnecessary at these numbers, but the real
  editor re-measures on every keystroke, which is a different profile from re-measuring once.

## Recommendation

**No architectural blocker. Phase 0 exit for this risk: cleared.**

Carry forward: the two-pass structure, the `Spacing` token set, the sibling-vs-subtree gap
distinction, and the determinism and no-overlap assertions as real unit tests in Phase 1.

**Blocked on an owner decision:** which way to resolve §7.6 versus §11.5 (Finding 2). Whichever is
chosen, one of the two sections must be amended so the specification stops asserting both.
