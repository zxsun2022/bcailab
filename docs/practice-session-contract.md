# Practice Session Contract — Design (rev 2) — NOT ADOPTED

> **Status: rejected exploration.** The owner decided on 2026-08-12 not to introduce the
> sitting concept and not to build a cross-tool `practice_sessions` entity. Each tool keeps
> its native model: Reading and Dictation centre on material and attempts, Writing on a
> durable workspace with Draft and Round. Recent lists continue to aggregate by material.
>
> **The decision and its reasoning are
> [ADR 0007](decisions/0007-no-cross-tool-practice-session-entity.md). Read that first.**
> This file is kept for the investigation it contains, not as a plan. Nothing below is
> authorized, and §10's open questions are closed by the decision not to build.
>
> Three findings here outlived the proposal and are worth knowing before touching this area:
> **Round is roadmap-authorized Writing vocabulary**, not drift (§0.1); **Draft names a
> saved-but-unevaluated state**, not a rival unit (§0.2); and **Reading's pasted texts have
> real `passages.id` material identity** (§0.3).
>
> If a consumer ever needs sittings — a session-history surface, or ia-v2 §6.4's planning
> layer — start from §0, §3.3 and §5 here; only the "no consumer" objection will have
> expired.

Rev 1 (2026-08-12, commit `34484fb`) was reviewed the same day by a second tool (Codex) at
the owner's request; the review invalidated several of rev 1's factual claims and two of its
design decisions. This revision incorporated what survived verification.

The gap this proposal set out to close, in `docs/english-studio-ia-v2-design.md` §3.2:

> No attempt/article/generation history appears in the rail until "session" has one
> consistent cross-tool contract (identity, resumability and lifecycle).

That precondition is now permanently unmet by choice (ADR 0007), so the rail stays
navigation-only on its own merits rather than on this gap.

## 0. What rev 1 got wrong (verified against code, 2026-08-12)

Recorded because this repo's docs are how tools hand work to each other; a correction that
is not written down gets re-litigated.

1. **"Round" is not a leak — it is authorized vocabulary.** `docs/roadmap.md` (Writing hub
   item): "Use **Session** for one durable Writing workspace and **Round** for a revision
   inside it." The UI uses it deliberately: "Feedback from Round {n}"
   (`writing.$id.tsx:578`), "Viewing Round {n} of {m}" (`:724`). Rev 1's survey missed these
   because its regex could not see template interpolation. Consequence: rev 1's "retire
   round" instruction contradicted an owner-authorized vocabulary.
2. **"Draft" does not mean unsubmitted.** "Draft saved — preparing feedback" renders on a
   *persisted, submitted* revision whose `feedback_status` is `pending`. Rev 1's narrowed
   definition (draft = unsubmitted text) is falsified by the very string it cited as
   compatible.
3. **Reading's own texts have material identity.** User-pasted texts are rows in `passages`
   (migration 0012, "User-created reading passages"). Rev 1 claimed their material is NULL;
   only freeform writing genuinely lacks a material row.
4. **The Writing schema decision was self-contradictory.** Rev 1 defined session = sitting,
   then attached `session_id` to `writing_articles` 1:1. An article with Round 1 on Monday
   and Round 2 on Wednesday spans two sittings; one column on the article cannot say so.
5. **Immutability and re-derivation contradicted each other** ("`session_id` never changes"
   vs "delete the sessions and re-derive when the window changes"), and "written in the same
   statement" is impossible across two tables — atomicity was asserted, not designed.
6. Metric hygiene: the round count is **64 grep lines**, not 64 references; a line can carry
   several.

## 1. The model: two layers, not one

The Writing conflict in §0.4 dissolves once the two ideas rev 1 conflated are separated:

- **Workspace** — a durable container for work on one piece. Writing has this today:
  `writing_articles`, carrying the title, the prompt reference, the immutable assignment
  snapshot. It lives as long as the learner keeps returning to it. Reading and Dictation
  have no workspace entity and do not need one — their durable container is the passage
  itself.
- **Session** — one *sitting*: a bounded stretch of practice. Owner decision (option A,
  2026-08-12): practising the same material again later is a new session. A workspace can
  span many sessions.
- **Attempt** — one evaluated run inside a session: a dictation pass, a recording, a
  submitted revision.

So for Writing: `writing_articles` = workspace, `writing_revisions` = attempts, and the
sitting association belongs **on the revision**, not the article. For Reading and Dictation
the attempt tables (`esl_reading_attempts`, `dictation_attempts`) associate the same way.

