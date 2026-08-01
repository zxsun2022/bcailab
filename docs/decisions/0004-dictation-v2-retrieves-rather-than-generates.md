# 0004 — Dictation v2 retrieves from a library rather than generating per request

**Status:** Accepted · **Date:** 2026-07-20 (owner confirmed) · **Origin:** `docs/roadmap.md` (Later)

Supersedes the earlier "dynamic per-user generation" framing of Dictation v2.

## Context

Dictation v2 aims at level-adaptive material. The original framing generated material per user
at request time. That was revised.

## Decision

Elevate `learner_profile` into a shared learner-model layer — tools write observations, the
profile layer aggregates — and then **retrieve** from a large pre-generated, tagged material
library instead of generating per request.

The LLM's job is assessing the learner and interpreting error patterns, not producing material
at request time.

## Alternatives considered

Dynamic per-user generation at request time (the earlier framing). Rejected for the three
reasons below.

## Consequences

- A fixed item bank can be **empirically calibrated** from real accuracy data — every passage
  accumulates a sample. Generated-once material never can.
- **TTS cost is paid once** and amortized across all users, rather than per session.
- Retrieval is a D1 query rather than a multi-second generate-then-synthesize round trip.
- The owner's per-passage review stays in the loop.
- Work shifts from generation to: a dimensional tag schema shared by library and learner
  profile, a matching policy, and growing the library.
- Reading and Writing migrate to the same interface gradually — an interface migration, not a
  rewrite.

## Where it attaches

Recorded 2026-07-27: IA v2 Phase 2 built `selectStarterPractice()`, a pure function returning
recommended actions with reasons. Matching replaces that function and inherits its callers, so
the Home renders whatever the seam returns and no IA change is needed. The session/planning
layer is the next tenant on the same seam.

## Related

Prerequisites, both delivered: the shared learner model (2026-07-21) and Dictation v1. See
`docs/changelog.md`, and the designs in `docs/learner-model-design.md` and
`docs/material-layer-design.md`.
