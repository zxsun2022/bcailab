# Mapdown

**Status:** scaffold only — `apps/mapdown` exists and runs, but there is no editor. Phase 0
spikes come next.
**Home:** `apps/mapdown` in this monorepo; deploys to `map.bcailab.com` (Pages project not yet
created).

```bash
pnpm --filter mapdown dev      # http://localhost:5174
pnpm --filter mapdown build    # tsc --noEmit && vite build -> dist/
```

Vite + React SPA on **TypeScript 7** (D-04, D-13). No server, no Cloudflare bindings, and no
dependency on `@bcailab/ui` — Mapdown owns its own chrome tokens in `src/styles/` (D-05).

Mapdown is a browser-based, keyboard-first mind-map editor whose semantic source is a
Markdown tree. Its promise: open the site, build a structured map immediately, let the
application own the geometry, and export the whole thing as standard Markdown or a
high-quality image. No account, no server, no lock-in.

It is a **separate product** from English Studio. It shares this repo's infrastructure and
(eventually) its accounts, but shares none of its branding or visual system. See
`decisions.md` D-05.

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

## Known risk

The hardest parts are concentrated in three places, and `spec/phases.md` Phase 0 exists to
de-risk them before feature work starts: in-canvas WYSIWYG text editing with **Chinese IME**
(Enter and Tab are both commands and IME confirmation keys — the main source of subtle bugs),
text-measurement-driven variable-size tidy-tree layout, and SVG/PNG export containing CJK text
with no external font dependency. Do not skip the spikes.