## 2. Vocabulary

Canonical terms for the data layer, schema, docs, and any cross-tool surface (Home,
Progress): **session** (sitting), **attempt** (evaluated run), **workspace** (durable
container, where one exists).

**Mode-local surface vocabulary is permitted** where the owner has authorized it. Writing's
UI keeps **Round** for its attempts — it is roadmap-authorized, live in the UI, and a domain
word learners see numbered ("Round 2 of 3"). The data layer still treats a revision as an
attempt; the two claims are compatible because one names a row's role and the other names
what the learner sees.

**One genuine collision remains, and only the owner can settle it (§10.1):** the roadmap
gives Writing's UI "Session" *as the workspace word*, while this contract makes "session"
mean a sitting product-wide. The same word cannot mean a durable container in Writing and a
bounded sitting everywhere else. The options are renaming Writing's surface word (e.g.
"piece") or renaming the cross-tool entity; this document deliberately does not choose.

**Draft** stays, defined by what the code already means by it: the learner's text as a saved
work product whose feedback has not (yet) arrived. It is a state, not a countable practice
unit; nothing counts "3 drafts".

The one string that mixes synonyms — "Finish the latest round analysis before starting a new
revision." — should say Round twice. That is a copy fix, not a vocabulary reform.

## 3. Identity and lifecycle

### 3.1 Identity

A session is `(user, mode, material, sitting)`. `material` is a `passages.id` for Reading
and Dictation (including user-pasted texts, per §0.3), a `writing_prompts.id` for assigned
writing, and NULL only for freeform writing — where each sitting still forms its own
session.

### 3.2 The idle rule, derived at write time

When an attempt is created, resolve against the learner's most recent session for the same
`(user, mode, material)`:

- `now − last_attempt_at < SESSION_IDLE_WINDOW` → join it
- otherwise → open a new one

No background job, no `status` column: "open" is a comparison, not a state. This removes the
stuck-state/reconciliation failure class entirely.

`SESSION_IDLE_WINDOW = 2 hours`, one named constant. A judgement, not a measurement — there
are no real users to measure. Revisit trigger: first real data, look for a bimodal gap
distribution, move the constant to the trough.

**`last_attempt_at` tracks activity, not merely creation.** It is bumped when an attempt is
created *and* when one completes. This is for Dictation, whose attempts are resumable over
hours: if only creation counted, finishing a long attempt and immediately starting the next
would wrongly open a new session.

### 3.3 Atomicity and races

Session resolution and attempt insert run in **one D1 `batch()`** (atomic, rolls back
together): resolve-or-create the session row, insert the attempt with its `session_id`, bump
`last_attempt_at`. Concurrent inserts for the same learner can still race between resolve
and create and yield two sessions for one sitting. This is **accepted, not prevented**: the
outcome is benign (a split sitting, no data loss), a uniqueness constraint cannot express
"within a time window", and re-derivation (§5) merges such splits. The race is documented
here so nobody adds a lock for it later.

### 3.4 Assignment stability

`session_id` on an attempt does not change **in normal operation** — no request path updates
it. It is *derived data*, though, and §5's re-derivation (window change, split-merge) may
rewrite it as an explicit bulk rebuild. Rev 1 called this column immutable and was wrong to;
the honest contract is "stable except under re-derivation, which is an offline rebuild, not
an update path". Consumers must key long-lived references (bookmarks, observations) on
attempts — which genuinely are immutable — never on sessions.

## 4. Schema

```sql
CREATE TABLE practice_sessions (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id),
  mode            TEXT NOT NULL,     -- 'dictation' | 'reading' | 'writing'
  material_id     TEXT,              -- passages.id / writing_prompts.id; NULL = freeform
  started_at      TEXT NOT NULL,
  last_attempt_at TEXT NOT NULL,     -- bumped on attempt creation and completion (§3.2)
  deleted_at      TEXT
);

CREATE INDEX idx_practice_sessions_lookup
  ON practice_sessions(user_id, mode, material_id, last_attempt_at DESC);
CREATE INDEX idx_practice_sessions_recent
  ON practice_sessions(user_id, last_attempt_at DESC) WHERE deleted_at IS NULL;
```

