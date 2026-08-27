# 0009 — IELTS is a material family, not a second product

**Status:** Accepted · **Date:** 2026-08-27 · **Origin:** owner decision after a product review

## Context

English Studio already carries IELTS material: the first writing-prompt batch published 12
IELTS Academic Task 1 prompts with reviewed chart/table/process/map assets and 12 Task 2
prompts, alongside 24 general prompts. Task 1 additionally has its own evaluation contract,
because describing a chart is not the same task as arguing a position.

That made a question unavoidable, and it was raised directly: **is IELTS a family of material
inside a general practice product, or is it the product?**

The case for making it the product is real and worth stating, because this record is not a
dismissal of it. Exam prep has high intent, an explicit success metric, a deadline that creates
its own urgency, and a population that already pays. As a commercial wedge it is stronger than
"deliberate daily English practice".

The case against is that it is not a re-skin. Going IELTS-first changes:

- **The learner model.** CEFR bands would give way to a predicted band score. The existing
  estimator, its tag vocabulary, `SOURCE_WEIGHT`, and the two ADR 0006 invariants are all built
  around CEFR discovery metadata, not exam scoring.
- **The material.** Four timed, exam-format skills, with question types this repository has no
  schema for — IELTS Reading is not a graded passage with per-sentence audio.
- **The competition.** A crowded field of well-funded incumbents, versus a niche the product
  currently defines for itself.

## Decision

**IELTS stays a material family inside English Studio.** It is a `family` and `taskType` on
material, not a second product identity, not a separate surface, and not a separate learner
model. Practice organises around modes (dictation, reading, writing, translate, speech) and
CEFR discovery metadata; IELTS material is retrieved through the same catalogues, evaluated by
the same evaluator seam, and measured into the same learner profile.

Expanding IELTS material is expected and authorized as content work. What this record forbids
is expanding it into a **second product identity** — a separate home, a band-score learner
model, or an exam-first information architecture — without a new decision that supersedes this
one.

## Alternatives considered

**IELTS-first product.** Rejected for now, not on the merits of the wedge but on sequencing:
the product does not yet have real learners, so choosing an exam-first identity would mean
rebuilding the learner model and the material layer against imagined demand. The wedge argument
survives this record and is the most likely reason to supersede it.

**"An English studio that also does IELTS", left undecided.** Explicitly rejected as the worst
option. An undecided middle produces two half-committed information architectures, two implied
learner models, and copy that cannot say what the product is for. The point of this record is
that the middle is a decision, not a default.

## Consequences

- IELTS material grows through the existing writing-prompt pipeline, under the same validation,
  content review and owner approval as every other batch.
- IELTS Listening and IELTS Reading are **not** in scope as material shapes. They would need
  new question-type schemas and timed-section semantics, which is product work requiring its
  own authorization — not a content push.
- Prompt-level metadata (`family`, `taskType`, the Task 1 evaluation contract) stays the only
  place IELTS-ness lives. No IELTS-specific route, navigation entry, or profile field.
- The learner profile keeps CEFR discovery bands. ADR 0006's two invariants continue to apply
  unchanged to IELTS material: a null level is never rendered as B1, and material is never
  locked by band.

## Trigger to revisit

Evidence of real demand that the family cannot serve: learners arriving for the exam, using
only Task 1/Task 2 material, and asking for timed sections, band-score prediction, or the two
missing skills. That is a reason to reopen the identity question with data — which is exactly
what this record cannot have today.

## Related

- [0006](0006-learner-surface-invariants.md) — the invariants IELTS material must also respect.
- [0002](0002-translate-stays-inside-english-studio.md) — the same shape of question, answered
  the same way, for Translate.
- `docs/roadmap.md` — the authorized material expansion.
