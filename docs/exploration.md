# Exploration

Ideas the owner is considering. **Nothing here is authorized work.**

An item on this page has no acceptance criteria, no priority, and no commitment attached. It
is recorded so it is not forgotten, not so it can be picked up. Moving something from here
into `docs/roadmap.md` is the owner's decision alone — an agent that finds an item here
attractive should propose it, not start it.

Split out of `docs/roadmap.md` on 2026-08-01; entries moved verbatim.

## Under consideration

Recorded 2026-07-21 so they are not forgotten — none are urgent.


- **English Studio UX follow-ups** — Writing material-led home/prompt bank, Translate long-input
  growth, Dictation session navigation and cues, shared return-link placement, Reading's
  personal-text affordance, and a Speech compose-height investigation. Recorded 2026-07-30 in
  `docs/ux-follow-ups-2026-07-30.md`; this is a discussion record, not a commitment or ordering.
- Homepage redesign.
- Overall visual language pass across the studio.
- An admin/back-office system for **content** (material-library management currently happens
  through `scripts/material-seed/` and raw SQL). Deferred while there are no real users and no
  non-engineer operator — a back-office UI is pure liability until then. Note this is a
  *separate* need from model routing hot-config (see Later in `docs/roadmap.md`), which does **not** require
  an admin system and has an earlier trigger. Owner view 2026-07-21.

- **Mapdown — expand/collapse motion** (owner-raised 2026-08-26, *deliberately not committed*).
  Every structural change is currently a jump cut: the stylesheet carries three `transition`
  rules in total. Collapsing a branch should move the nodes that stayed, fade the ones that left
  toward their parent, and grow the ones that arrived out of it. The architecture favours this —
  `layout()` is pure and runs outside React, so a transition interpolates between two
  already-computed layouts rather than re-running layout per frame. Two things make it real work
  rather than a CSS one-liner: nodes render at absolute coordinates (`<rect x={box.x}>`) instead
  of inside a `translate()` group, so movement cannot be handed to a CSS transition without
  restructuring the node; and connector paths cannot be transitioned by CSS at all, so their
  control points have to be interpolated alongside or the lines snap while the nodes glide. The
  genuinely fiddly part is enter/exit bookkeeping — a removed node has to stay mounted until its
  exit finishes. Constraints any attempt must keep: `prefers-reduced-motion` disables it, and the
  500/2000-node benchmark is re-run afterwards, because this repo protects typing responsiveness
  at 500 nodes and animation adds per-frame work.

- **Mapdown — canvas feel at scale** (owner-raised 2026-08-26 as "not smooth enough", *not
  diagnosed*). Worth recording that the input mapping is already the standard one: `MapCanvas`
  treats ctrl/meta-wheel as zoom about the pointer and a plain wheel as pan, which is what a
  trackpad pinch and a two-finger drag produce. So the complaint is probably **not** input
  mapping. Three candidates, in the order they should be tested: the absence of motion entirely
  (see the entry above), node re-rendering during viewport-only changes, and discrete rather than
  continuous zoom steps. Deliberately left unmeasured — if motion turns out to be the cause, the
  other two are optimisations for a problem nobody has. Measure before committing to any of it.

- **Mapdown — document library, account save, and publish** (owner-raised 2026-08-18). Three
  independently shippable stages: a local, no-account document library (`spec/phases.md` §7);
  explicit per-document cloud save behind a Mapdown-owned backend on `map.bcailab.com`; and
  frozen-snapshot publishing to a separate host (§8). Design, draft acceptance criteria and the
  five decisions it would create are in
  [`docs/mapdown/save-publish-proposal.md`](mapdown/save-publish-proposal.md). This exploration
  was subsequently authorized in `docs/roadmap.md`; all three implementations are `in_review`.