`session_id TEXT REFERENCES practice_sessions(id)` — nullable — on the three **attempt**
tables: `dictation_attempts`, `esl_reading_attempts`, `writing_revisions`. Each gets an
index on `session_id`. **`writing_articles` is untouched** (§1): it is the workspace, not
the session.

Counts and best scores are **derived at read time** — bounded, indexed queries; a stored
counter is a cache that can drift (`docs/learner-model-design.md` §2's reasoning). The
observation layer is untouched: `learner_tag_observations.attempt_id` keys on attempts,
which gain only a nullable column.

## 5. Backfill and rollout order

Rollout order matters more than rev 1 allowed; its "backfill, then write paths" left a
deploy window minting new NULLs. Correct order:

1. **Schema** — nullable columns, new table. Nothing reads or writes sessions.
2. **Dual-write** — attempt creation resolves/opens sessions (§3.2–3.3). New rows carry
   `session_id`; old rows are NULL.
3. **Backfill** — script under `scripts/` derives sessions for NULL rows: per
   `(user, mode, material)` walk attempts oldest-first, splitting where the gap exceeds the
   window. **Writing backfills by the same rule over revisions** — not 1:1 per article,
   which was rev 1's option-B leftover.
4. **Reconcile** — assert zero NULL `session_id`, re-run backfill for stragglers written by
   not-yet-deployed code.
5. **Reads** — only now may consumers use sessions.

The backfill is deterministic and re-runnable from immutable attempt timestamps — the
tagger's property. Production holds a handful of attempts across two accounts; the blast
radius argument for doing this early still stands.

## 6. The missing consumer, and the honest minimal alternative

The review's sharpest point: **sessions currently have no navigable identity and no
consumer.** If recent lists folded by `session_id` but still linked `/reading/:passageId`,
three sittings on one passage would again render three identical links — the exact defect
`14b4a23` fixed. Writing already addresses attempts via `?round=`; an equivalent
(`?session=` filtering the history rail, or a session detail surface) must be designed
*with its consumer*, not speculatively here.

Until such a consumer is authorized, the shipped material-level fold is **correct as-is** —
its rows honestly answer "what material was I working on?", they just should not be labelled
sessions. Rev 1's §8 ("correction required in shipped code") is withdrawn: relabel, don't
refold.

This creates a real option the owner should weigh (§10.4): **defer the entire entity** until
a consumer exists (session history surface, or the planning layer in ia-v2 §6.4), and ship
only the relabel now. The contract above loses nothing by waiting; attempts carry the
timestamps it derives from.

## 7. What this unblocks — and does not

With identity, lifecycle and resumability defined, ia-v2 §3.2's precondition for rail
history is met. Whether the rail *should* carry history is a separate decision; the
rail-answers-"where", workspace-answers-"what" argument is untouched.

## 8. Implementation order

§5's five steps, then: the copy fix from §2 (the round/revision mixed string), then the UI
copy sweep — which now **preserves Round** in Writing and touches only genuine synonym drift
("New Revision" → "New Round" or per §10.1's outcome; "submitted revision" → "submitted
round"). `round_number` the column is **not renamed** (§10.5).

## 9. Acceptance criteria (for the owner to ratify with authorization)

- Same passage practised twice inside the window → one session, two attempts; outside → two
  sessions. Verified for all three modes.
- A resumed dictation attempt completed hours later keeps its `session_id`, and completing
  it bumps `last_attempt_at` (§3.2).
- Backfill: zero NULL `session_id` after step 4; re-running is a no-op; Writing revisions
  Monday/Wednesday on one article yield two sessions.
- No consumer reads sessions until step 5 (grep-verifiable).
- Observation rows and their aggregation outputs are byte-identical before and after.

## 10. Decisions that need the owner's yes

1. **The "Session" word collision (§2).** Writing's authorized UI word for the *workspace*
   vs this contract's *sitting*. Rename one; which? This also supersedes the owner's earlier
   in-chat "rename round → attempt" — Round stays in Writing's UI per the review's argument,
   unless the owner re-confirms the rename against their own roadmap authorization.
2. `SESSION_IDLE_WINDOW = 2h`, with `last_attempt_at` bumped on creation *and* completion.
3. Counts/best derived, never stored.
4. **Build now vs defer until a consumer exists (§6).** Deferring costs nothing
   technically; building now front-loads the backfill while production data is tiny.
5. `round_number` stays as a column name — vocabulary is fixed at the boundaries (UI, new
   code), not by migrating a working schema for zero user-visible change.
