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
- Homepage redesign. **Partly settled 2026-08-27**: the owner decided the product hierarchy —
  English Studio is the flagship and, until it has a domain of its own, `bcailab.com` is where a
  visitor meets it; Mapdown is a side project, Posts is internal, and VanMemo has its own site.
  The page was rebuilt around that (see `docs/changelog.md`). What remains open here is the
  visual redesign itself, not the hierarchy.
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

- **Promote the session/planning layer — "Today"** (owner-raised 2026-08-26 after an external
  AI review of wondering.app; *proposal only, not authorized*). The outside argument was that
  English Studio reads as a collection of tools where the learner must choose the tool, and that
  the shared learner profile should become the main character: one **Today** queue that decides
  what to practise, fed by every mode and by spaced repetition. The direction is not new to this
  repo — Later's Dictation v2 entry already says the session / goal-first layer is the next
  tenant on the `selectStarterPractice()` seam, and ADR 0006 already forbids the two ways a
  naive scheduler goes wrong (rendering a null level as B1; locking material by band). So the
  advice is a **prioritisation argument**, not a new direction, and it should be judged on
  whether its three prerequisites hold. Today none of them do:
  1. **The profile is blind in two of four skills.** Writing contributes only counters because it
     has no tag vocabulary (Next), and Dictation passes `practiceSeconds: 0` because nothing
     times an attempt (Next, authorized 2026-08-12, not started). A queue built now would
     schedule on half the evidence while presenting itself as informed.
  2. **Material is too thin to schedule over.** Ten passages per band, against a design
     assumption of roughly 500. A Today queue over that repeats within days, and a visibly
     repetitive queue is worse than no queue: it teaches the learner that the personalisation
     is decorative.
  3. **There are no real users.** A learner model's value is longitudinal. Calibrating a
     recommendation policy before anyone has a history is speculation, whereas making the
     existing profile honest and legible on `/english/progress` is not.
  One internal contradiction in the outside advice is worth recording, because it points at the
  more interesting item: it argues that the tool surface is already large enough, while treating
  the **encounter → understand → remember → produce** loop (a word met in a podcast or article,
  explained without breaking flow, then resurfacing as tomorrow's practice) as the most
  defensible thing bcailab could build. That loop's input is the Dictionary/lookup surface,
  which does not exist. Such a surface would also be the only entry point that produces learning
  objects in volume **without** first requiring a 100× material expansion.
  Suggested order if this is ever promoted, each step independently useful: (a) close the two
  measurement gaps already in Next, so the profile covers what the learner actually does;
  (b) decide whether a lookup/encounter entry point becomes the learning-object source;
  (c) only then a bounded Today over the existing seam. Today is the *result* of those, not a
  substitute for them. Nothing here has acceptance criteria; promotion is the owner's call.
