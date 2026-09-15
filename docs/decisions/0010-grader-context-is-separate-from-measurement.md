# 0010 — Grader context is a separate layer from measurement

**Status:** Accepted · **Date:** 2026-09-15 · **Origin:** owner decision on
`docs/learner-context-proposal.md`

## Context

Every English Studio grader remembers an object rather than a learner. The Reading evaluator sees
the history of one passage, Writing feedback sees the rounds of one session, and Dictation feedback
sees only the attempt in front of it. Writing — the mode with the richest feedback — contributes
nothing to the shared learner layer, and the only cross-mode input any grader receives is at most
eight short profile phrases given to the Reading evaluator. The owner raised this on 2026-09-14 as
learning records going unused and grader data staying isolated per exercise; the proposal verified
it in code.

The cause is not a defect in the learner model. That model is a measurement system built under
`docs/learner-model-design.md` §2 — *the deterministic layer measures, the LLM interprets* — and it
correctly requires a vocabulary before evidence may enter. Grader context was never designed as a
layer of its own, so measurement's admission rule became context's admission rule by default, and
everything without a vocabulary had no path to any other grader.

## Decision

**What a grader is told about the learner is a separate layer from what the system measures about
the learner, and it has its own rules.**

Measurement is unchanged. Observations need a vocabulary, LLM-derived rows are down-weighted, and a
model names patterns without deciding them.

Grader context:

- is **derived per call and never stored** — it is re-derivable as of any past evaluation from
  timestamped source rows;
- may carry deterministic aggregates **and earlier coach feedback, labelled as earlier AI
  judgement**, so it needs no vocabulary;
- is given to a grader as material for prioritising and connecting what it observes, **never as
  grounds to add an issue, a highlight, or a score**;
- is **never written back as a measurement**.

Every grader that receives context does so under these rules:

1. Signed-in learners only; trials receive nothing.
2. Deleted work is excluded, including rounds that a deleted Writing session retains for recovery.
3. **Saved translations are excluded.** Saving is an explicit bookmark, not consent to become
   evidence; revisit only with an explicit per-item control.
4. A null level reaches a grader as "not established", never as B1 — ADR 0006 applied to prompts.
5. **Context is extended to a grader whose output becomes observations only after an anchoring
   measurement shows the context does not bias that output.** Today that grader is Reading.
6. Context content is never logged.

## Alternatives considered

**Keep context behind measurement, waiting for each mode's vocabulary.** Rejected. Writing's
vocabulary is blocked on genuine measurement problems — no reference text to count exposure
against, and grader recall inflating mastery — so Writing would stay invisible to every other grader
for as long as those remain unsolved. That is the isolation this record exists to end, and a coach
does not need calibrated numbers to make use of earlier feedback.

**Store a model-written summary of the learner as memory.** Rejected. It is the "LLM's opinion of
the learner" that `docs/learner-model-design.md` §2 rules out: it drifts between calls, cannot be
recomputed, and would put unmeasured judgement where the product shows measurement.

**Give graders tool access to the learner's history.** Rejected on ADR 0005's grounds: there is
nothing to iterate against, and a loop adds latency and variance to the call. A bounded,
deterministic brief carries the same information and can be tested.

**Store each assembled brief.** Rejected. It is re-derivable, and a stored copy is one more thing
deletions would have to reach.

## Consequences

- Writing's feedback can inform Dictation feedback and the learner's other Writing sessions without
  waiting for a Writing vocabulary.
- Rollout follows contamination risk: Dictation feedback and Writing first, because neither writes
  observations; Reading last, behind rule 5.
- The Reading evaluator's existing `persistent_issues` injection predates this record. It is
  measured with the same anchoring spike, and what follows from a failing result is the owner's
  decision.
- A new grader or mode joins context by adding a projection, not a schema.
- Being admissible as context does not make a signal admissible as measurement. Folding Reading's
  `cefr_guess` into the CEFR estimate, a Writing vocabulary, or a promoted `SOURCE_WEIGHT` each
  remains a measurement change with its own evidence bar.

## Revisit when

- An LLM-judged signal is promoted to formal measurement (roadmap Later). The line between earlier
  coach feedback and measurement then moves, and rule 5 needs re-examining.
- The anchoring measurement fails for a grader whose output becomes observations, and neither
  fallback in the proposal's §5 contains it.

## Related

- `docs/learner-context-proposal.md` — evidence, design, and staging.
- `docs/learner-model-design.md` §2 — the measurement rule this record leaves intact.
- [0005](0005-reading-grader-stays-single-call.md) and
  [0007](0007-no-cross-tool-practice-session-entity.md) stand unchanged;
  [0006](0006-learner-surface-invariants.md) is applied to prompts by rule 4.
- `docs/roadmap.md` — *Now — Learner context for graders*.
