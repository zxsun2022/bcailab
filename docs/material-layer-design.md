# Material Layer — Technical Design

Status: **draft for owner review, not yet approved.**
Scope source: `docs/roadmap.md` → Now iteration (scoped 2026-07-21).
Intended reader: the AI agent (or human) implementing this. Follow this doc; where it
delegates a decision, it says so. §13 lists the questions that still need the owner.

## 1. Why now

Dictation and Reading both consume graded English passages, but they store them in two
unrelated tables: `dictation_passages` (global content, banded, with per-sentence audio)
and `esl_passages` (per-user, ungraded, with optional whole-passage reference audio).
They are the same thing in two shapes.

Unifying them is cheap **today** and gets more expensive every week:

| | now (2026-07-21) | after one扩库 round |
|---|---|---|
| Global passages | 20 | several hundred |
| Sentence rows + R2 objects | 211 | thousands |
| User passages | 14 | grows with signups |
| Reading attempts | 39 | grows with usage |

The decision to build Dictation v2 as *matching against a pre-generated library* rather
than runtime generation (roadmap, 2026-07-20) makes this layer the foundation for
everything after it: level-based onboarding, the shared learner model, and the unified
progress center all read from it.

## 2. Scope

**In scope:**

- A unified `passages` / `passage_sentences` schema that serves both listening (dictation)
  and reading-aloud practice from one row.
- A **deterministic** tagger that derives difficulty metrics and practice-feature tags
  from passage text, plus the tag vocabulary itself (§5) — the single most consequential
  decision in this design.
- Per-passage empirical statistics so the library's difficulty labels can be corrected by
  real learner data (§6).
- Migration of the 20 existing dictation passages (§7).
- Reading gains a graded global library: signed-in users can practice library passages,
  not only their own. The anonymous reading trial stops using a hardcoded constant and
  reads a library row instead.
- Seed pipeline produces both per-sentence audio (dictation) and whole-passage reference
  audio (reading) for global passages.

**Non-goals — do not build these here:**

- The matching service itself (learner → passage). This iteration produces the *inputs*
  matching needs; matching is the next iteration.
- The shared learner model / unified progress center.
- Onboarding and level self-selection.
- Migrating user-owned `esl_passages` into the new table (§7 phase 2, deliberately
  deferred — see the reasoning there).
- Dictation on user-supplied text (still out of scope; owner decision 2026-07-20).
- Writing prompt bank. Writing material is a *prompt*, not a passage; it does not belong
  in this schema and its value is smaller (owner discussion 2026-07-21). Separate item.

## 3. System overview

```
offline (scripts/material-seed/)        runtime
──────────────────────────────────      ─────────────────────────────────────
LLM: write passages       ──review──►   D1: passages          (global + user)
deterministic tagger      ──derive──►       passage_tags      (feature counts)
Google TTS: per-sentence  ──upload──►       passage_sentences (dictation audio)
Google TTS: whole passage ──upload──►   R2: material/{id}/…
                                        passage_stats  ◄── attempts (calibration)

                                        /dictation  ──┐
                                        /reading    ──┴─► same passage rows
```

One passage row can be **dictation-capable** (has `passage_sentences` with audio),
**reading-capable** (has reference audio), or both. Global library passages are both.
User-created passages are reading-capable only.

## 4. Data model (migration `0012_material_layer.sql`)

Follow existing conventions: TEXT uuid ids, `created_at TEXT DEFAULT (datetime('now'))`,
soft delete via `deleted_at`, snake_case, query helpers in `packages/db/src/index.ts`.

