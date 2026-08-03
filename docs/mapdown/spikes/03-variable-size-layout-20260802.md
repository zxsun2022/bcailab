# Spike 3 — variable-size tidy-tree layout

**Date:** 2026-08-02 · **Phase:** 0 · **Status:** complete — no blocker, no open decision
(Finding 2 was retracted after owner review; see below)
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

## Finding 2 — **RETRACTED.** There is no §7.6 / §11.5 conflict

> **Corrected 2026-08-02**, after owner review. The original Finding 2 claimed the specification
> contradicted itself and recommended weakening §11.5. **That was wrong, and the cause was a
> defect in this spike's own implementation.** The section below records what actually happened,
> because a retracted claim is more useful than a deleted one.

**What the spike did wrong.** `spec/layout-engine.md` §3 states plainly: *"The root center is the
conceptual origin `(0, 0)` in document coordinates."* This implementation ignored that and placed
the root at `y = (tallest − rootHeight) / 2`, where `tallest` is the taller of the two sides. Every
node's coordinate was therefore expressed relative to a moving origin.

**Why that produced a phantom conflict.** Under the original code the root centre sat at
`tallest / 2`, and each side's block centre also sat at `tallest / 2` — the two are equal, so the
relative geometry was already correct. Growing either side changed `tallest`, which translated the
*entire map*, root and both sides together, by a constant. The "untouched side" then showed
27/27 nodes moved by ≤ 10.5 px, and the diff could not tell a global translation apart from a real
reflow. The alternative "anchored" policy scored 0/27 for exactly the same reason: it happened to
pin the origin, which is what §3 required all along. **The two policies differed by a global Y
translation and nothing else** — there was never a relative-geometry tradeoff to weigh.

**After the fix.** Root centre pinned to `(0, 0)`, each side's block centred on the origin, bounds
allowed to be signed. Re-measured with root-relative geometry:

| Check | Result |
|---|---|
| §3 — root centre is the origin | `(0.00, 0.00)`; bounds Y `−826…826`, signed as §3 expects |
| §11.5 — untouched side after editing a deep leaf on the other side | **0 / 27 moved, max 0.00 px** |

**§7.6 and §11.5 hold simultaneously and exactly.** A side-independent, root-relative layout
satisfies both with no compromise, no threshold and no hysteresis. §11.5 is **not** weakened, and
no specification amendment is needed.

**The lesson worth keeping:** a stability metric computed in absolute coordinates cannot
distinguish a global translation from a real reflow. Measure geometry relative to the documented
origin, or the metric will manufacture conflicts. The Phase 1 regression test should assert the §3
origin invariant *first*, because every stability assertion depends on it.

## Finding 3 — the whole-tree cascade is wide but shallow

Editing one deep leaf moved **41 of 72 nodes (56.9 %)**, mean 13.8 px, max 144.6 px — measured
after the §3 correction, so this is genuine reflow with no translation component.

The percentage looks alarming and mostly is not. The label grew past `maxNodeWidth`, wrapped to a
second line, and grew its box height — so its subtree height changed, every following sibling
shifted down, and each ancestor re-centred over its children. That is the correct behaviour of a
tree layout, not a defect. Every one of those 41 nodes is in the edited branch or on its path to
the root; the other side is untouched (Finding 2).

The number that matters for the user is the **max 144.6 px** on nodes below the edit in the same
branch, not the count. §11.4's viewport anchoring is aimed exactly there.

**Sticky side holds:** a content edit, including one that greatly widens a first-level label,
never flipped a branch to the other side (§7.2, §11.2) — 2 first-level branches, 0 changed.

## Verification performed

**7 of 7 checks pass** after the §3 correction. Visual confirmation: the 科判 fixture
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

**Nothing is blocked.** The specification needs no amendment: §7.6 and §11.5 hold together once
geometry is root-relative per §3.

Add to the Phase 1 test suite, in this order: the §3 origin invariant, then determinism, then
no-overlap, then §11.5 side independence. The last three are only meaningful if the first holds.
