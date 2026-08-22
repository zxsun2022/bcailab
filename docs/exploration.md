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

- **Mapdown — document library, account save, and publish** (owner-raised 2026-08-18). Three
  independently shippable stages: a local, no-account document library (`spec/phases.md` §7);
  explicit per-document cloud save behind a Mapdown-owned backend on `map.bcailab.com`; and
  frozen-snapshot publishing to a separate host (§8). Design, draft acceptance criteria and the
  five decisions it would create are in
  [`docs/mapdown/save-publish-proposal.md`](mapdown/save-publish-proposal.md). This exploration
  was subsequently authorized in `docs/roadmap.md`; all three implementations are `in_review`.