```sql
CREATE TABLE passages (
  id TEXT PRIMARY KEY,
  -- NULL = global library content. Non-NULL = user-created (reading only).
  user_id TEXT REFERENCES users(id),
  title TEXT NOT NULL,
  content_text TEXT NOT NULL,
  band TEXT,                       -- 'A2' | 'B1' | 'B2' | 'C1'; NULL for untagged user text
  topic TEXT,
  -- Objective metrics, computed by the tagger (§5). Denormalized for cheap filtering.
  word_count INTEGER NOT NULL DEFAULT 0,
  sentence_count INTEGER NOT NULL DEFAULT 0,
  mean_sentence_words REAL NOT NULL DEFAULT 0,
  rare_word_ratio REAL NOT NULL DEFAULT 0,   -- share outside the top-2000 frequency list
  -- Capability flags, set when the corresponding asset exists.
  has_sentence_audio INTEGER NOT NULL DEFAULT 0,
  reference_audio_r2_key TEXT,
  reference_audio_bytes INTEGER,
  reference_voice_name TEXT,
  status TEXT NOT NULL DEFAULT 'published',  -- 'draft' | 'published'
  source TEXT NOT NULL DEFAULT 'library',    -- 'library' | 'user'
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

-- The only index matching will actually use; user listing gets its own.
CREATE INDEX passages_library_idx ON passages(band, status, deleted_at)
  WHERE user_id IS NULL;
CREATE INDEX passages_user_idx ON passages(user_id, created_at DESC);

CREATE TABLE passage_sentences (
  id TEXT PRIMARY KEY,
  passage_id TEXT NOT NULL REFERENCES passages(id),
  idx INTEGER NOT NULL,
  text TEXT NOT NULL,
  r2_key TEXT,                     -- NULL until audio is synthesized
  audio_bytes INTEGER,
  UNIQUE (passage_id, idx)
);

-- Feature tags with counts, not booleans — density is what matching needs (§5).
CREATE TABLE passage_tags (
  passage_id TEXT NOT NULL REFERENCES passages(id),
  tag TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (passage_id, tag)
);
CREATE INDEX passage_tags_tag_idx ON passage_tags(tag, count DESC);

-- Empirical difficulty, updated as attempts land (§6). Separate table so the hot
-- passages row is not rewritten on every attempt.
CREATE TABLE passage_stats (
  passage_id TEXT PRIMARY KEY REFERENCES passages(id),
  mode TEXT NOT NULL DEFAULT 'dictation',  -- stats are per practice mode
  attempt_count INTEGER NOT NULL DEFAULT 0,
  accuracy_sum REAL NOT NULL DEFAULT 0,     -- mean = accuracy_sum / attempt_count
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

Note `passage_stats.mode` is in the primary key conceptually — a passage has separate
difficulty for listening vs reading aloud. **Implementer: make the PK `(passage_id, mode)`**;
the sketch above is wrong on that point and the migration should correct it.

## 5. Tagging — the decision that must not be wrong

This is the part worth arguing about, because the tag vocabulary is a **contract with the
future learner model**: a tag is only useful if the learner profile can hold a matching
weakness. Getting it wrong means re-tagging the whole library later.

### 5.1 Two layers, kept separate

**Difficulty** answers *"is this too hard?"* — one CEFR band plus the objective metrics on
the `passages` row (word count, mean sentence length, rare-word ratio). Skill-agnostic.

**Features** answer *"what does this give practice on?"* — `passage_tags`, per-skill,
with counts.

Do not collapse these. A passage can be easy but dense in a feature the learner is weak
on; that is exactly the material matching should prefer.

### 5.2 Deterministic first

**Tags must be derived from the text by code wherever possible, not guessed by an LLM.**
Same reasoning as the scoring module and the calibration argument: deterministic tagging
is reproducible, free, re-runnable over the whole library when the vocabulary changes, and
cannot drift between batches. An LLM asked "does this passage practice weak forms?" gives
a different answer on Tuesday.

Reserve the LLM for what genuinely needs judgment: `topic`, register, and the initial band
proposal (which empirical stats will later correct anyway).

### 5.3 Proposed vocabulary

Grounded in signals the tools already produce, so every tag has a corresponding
observable weakness:

| Tag | Derivation | Corresponding signal |
|---|---|---|
| `contraction` | regex on `n't`, `'ll`, `'re`, `'ve`, `'d`, `'s` | dictation: written-out contractions |
| `weak_form` | function-word list (`a`, `of`, `to`, `for`, `at`, `and`, `than`) | dictation: `delete` ops on function words |
| `third_person_s` | verb-final `-s` after a singular subject (POS-free heuristic) | dictation LLM pattern; observed 2026-07-20 |
| `plural_s` | noun-final `-s`/`-es` | same |
| `past_ed` | `-ed` endings | same |
| `article` | `a` / `an` / `the` counts | dictation: dropped articles |
| `homophone` | lookup against a curated homophone set | dictation: `substitute` ops |
| `number_words` | number-word list (`twenty-five`, `third`…) | dictation: transcription errors |
| `th_sound` | words containing `th` | reading: `mispronunciation` highlights |
| `consonant_cluster` | 3+ consonant runs (`strengths`, `twelfths`) | reading: `mispronunciation` |
| `long_sentence` | sentences over ~18 words | reading: `pause`, `stress` highlights |
| `question` | `?` count | reading: `intonation` highlights |
| `linking` | word-final consonant → word-initial vowel boundaries | reading: fluency |

Counts, not booleans — matching normalizes by `word_count` to get density.

This vocabulary is **deliberately small and extensible**: `passage_tags` is key/value, so
adding a tag later means re-running the tagger, not migrating a schema. That is the main
reason for a tag table rather than columns on `passages`.

### 5.4 Re-runnability is a requirement

The tagger must be a pure module (`apps/web/app/utils/passage-tags.ts`, no server or DOM
deps) with vitest coverage, and there must be a script that re-tags the entire library.
Assume the vocabulary will change.

## 6. Empirical calibration

`passage_stats` accumulates `attempt_count` and `accuracy_sum` per (passage, mode). This
is the payoff for choosing a fixed item bank over per-request generation: after enough
attempts, mean accuracy is a **measured** difficulty that can correct an LLM-assigned band.

This iteration only **records** the statistics — it does not act on them. Deciding when a
measured difficulty overrides a declared band, and how to avoid feedback loops (easy
passages get served to weak learners, which lowers their measured accuracy), is a matching
concern and belongs to the next iteration. Recording now means the data is already
accumulating when matching arrives.

Write path: dictation's completion action and the reading evaluation both increment. Both
already run at a point where the score is known.

## 7. Migration

**Phase 1 (this iteration): global content only.**

- Create the new tables.
- Copy `dictation_passages` → `passages` (`user_id NULL`, `source='library'`) and
  `dictation_sentences` → `passage_sentences`, preserving ids so existing R2 keys and any
  bookmarked URLs keep working.
- Run the tagger over all 20 passages.
- Point dictation's queries at the new tables. Drop the old tables in a later migration,
  not this one — keep a rollback path for one release.
- Reading reads library passages from `passages WHERE user_id IS NULL`.

**Phase 2 (deferred, deliberately): user passages.**

`esl_passages` has three attempt/evaluation tables and reference-TTS columns hanging off
it. Migrating it means rewriting foreign keys on live data for 14 passages and 39
attempts — real risk for no user-visible gain, because **user passages are never matched**
(the user chose them; there is nothing to match).

The value of unification is in the *global* corpus, and phase 1 captures all of it. Phase 2
becomes worthwhile only if user passages need tagging or library-style browsing. Leave
`esl_passages` alone until then, and record it as a known duplication rather than pretending
it is finished.

The anonymous reading trial's hardcoded passage constant (`reading-trial.ts`) is replaced
by a library row flagged for trial use — a small cleanup that phase 1 makes possible.

## 8. Routes & UI

| Route | Change |
|---|---|
| `/dictation`, `/dictation/:id` | Data source only; behaviour unchanged. |
| `/reading` | Gains a library section: graded global passages alongside the user's own. |
| `/reading/:id` | Must accept a library passage id, not only a user-owned one. |
| `/reading/trial` | Reads a library row instead of the code constant. |

Reading's passage list currently assumes ownership (`listEslPassagesByUser`). The loader
needs to merge two sources and the practice page must authorize both cases: *owned by me*
**or** *global library*. Getting that predicate wrong leaks another user's passage — it is
the one security-sensitive change in this iteration and deserves a test.

## 9. Seed pipeline

`scripts/dictation-seed/` becomes `scripts/material-seed/` and gains:

- whole-passage reference audio synthesis (for reading), alongside per-sentence clips
- a tagging step that writes `passage_tags`
- a `retag` command that re-runs the tagger over the existing library without touching audio

R2 layout moves from `dictation/{passageId}/{idx}.mp3` to `material/{passageId}/sentences/{idx}.mp3`
plus `material/{passageId}/reference.mp3`. **Existing objects keep their old keys** — the
key is stored per row, so old and new coexist; only new material uses the new layout.

Generation stays manual per the 2026-07-20 workflow decision, with LLM cross-check and
human spot-check once the library grows (`scripts/dictation-seed/README.md`).

## 10. Forward compatibility

1. `passage_tags` is the vocabulary the learner profile must mirror. When the shared
   learner model lands, a profile weakness should be expressible as a tag name from this
   table — if it is not, the vocabulary is wrong and should be fixed here, not worked
   around there.
2. `passage_stats` is the calibration substrate. Do not aggregate or interpret it in this
   iteration; just record it faithfully.
3. `dictation_attempts.sentence_results` (the v1 ops JSON) stays the observation format —
   unchanged by this work.

## 11. Implementation order

1. Migration 0012 + `@bcailab/db` helpers for the four tables.
2. `passage-tags.ts` (pure) + vitest — the tagger and vocabulary, done before anything
   depends on it.
3. Data migration of the 20 dictation passages + tagger run; dictation queries repointed.
   Dictation must be fully working again before moving on.
4. `passage_stats` write path from dictation completion and reading evaluation.
5. Reading: library browsing, library passage practice, authorization predicate + test.
6. Reading trial reads a library row; delete the constant.
7. Seed script rename and reference-audio synthesis; `retag` command.
8. Docs sync (§12) + roadmap Done, same PR.

## 12. Documentation sync

- `docs/architecture.md`: note the unified material layer and the R2 `material/` prefix.
- New `docs/material-layer.md` (or a section in `docs/tools/dictation.md` and
  `docs/tools/esl.md`) describing the shared corpus, the tag vocabulary, and the
  deterministic-tagging rule.
- `docs/tools/esl.md`: reading now has a global library; trial no longer uses a constant.
- `scripts/material-seed/README.md`: updated workflow including retagging.
- `docs/infra-cloudflare.md` / `docs/workflow.md`: expect `Docs impact: none` (no new env
  vars); confirm at implementation time.

## 13. Open questions for the owner

These change the shape of the work and are not mine to decide:

1. **Reading library scope.** Should library passages appear for *anonymous* reading
   visitors too (turning the reading trial into "pick any library passage, get one
   evaluation"), or stay signed-in only with the trial pinned to one passage? The former
   is a better funnel; the latter is less work and keeps the trial predictable.
2. **Band on user passages.** When a user pastes their own text, do we spend an LLM call
   to band and tag it — so their material also feeds the learner model — or leave it
   untagged? Untagged is cheaper and is what §4 assumes; tagging makes the learner model
   see all practice, not just library practice.
3. **Library size target for this iteration.** Do we grow the corpus during this work, or
   ship the plumbing with the existing 20 and expand separately? Recommendation: ship
   plumbing first, expand as its own task — mixing a schema migration with a content push
   makes both harder to verify.
4. **Phase 2 timing.** Confirm that leaving `esl_passages` in place (§7) is acceptable as
   a known, documented duplication.
