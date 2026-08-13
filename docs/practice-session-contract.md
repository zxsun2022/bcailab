# Practice Session Contract — Design

Status: **proposed, not authorized.** Written 2026-08-12 after the owner settled the identity
question (option A below). Nothing here is implemented; `docs/roadmap.md` is unchanged.

This closes the gap `docs/english-studio-ia-v2-design.md` §3.2 left open:

> No attempt/article/generation history appears in the rail until "session" has one
> consistent cross-tool contract (identity, resumability and lifecycle).

That rule has been blocking a feature for two iterations because the contract was never
written. This document writes it.

## 1. What is broken, factually

**"Session" is a UI word with no entity behind it.** `sessions` in the schema is the login
table. No practice session table exists. Writing calls one `writing_articles` row a
"session"; Reading and Dictation have no name for the same idea and expose only attempts.

**The single-run level has four user-facing words.** Verified across `apps/web/app`:

| Word | Where |
|---|---|
| attempt | Reading, Dictation |
| revision | Writing — "Each dot is one submitted revision", "New Revision" |
| draft | Writing — "after you submit your first draft" |
| round | Writing internals (64 code references) and one leaked string |

The leak is the clearest evidence that these are not distinct concepts:

> "Finish the latest **round** analysis before starting a new **revision**."

**Two authorized behaviours already contradict each other.** `docs/roadmap.md` specifies for
Writing "repeated attempts as distinct articles" — practising the same prompt twice creates
two containers. Commit `14b4a23` folded Reading/Dictation recents on `(user × passage)` —
practising the same passage twice stays one container. Same product, opposite rules.

## 2. The decision

**Option A (owner, 2026-08-12): a session is one sitting.** Practising the same material
again later starts a new session. This matches the everyday meaning of the word, matches the
Writing behaviour already authorized, and is the only option under which a session row
carries information its attempts do not.

Option B (session = lifetime container per material) was rejected for the second reason: with
attempts already timestamped, a lifetime container is a materialised `GROUP BY` and does not
earn a table.

## 3. Vocabulary

Two words, product-wide, in code, schema, docs and UI:

- **session** — one sitting at one piece of material in one mode. The container.
- **attempt** — one run inside a session: one dictation pass, one recording, one submitted
  piece of writing. Attempts are what get evaluated.

Retired as synonyms for attempt: **round**, **revision**.

**`draft` is kept, with a narrowed meaning.** A draft is unsubmitted text — a state of the
attempt being composed, not a countable noun. "Draft saved — preparing feedback" stays;
"after you submit your first draft" becomes "…your first attempt". The distinction is real
and worth keeping: a draft has no evaluation, an attempt does.

## 4. Identity and lifecycle

### 4.1 Identity

A session is identified by `(user, mode, material, sitting)`. The first three are columns;
the fourth is what the idle rule below decides.

`material` is nullable: freeform writing and Reading's own pasted texts have no library
material. A null material still produces distinct sessions per sitting.

### 4.2 Lifecycle is derived at write time, not scheduled

When an attempt is created, look up the learner's most recent session for the same
`(user, mode, material)`:

- last attempt within `SESSION_IDLE_WINDOW` → join that session
- otherwise, or none exists → open a new one

**There is no background job and no `status` column.** "Open" is not stored; it is
`now - last_attempt_at < SESSION_IDLE_WINDOW`. A closed session is one nothing has been
added to recently. This removes an entire class of failure — no cron, no stuck state, no
reconciliation.

`SESSION_IDLE_WINDOW = 2 hours`, as one named constant.

The value is a judgement, not a measurement: long enough that a coffee break does not split
a sitting, short enough that morning and evening practice are different sittings. **There are
no real users, so this is unvalidated.** Trigger to revisit: the first time real session data
exists, check the distribution of inter-attempt gaps for a bimodal split and move the
constant to the trough. Changing it later is a constant edit plus a backfill re-run (§6),
not a migration.

### 4.3 Resumability

`session_id` is assigned when the attempt row is **created** and never changes.

This matters for Dictation, whose attempts are themselves resumable: an attempt started at
09:00 and finished at 14:00 stays in its original session. The session groups when work
*started*, which is the only reading that keeps `session_id` immutable.

## 5. Schema

```sql
CREATE TABLE practice_sessions (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id),
  mode            TEXT NOT NULL,     -- 'dictation' | 'reading' | 'writing'
  material_id     TEXT,              -- passage or prompt id; NULL for freeform / own text
  started_at      TEXT NOT NULL,
  last_attempt_at TEXT NOT NULL,
  deleted_at      TEXT
);

CREATE INDEX idx_practice_sessions_lookup
  ON practice_sessions(user_id, mode, material_id, last_attempt_at DESC);
CREATE INDEX idx_practice_sessions_recent
  ON practice_sessions(user_id, last_attempt_at DESC) WHERE deleted_at IS NULL;
```

