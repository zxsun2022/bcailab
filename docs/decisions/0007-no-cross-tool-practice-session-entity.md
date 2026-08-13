# 0007 — No cross-tool practice session entity; each tool keeps its native model

**Status:** Accepted · **Date:** 2026-08-12 · **Origin:** `docs/practice-session-contract.md`

## Context

A recent-practice list on Home rendered three rows for one passage, because it listed raw
attempts. The rows' `href`s were byte-for-byte identical — three slots spent on one
destination. Folding them (commit `14b4a23`) fixed the surface defect and raised a modelling
question: what is the thing a folded row represents?

That question exposed genuine incoherence. "Session" was a UI word with no entity behind it
(`sessions` in the schema is the login table). The single-run level carried four user-facing
words across the product — attempt, revision, draft, round. And two authorized behaviours
disagreed: the roadmap gave Writing "repeated attempts as distinct articles" while the new
fold grouped Reading and Dictation on `(user × passage)`.

`docs/practice-session-contract.md` was written to resolve this by introducing a *sitting* —
a bounded stretch of practice, closed by an idle window — as one cross-tool
`practice_sessions` table. It went through two revisions, the second after an external review
found five defects in the first, all of which were verified against code and held.

## Decision

**Do not introduce the sitting concept. Do not build a cross-tool `practice_sessions`
entity.** Each tool keeps its native model:

- **Reading and Dictation** — centred on material and attempts. There is no container
  between them.
- **Writing** — centred on a durable workspace (`writing_articles`, surfaced as *Session*)
  containing *Draft* and *Round*, exactly as `docs/roadmap.md` already authorizes.

Recent lists continue to aggregate by material. Commit `14b4a23` stands; its rows honestly
answer "what material was I working on?".

Only one copy defect is fixed: Home labelled an attempt counter "recorded sessions".

## Why

The entity had **no consumer**. Sessions would have had no navigable identity — a list
folded by session but still linking `/reading/:passageId` would have re-created the exact
identical-link defect `14b4a23` had just removed. Nothing in the product was waiting to read
a session row.

Against that, the cost was concrete and entirely additive: a two-hour idle window with no
data to calibrate it, resumable-attempt semantics for Dictation, an accepted-but-documented
write race, a five-step dual-write and backfill rollout, and a navigable-identity design that
did not yet exist. Complexity that buys a real capability is worth arguing about; complexity
that buys a cleaner noun is not.

The revision process also surfaced that the incoherence was smaller than it first looked.
Round is not vocabulary drift — it is roadmap-authorized Writing domain vocabulary, live in
the UI ("Feedback from Round {n}"). Draft is a legitimate state, not a rival unit. What
remained was one mislabelled counter.

Deferring costs nothing. Attempts carry the timestamps any future sitting model would derive
from, so this can be revisited without migrating anything.

## Alternatives considered

**Build the entity now, while production data is tiny.** The backfill's blast radius is
genuinely smaller today than it will ever be again. Rejected because it optimises the cost of
building the wrong thing early rather than the risk of not needing it — and because a
first-class entity with no reader tends to accrete speculative consumers.

**Keep the sitting concept but derive it in queries rather than storing it.** Avoids the
table and the backfill, but keeps the uncalibrated window and still lacks a navigable
identity. It buys the same nothing more cheaply.

**Unify vocabulary to two words (session, attempt) product-wide without the entity.** This
was the second revision's fallback. Rejected because it would overturn the roadmap's
authorized Writing vocabulary (*Session* for the workspace, *Round* for a revision) to serve
consistency the learner never asked for. Mode-local domain vocabulary is a feature.

## Revisit when

A consumer genuinely needs sittings: a session-history surface, or the planning/session
composition layer in `docs/english-studio-ia-v2-design.md` §6.4 ("today's session"). At that
point `docs/practice-session-contract.md` rev 2 is the starting point — its §0 corrections,
§3.3 race analysis, and §5 rollout order remain sound; only the "no consumer" objection will
have expired.

Note that this decision does **not** re-open ia-v2 §3.2, which withholds history from the
product rail until a session contract exists. That precondition is now permanently unmet by
choice, so the rail stays navigation-only on its own merits.
