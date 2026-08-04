# Mapdown

**Status (2026-08-03):** Phase 0 complete, **Phase 1 complete**, Phase 2 in progress.
The editor works — keyboard-first authoring, two-sided layout, four themes, Markdown/SVG/PNG
export, local autosave and recovery, pan/zoom/fit. **393 tests.**

**Home:** `apps/mapdown`; deploys to `map.bcailab.com` (Pages project **not yet created**).

```bash
pnpm --filter mapdown dev      # http://localhost:5174
pnpm --filter mapdown build    # tsc --noEmit && vite build -> dist/
pnpm test                      # whole repo, includes apps/mapdown/src/**
```

Vite + React SPA on **TypeScript 7** (D-04, D-13). No server, no Cloudflare bindings, no
dependency on `@bcailab/ui` — Mapdown owns its chrome tokens in `src/styles/` (D-05).

## Progress against `spec/phases.md` §12

| # | Step | State |
|---|---|---|
| 1 | Data invariants and commands | ✅ `src/model/` |
| 2 | Right-only layout with measured text | ✅ `src/layout/` |
| 3 | Selection / editing / IME | ✅ `src/editor/` |
| 4 | Keyboard creation and navigation | ✅ `src/editor/keymap.ts` |
| 5 | History | ✅ `src/model/history.ts` |
| 6 | Collapse visible projection | ✅ |
| 7 | Local save and recovery | ✅ `src/storage/` |
| 8 | Markdown import/export | ✅ `src/markdown/` — real CommonMark parser landed, D-14 |
| 9 | Two-sided sticky branches | ✅ |
| 10 | Drag/drop and accessible move commands | 🟡 keyboard/menu path done (`ReorderNode`/`ReparentNode`, Alt+↑/↓, toolbar buttons); pointer drag-and-drop not started |
| 11 | Pan / zoom / fit | ✅ `src/canvas/viewport.ts` |
| 12 | Theme tokens and presets | ✅ `src/theme/` |
| 13 | SVG export | ✅ `src/export/svg.ts` |
| 14 | PNG export | ✅ `src/export/png.ts` |
| 15 | **Help / Command Center** | ❌ not started |
| 16 | **Accessibility hardening** | ❌ not started |
| 17 | **Performance and regression pass** | ❌ not started |

Also outstanding for Phase 2: **create the Cloudflare Pages project** (D-03 has the exact
settings, including the build watch paths that stop every push triggering two builds).

## How this codebase is worked on

Two habits are worth continuing, because most of the real defects found so far came from them
rather than from writing more tests:

**Mutation-check anything load-bearing.** Break the rule on purpose and confirm tests go red.
This caught a whole tautological test suite (D-14), a layout assertion whose fixture made the
mutation a no-op, and several claims that only looked verified.

**Drive the browser for anything involving React, focus or the DOM.** Six real bugs in Phase 1
were invisible to unit tests: the editor surface never held keyboard focus, side effects inside
a state updater, a StrictMode-disposed autosave that never came back, Escape discarding typed
work, a viewport that lost most of a fast drag, and a root node offering a collapse control the
model refuses to honour.

## Where to start

1. **`decisions.md`** — what has been decided and why, including the decisions that are *not*
   in the upstream specification (repo form, deployment, visual isolation). Read this first;
   it is what stops settled questions from being re-litigated.
2. **`spec/README.md`** — the specification's own document map and its normative decision list.
3. **`spec/vision.md`** and **`spec/product-specification.md`** — product philosophy, then the
   complete functional requirements.
4. **`design-tokens.md`** — the two-layer token model (app chrome vs. document theme) and the
   constraints that fall out of it. Read before writing any styling or theme code.

The specification is written to be technology-neutral and normative: **MUST** / **SHOULD** /
**MAY** carry their usual force. `spec/phases.md` §13 lists the version-1.0 decisions that
should not be casually reopened during implementation.

## What lives here

| Path | Owner | Status |
|---|---|---|
| `decisions.md` | this repo | living document — append as decisions are made |
| `design-tokens.md` | this repo | living document |
| `spec/` | upstream baseline v1.0 | frozen; amend only through `decisions.md` |

`spec/` is a versioned artifact that entered the repo on 2026-08-01. Two editorial changes were
made on intake (`decisions.md` D-07), and it has since been amended twice (D-08, D-09).

**Amendments are never silent.** Each one marks the spec inline at the point of change with an
`> **Amendment (date)**` note *and* gets a record in `decisions.md` carrying the reasoning.
Reading the spec alone tells you a rule changed; reading the log tells you why.
`spec/README.md` carries the running list.

## Relationship to the repo roadmap

`docs/roadmap.md` remains the single source of truth for **what to work on next**, including
Mapdown. This directory answers *what Mapdown is and how it must behave*; it does not schedule
work and does not carry iteration state. `spec/phases.md` describes the product's own phasing
(Phase 0 spikes → Phase 6 optional cloud sync) — that is a scope-control document, not a
commitment or an ordering.

## Constraints an implementer must not quietly violate

These are the ones most likely to be lost in translation, drawn from across the spec:

- **The document is an ordered tree; the map is a projection of it.** No free positioning, no
  arbitrary edges, no manual coordinates. This is what keeps the product Markdown-portable
  (`spec/vision.md` §4.5).
- **Markdown export always contains every node**, including descendants hidden by a collapsed
  ancestor. Image export reflects only what is visible. Confusing these two is a data-loss bug
  (`spec/storage-export.md` §14.4).
- **Local-first is not a fallback mode.** The core workflow must work with no account and no
  network after first load, and no document content is transmitted by default
  (`spec/product-specification.md` §20).
- **Layout stability beats optimal balance.** Branch sides are sticky, sibling order is
  semantic, and a local edit should cause local movement. A new child that makes an unrelated
  branch jump sides is a regression, not a cosmetic issue (`spec/vision.md` §4.6, §9).
- **Every destructive or structural action is undoable**, and confirmation dialogs are not a
  substitute for reliable history (`spec/vision.md` §4.8).

## Phase 0 — results

The three hardest problems were spiked before feature work. All cleared; reports in `spikes/`.

| Spike | Outcome |
|---|---|
| [1 — Chinese IME](spikes/01-ime-canvas-editing-20260802.md) | Cleared. Real 拼音 tested in Chromium and Safari. The documented Safari ordering hazard **did not reproduce** — macOS consumes the confirming key before the page sees it. The guard stays as insurance for Windows. IME does **not** discriminate between the three editing surfaces, so that choice moves to Phase 1. |
| [2 — CJK SVG/PNG export](spikes/02-cjk-svg-export-20260802.md) | Cleared. Canvas measurement and SVG layout agree to **0.000 px**, so one measurement path serves both. Cross-machine font fidelity is an accepted, documented limitation — PNG does not share it. |
| [3 — variable-size layout](spikes/03-variable-size-layout-20260802.md) | Cleared. Deterministic, no overlaps, **0.70 ms at 500 nodes**. With the root centre pinned to the origin per §3, editing a deep leaf moves **0 of 27** nodes on the other side — §7.6 and §11.5 hold together exactly. |

**One invariant to build on.** `spec/layout-engine.md` §3 — *the root centre is the document
origin `(0, 0)`* — is not a convention, it is what makes stability measurable. Geometry expressed
against any other origin turns a growing side into a global translation, and a stability metric
then cannot tell that apart from a real reflow. Spike 3 Finding 2 records how that mistake was
made and retracted. The Phase 1 test suite should assert the origin invariant **first**;
determinism, no-overlap and side-independence all depend on it.