Then, on each attempt table: `session_id TEXT REFERENCES practice_sessions(id)`, on
`dictation_attempts`, `esl_reading_attempts`, and `writing_articles`.

### 5.1 What is stored versus derived

`last_attempt_at` is **stored**, because the write path needs it: every attempt insert asks
"is there an open session?", and that must be one indexed lookup rather than a join and an
aggregate. It is written in the same statement as the attempt.

Attempt count and best score are **derived** at read time. They are bounded, indexed queries,
and a stored counter is a cache that can drift — the same reasoning that keeps the tagger
deterministic and re-runnable rather than storing its opinion
(`docs/learner-model-design.md` §2).

### 5.2 Writing keeps its article, and gains a session

`writing_articles` is not replaced. It keeps the columns only writing needs — title,
`prompt_id`, the immutable assignment snapshot — and gains `session_id` pointing at the
canonical row. One `practice_sessions` table with a `mode` column is the same shape
`learner_tag_observations` already uses for cross-mode data, so this adds no new pattern.

`writing_revisions` becomes writing's attempt table: `round_number → attempt_number`, and
`idx_writing_revisions_article_round_unique` renames with it.

### 5.3 The observation layer is untouched

`learner_tag_observations.attempt_id` keys on the attempt, and attempts are unchanged apart
from a nullable new column. Sessions add a grouping above observations; they do not move,
reshape, or reinterpret any of them. `docs/learner-model-design.md` §10 forward-compatibility
holds unchanged.

## 6. Backfill

Existing attempts have no `session_id`. Reconstruct sessions from history with the same idle
rule: per `(user, mode, material)`, walk attempts oldest-first and start a new session
whenever the gap to the previous attempt exceeds `SESSION_IDLE_WINDOW`. Writing is simpler —
one session per existing article, 1:1, since an article already is a sitting.

The backfill is **deterministic and re-runnable**: it reads immutable attempt timestamps and
writes only `session_id` and session rows. If `SESSION_IDLE_WINDOW` changes, delete the
sessions and re-derive rather than migrating them — the same property the tagger has.

Production currently holds roughly twenty library passages, about fourteen user passages, and
a handful of attempts across two accounts. The backfill's blast radius is small now and will
not be later; this is an argument for doing it in this iteration rather than after launch.

## 7. What this unblocks

IA v2 §3.2 withheld attempt/article/generation history from the product rail until this
contract existed. With identity, lifecycle and resumability defined, that rule's condition is
met and the restriction can be revisited on its own merits — **but that is a separate
decision, not a consequence.** `ToolNavRail` still has no list slot, and the argument that
the rail answers "where can I go?" while the workspace answers "what can I do here?" is
untouched by this document.

## 8. Correction required in shipped code

Commit `14b4a23` folds recent lists on `(user × passage)` — option B semantics. Under option A
the fold key becomes `session_id`, and the row's "3 attempts · best 75" becomes per-session
rather than per-material. The deduplication itself was right and stays; only the grouping
boundary moves.

## 9. Implementation order

Each step is independently verifiable and leaves the product working.

1. **Migration + backfill.** New table, three nullable `session_id` columns, backfill script
   under `scripts/`. Nothing reads sessions yet.
2. **Write paths.** Attempt creation resolves or opens a session. Verify by practising the
   same passage twice inside and outside the window.
3. **Read paths.** Recent lists on Home, Reading and Dictation fold on `session_id` (§8).
4. **`round → attempt` rename.** Column, index, and the 64 code references. No user-visible
   change; it is internal vocabulary catching up.
5. **UI copy sweep.** §3's two words, everywhere. Inventory below.
6. **Doc sync.** IA v2 §3.2, `docs/architecture.md`, `docs/changelog.md`.

### 9.1 UI copy inventory for step 5

| Current | Becomes |
|---|---|
| "Each dot is one submitted revision. Click to view." | …one submitted attempt… |
| "New Revision" | "New attempt" |
| "Finish the latest round analysis before starting a new revision." | …the latest attempt's analysis before starting a new attempt. |
| "after you submit your first draft" | "after you submit your first attempt" |
| "The assignment is saved only when you submit this first draft." | …this first attempt. |
| "Freeform session" / "Assignment session" | unchanged — these are sessions |
| "Draft saved — preparing feedback" | unchanged — draft is a state (§3) |

## 10. Decisions that need the owner's yes

1. `SESSION_IDLE_WINDOW = 2 hours` (§4.2) — the one unvalidated number here.
2. Writing keeps `writing_articles` alongside a session row (§5.2), rather than collapsing
   the two tables.
3. Attempt count and best score derived rather than stored (§5.1).
4. Whether step 4's rename is worth a migration for zero user-visible change, or whether
   `round_number` stays as a historical column name with the vocabulary fixed only in new
   code and UI.
