# Learner Model — Working Notes

Status: **superseded by `docs/learner-model-design.md`** (approved & implemented 2026-07-21).
Kept as the historical reasoning behind that design; the five open questions in §6 are now
answered there. Read the design doc for what was built.

Captured 2026-07-21 from owner discussion so the reasoning
survives; the actual design doc gets written when this iteration is scoped.

These are the judgements the next iteration should start from rather than re-derive. Where
something was decided, it says so; where it is still open, it says that too.

## 1. Level assessment: never make it a gate

**Decision (owner, 2026-07-21): do not build a placement test as an onboarding step.**

Self-assessment is unreliable — learners systematically over- and under-estimate — but a
quiz sitting in front of a first-time visitor is the worst possible placement for friction.
The resolution is that we do not have to choose:

**Dictation is already a calibrated placement instrument, disguised as practice.** Its
scoring is deterministic, its material carries known CEFR bands, and `passage_stats`
accumulates real accuracy per passage. Two or three dictation passages give a better level
estimate than any self-report or five-minute test. Reading and writing evaluation are
LLM-judged and much noisier by comparison, so they are poor measuring instruments even
though they are good practice.

Intended flow: **let the learner pick a level in one tap (skippable, default B1) → start
practising immediately → the system silently corrects the estimate from real data.**

Corollary worth acting on: dictation is arguably the right *default first activity* for a
new user, not one of five equal cards on `/english`. It needs no microphone, no writing,
gives immediate feedback, and doubles as the measurement. The current landing page presents
all modules as peers, which wastes that.

## 2. Build order: substrate before UI

The modules feel fragmented because they **share nothing underneath**, not because their
shells differ. Fixing the shells first would be visible but hollow — you would have a
consistent frame around tools that still do not know about each other.

Order, in leverage sequence:

1. **Shared material corpus** — done, 2026-07-21 (`docs/material-layer-design.md`).
2. **Shared learner model** — this iteration. Tools write observations, the profile layer
   aggregates.
3. **UI / IA unification** — only then, because that is when it becomes obvious what
   context the shells should actually share.

`docs/english-studio-ia-design.md` §2 defers most IA work for the same reason, with an
additional argument: once recommendations exist, browsing is no longer the primary path, so
designing browse IA ahead of the learner model risks building a secondary surface as the
main one.

## 3. What the learner model owes the material layer

The material layer was built to feed this. Two contracts already exist and should not be
worked around:

- **`passage_tags` is the vocabulary.** A learner weakness must be expressible as a tag name
  from that table. If it is not, the tag vocabulary is wrong and should be fixed in
  `passage-tags.ts` and re-tagged — not patched around in the profile layer. The tagger is
  deterministic and re-runnable precisely so this is cheap.
- **`dictation_attempts.sentence_results`** (raw diff ops) is the stable observation format.
  Minimal and factual by design: raw ops, no interpretations. Changing it means migrating
  attempt rows.

Also relevant: the deterministic diff **measures**, the LLM **interprets**. That division
held for dictation feedback and should hold for the profile layer too — aggregate from the
deterministic data, use a model only to name patterns for the learner.

## 4. Calibration hazard to handle when matching is built

`passage_stats` accumulates now, but this iteration deliberately does not interpret it.
When matching does:

- **Feedback loop.** If easy passages get served to weak learners, their measured accuracy
  drops, making them look harder than they are. Measured difficulty and the population that
  produced it cannot be separated without care.
- **Mixed populations.** Anonymous trial attempts (first-timers, possibly poor recordings)
  are recorded alongside signed-in practice. That was the right call — excluding them throws
  away data and the rows carry no identity — but the matching service should know the mix
  exists. There is currently no field distinguishing trial from regular practice; add one if
  it turns out to matter.

## 5. Material for the other modules

- **Reading** — shares the corpus. Done.
- **Writing** — *not* analogous. Writing material is a **prompt**, not a passage, so it does
  not belong in `passages`. A graded prompt bank is cheap (short text, no TTS) and would
  improve cold start, but it solves a smaller problem: the friction in writing is not
  "I don't know what to write about", it is "writing 250 words is hard". Worth doing, worth
  expecting less from. Owner discussed 2026-07-21; not scoped.
- **Dictation on user-supplied text** — still out of scope, and separately noted on the
  roadmap as the one place runtime generation genuinely earns its keep.

## 6. Open questions for the design doc

1. What are the profile's dimensions, concretely, and do they all map onto `passage_tags`?
2. Where does the profile live — extend `esl_learner_profiles`, or a new table the reading
   profile migrates into? v1 dictation deliberately never touched it.
3. Does the profile update synchronously on attempt, or in a background aggregation pass?
4. Is the unified progress centre the same surface as "what should I practise next", or two?
5. Does self-selected level get stored on the user, and how does a measured estimate
   override it without feeling arbitrary to the learner?
