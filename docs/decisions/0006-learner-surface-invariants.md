# 0006 — Two learner-surface invariants

**Status:** Accepted · **Date:** 2026-07-28 · **Origin:** `docs/roadmap.md` (Now)

## Context

The English Studio IA v2 / Coach Home iteration established two rules that outlive it. They
apply to **anything** touching the learner surfaces, not only to the iteration that produced
them. Full reasoning: `docs/english-studio-ia-v2-design.md`.

## Decision

**Never render a `null` level as "B1".** A policy may use B1 internally; the UI must not claim
a level the system has not established.

**Never lock material by band.** CEFR confidence is the product of practice volume *and* band
spread, so a recommender that never explores starves the estimator that decides the learner's
level. Fold other bands; do not gate them.

## Consequences

- A learner with no measurement sees an honest absence, not a fabricated starting level.
- Recommenders must surface material outside the learner's current band. A recommender that
  only ever serves the estimated band is a defect, not a conservative default.
- Both are enforced by tests rather than left as conventions — 21 tests around
  `selectStarterPractice()` cover them, so a regression fails CI-visible checks rather than
  reaching a learner.

## Scope

These bind any future work on the recommendation seam, including the matching service
([0004](0004-dictation-v2-retrieves-rather-than-generates.md)) and the session/planning layer
that follows it. Violating either is a defect regardless of what the surrounding feature is
trying to achieve.
