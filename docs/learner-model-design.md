# Shared Learner Model + Unified Progress Centre — Design

Status: **approved** 2026-07-21 — all five §12 decisions confirmed by the owner. Now the
implementation spec; follow §11 build order.

Scope source: `docs/roadmap.md` → "Next iteration: shared learner model + unified progress
centre". Reasoning inherited from `docs/learner-model-notes.md` (read first) and the
forward-compatibility contracts in `docs/material-layer-design.md` §10. This doc turns those
notes into a concrete schema, write paths, and surfaces, and answers the five open questions
in the notes §6.

Intended reader: the AI agent (or human) who implements the next iteration.

## 1. What this iteration is, and is not

The material layer gave us tagged material and per-passage empirical difficulty. It was
built to feed a learner model that does not exist yet: today the tools **share material but
share nothing about the learner.** `esl_learner_profiles` is half-built (§3), the observation
tables from migration 0003 are dormant (§3), and dictation writes nothing about the learner
at all. This iteration builds the missing substrate and the first surface that consumes it.

**In scope:**

- A **deterministic observation layer**: every scored attempt, in any mode, records which
  practice features the learner got right or wrong, keyed by the `passage_tags` vocabulary
  (§4, §5). This is the substrate the notes call "tools write observations, the profile layer
  aggregates".
- A **profile aggregation layer**: per-user, per-tag mastery estimates plus a CEFR estimate,
  derived from observations. Deterministic aggregate first; an LLM only *names* patterns for
  the learner, never invents them (§6).
- Generalising `esl_learner_profiles` beyond reading so dictation and (later) writing feed the
  same profile (§3, §7).
- A **unified progress centre** at `/english/progress`: one growth surface across dictation
  and reading, replacing the two isolated per-tool dashboards as the primary view (§9).
- Level self-selection storage and the measured-override rule (§8), so the profile has a CEFR
  estimate from day one and corrects it silently.

**Non-goals — explicitly deferred, do not build here:**

- **The matching service** (learner → passage). This is the whole point of Dictation v2 and
  stays there. The notes §4 warn that acting on `passage_stats` before the calibration hazards
  are handled is a trap; this iteration produces the *learner-side inputs* matching will need
  and stops. "What should I practise next?" is a different surface from the progress centre
  (§9.4) and is out of scope.
- **Onboarding UI / a placement test.** Notes §1 is decisive: no gate. We store a level and
  correct it, but the one-tap level picker is its own roadmap item.
- **Writing into the profile from writing practice.** Writing material is a prompt, not a
  passage, and has no tag vocabulary (notes §5, material design §5.4). Writing contributes
  its CEFR signal and practice-time counters only; its error patterns wait until there is a
  vocabulary that fits them. The profile schema must not assume writing is absent, but no
  writing→tag write path is built this iteration.
- **User-supplied passages feeding the model.** `source='user'` rows are untagged by decision
  (material design §5.4), so attempts on them produce no tag observations. They still count
  toward practice time. Revisit when the model is mature enough to fold them in.

## 2. The one principle everything follows

The material layer earned a rule worth restating because it decides every hard call below:

> **The deterministic layer measures. The LLM interprets.**

Applied here:

- **Measuring** the learner — which features were missed, how often, trending which way — is
  done by code, from diff ops and the passage's own tags. It is reproducible, free, and
  re-runnable over a learner's whole history when the aggregation changes.
- **Naming** a pattern for the learner — "you keep dropping past-tense endings" — is the only
  place an LLM is allowed, and it names what the aggregates already show. It never decides
  *whether* a weakness exists.

This is the same division that governed dictation feedback and the material tagger. It is why
the observation layer is not just "store the LLM's opinion of the learner" — that opinion
drifts between Tuesdays and cannot be recomputed.

## 3. What already exists (and why it is not enough)

Three relevant things are in the schema. Knowing their real state prevents rebuilding what
exists and prevents trusting what looks wired but is not.

**`esl_learner_profiles` (migration 0004) — half-built, reading-only.**
Columns: `persistent_issues_json`, `strengths_json`, `cefr_estimate`, `total_practice_seconds`,
`total_attempts`, `eval_count_since_update`. Reality in the code:

- `incrementEslLearnerProfileCounters` runs on each reading attempt — so the **counters are
  live**, but only for reading.
- `persistent_issues_json` / `strengths_json` are **read** (fed into the reading eval prompt)
  but **never written** — `upsertEslLearnerProfile` has no caller. In production these are
  always `[]`. The "cross-passage persistent patterns" feature was designed and never finished.
- `cefr_estimate` is likewise never written.

So the profile table is a good skeleton with an empty body. We generalise and fill it, we do
not replace it.

**`esl_item_observations` + `esl_learning_items` (migration 0003) — fully dormant.**
A time-series observation table keyed to a shared learning-item catalog. Grep confirms
**neither is read nor written anywhere.** It was built for a reading-v2 vision that never
landed. Its shape (`user_id`, `item_id`, `tool_type`, `outcome`, `severity`, `evidence_json`,
`created_at`) is close to what we want — but its `item_id` foreign-keys the `esl_learning_items`
catalog, which uses its own `key` scheme unrelated to the `passage_tags` vocabulary that the
material layer made the contract (material design §10.1). Adopting it as-is would mean two
competing weakness vocabularies. §4 decides what to do with it.

**Dictation — writes nothing about the learner, by design.**
`dictation_attempts.sentence_results` (non-`match` diff ops) is the stable observation format
(material design §10.3), but v1 deliberately never touched a profile. This iteration adds the
first dictation→profile write path (§5.1).

## 4. Observation layer

### 4.1 Decision: one new table keyed on the tag vocabulary

**Proposal: add `learner_tag_observations`, append-only, keyed directly on `passage_tags`
names — and leave `esl_item_observations` / `esl_learning_items` dormant, to be dropped in a
later cleanup migration.**

Why a new table rather than reusing `esl_item_observations`:

- The material layer already decided the weakness vocabulary is `passage_tags` (§10.1). An
  observation should reference a tag name from that table directly. `esl_item_observations`
  routes through `esl_learning_items.item_id`, a second vocabulary we would have to keep in
  sync with the tagger forever. Two vocabularies is exactly the drift the notes warn against.
- The dormant table carries speculative columns (`item_type`, `display_zh`, catalog rows) we
  do not need, and lacks the ones we do (the source passage, the mode, the op that produced
  the observation). Bending it to fit is more work than a purpose-built table.
- Reusing it would also resurrect a foreign key to a catalog nobody maintains.

This is a real decision with a cost (a dormant table stays in the schema until a later drop),
so it is flagged for sign-off in §12.

```sql
-- One row per (attempt, tag): "on this attempt, the learner met tag T, and here is how
-- they did on it." Append-only and deterministic — the aggregation in §6 reads it, the
-- LLM never writes it.
CREATE TABLE learner_tag_observations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  tag TEXT NOT NULL,                 -- a passage_tags name; the shared vocabulary
  mode TEXT NOT NULL,                -- 'dictation' | 'reading'
  passage_id TEXT NOT NULL REFERENCES passages(id),
  attempt_id TEXT NOT NULL,          -- dictation_attempts.id or esl_reading_attempts.id
  -- Deterministic outcome, normalized 0..1: share of this tag's occurrences the learner
  -- handled correctly on this attempt. 1.0 = every occurrence right, 0.0 = every one wrong.
  exposure INTEGER NOT NULL,         -- how many times the tag occurred in the material
  hits INTEGER NOT NULL,             -- how many the learner got right
  -- Signal quality, so aggregation can down-weight noisier evidence (§6.3).
  source TEXT NOT NULL DEFAULT 'deterministic', -- 'deterministic' (dictation) | 'llm' (reading)
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX learner_tag_observations_user_tag_idx
  ON learner_tag_observations(user_id, tag, created_at DESC);
CREATE INDEX learner_tag_observations_user_created_idx
  ON learner_tag_observations(user_id, created_at DESC);
```

`exposure`/`hits` rather than a single accuracy float is deliberate: aggregation needs the
denominator to weight a tag met 20 times differently from one met once, and to build a growth
curve that is not distorted by a single lucky short passage.

### 4.2 Anonymous and trial practice write nothing

Consistent with the current system: dictation persists attempts for signed-in users only, and
the reading/writing trials persist nothing (roadmap Done, 2026-07-21). So every observation row
comes from signed-in practice. That sidesteps the mixed-population hazard the notes §4 raise
for the *learner* model — the population question there is really about `passage_stats`
(material difficulty), which this iteration does not touch. Recorded here so the next
implementer does not add a trial write path without reopening the question.

## 5. Write paths — turning a scored attempt into observations

The two modes produce evidence of very different quality. The schema treats them uniformly;
the aggregation (§6.3) does not.

### 5.1 Dictation → deterministic observations

Dictation is the good instrument (notes §1): its ops are deterministic and its material is
tagged. The mapping reuses the *exact per-word predicates already in* `passage-tags.ts`, so
"a word carries tag T" means the same thing when we tag material and when we attribute an
error. No new linguistic logic, no second definition to drift.

Algorithm, run server-side right after scoring (where the reference text still lives):

1. For each reference word in the passage, compute which tags it carries, using the same
   predicates the tagger uses (`isFinalS`, `WEAK_FORMS`, contraction regex, …). This is
   `exposure` per tag.
2. Walk `sentence_results` (the stored non-`match` ops). A `delete` or `substitute` op on a
   reference word means that word was *not* reproduced correctly → it counts against every tag
   that word carries. Everything else is a hit.
3. Emit one `learner_tag_observations` row per tag with `exposure > 0`, `source='deterministic'`.

This needs a small pure helper (`attributeDictationErrors(reference, ops)` →
`Map<tag, {exposure, hits}>`) living next to `passage-tags.ts`, vitest-covered, no server deps —
same rule as the tagger. It runs synchronously in the dictation completion action; it is cheap
(string work over one passage) and the reference text is already in hand there.

Note `final_s` already stands for two learner weaknesses the feedback reports separately
(third-person-s, plural-s) — the tagger merged them on purpose (material design, `final_s`
note). The observation layer inherits that merge; it does not try to re-split what the tagger
would not.

### 5.2 Reading → LLM-derived observations, marked as noisier

Reading is the poor instrument (notes §1): evaluation is LLM-judged highlights
(`mispronunciation`, `pause`, `stress`, `intonation`, `linking`…), not deterministic ops. We
still extract signal, but honestly labelled:

1. The passage's tags give `exposure` (deterministic — the material is library-tagged).
2. Highlights map to tags by type → tag (`mispronunciation` on a `th`-word → `th_sound`;
   `pause`/`stress` on a long sentence → `long_sentence`; `intonation` on a `?` → `question`;
   `linking` → `linking`). A highlighted occurrence is a miss; un-highlighted occurrences of
   that tag are hits.
3. Emit rows with `source='llm'`.

The mapping table lives with the reading evaluator. Because it is lossy and model-dependent,
these rows are down-weighted in aggregation (§6.3) — never treated as equal to a dictation op.

### 5.3 What does not change

`dictation_attempts.sentence_results` and the reading `output_json` shapes are **unchanged**
(material design §10.3). Observations are *derived* from them, so re-deriving over history is
possible if the mapping improves — the same re-runnability the tagger has. The write paths only
*add* observation rows alongside the existing attempt writes.

## 6. Profile aggregation layer

### 6.1 Where the profile lives — extend, do not replace

**Proposal: keep `esl_learner_profiles` as the profile row and generalise it**, rather than
create a new table the reading profile migrates into. It already holds the counters, the CEFR
estimate slot, and the free-text issue/strength slots; three of those we now actually fill.
Renaming it (it is ESL-specific in name only; English Studio has no other learner) is optional
churn — leave the name, treat it as the English-Studio learner profile.

Additions:

```sql
-- Deterministic per-tag mastery, recomputed from observations. JSON keyed by tag name:
--   { "final_s": {"mastery": 0.42, "exposure": 37, "trend": -0.05}, ... }
-- Stored denormalized on the profile so the progress centre is one row read, not a scan.
ALTER TABLE esl_learner_profiles ADD COLUMN tag_mastery_json TEXT NOT NULL DEFAULT '{}';

-- Level self-selection (§8). Declared by the learner; measured by the system.
ALTER TABLE esl_learner_profiles ADD COLUMN cefr_declared TEXT;      -- one-tap pick, nullable
ALTER TABLE esl_learner_profiles ADD COLUMN cefr_measured TEXT;      -- from dictation evidence
ALTER TABLE esl_learner_profiles ADD COLUMN cefr_measured_confidence REAL NOT NULL DEFAULT 0;
```

`cefr_estimate` (existing) becomes the **resolved** level the product shows — computed from
declared + measured by the rule in §8 — so existing readers keep working.
`persistent_issues_json` / `strengths_json` stay, but are now written (§6.4) as the LLM's
*named* view of `tag_mastery_json`, not an independent opinion.

### 6.2 When aggregation runs — synchronous count, throttled recompute

Two-speed, matching the existing `eval_count_since_update` throttle already on the table:

- **Synchronous, per attempt:** write the raw `learner_tag_observations` rows and bump the
  counters. Cheap, deterministic, always current.
- **Throttled recompute:** rebuild `tag_mastery_json` and `cefr_measured` from observations
  when `eval_count_since_update` crosses a threshold (reuse the existing counter; a few
  attempts, tune in review). Recompute is a bounded scan of one user's observations. This
  keeps the hot attempt path from doing a full aggregation every time while keeping the
  displayed profile fresh enough for a progress surface that is not real-time.

The LLM naming pass (§6.4) piggybacks on the same throttle boundary and runs in the
background, exactly like dictation's background feedback — never in the attempt's request path.

### 6.3 The aggregation itself (deterministic)

For each tag, over that user's observations:

- **mastery** = weighted mean of `hits/exposure`, weighting by `exposure` (so a tag met often
  dominates a tag met once) and by recency (recent attempts count more — the learner improves)
  and by **source** (`deterministic` dictation rows weight more than `llm` reading rows, per
  notes §1 that reading is a noisier measure).
- **trend** = slope of mastery over recent vs earlier windows; this is what makes a *growth*
  curve possible and is the progress centre's core value.
- **exposure** = total occurrences seen, so the UI can distinguish "weak" from "untested".

The exact weights are a tuning detail for review, not a schema commitment. The important
property: it is a pure function of the observation rows, so it can be recomputed wholesale.

### 6.4 The LLM naming pass (interpretation only)

Once `tag_mastery_json` is computed, a background call turns the lowest-mastery,
highest-exposure tags into learner-facing prose and writes `persistent_issues_json` /
`strengths_json`. The model is given the aggregates and asked to *phrase* them, in the
feedback language, not to decide them. This finally supplies the write path that
`esl_learner_profiles` was designed for and never got, and it reuses the reading eval prompt's
existing consumption of those fields.

## 7. CEFR estimation

Dictation is the placement instrument (notes §1). Estimation is deterministic:

- Each dictation attempt has an accuracy against a passage of known `band`. High accuracy on a
  B2 passage is evidence the learner is at or above B2; low accuracy on A2 is evidence of
  below-A2. Accumulate these into `cefr_measured` with a confidence that grows with the number
  and band-spread of attempts.
- Reading contributes its LLM `cefr_guess`/`cefr_confidence` (already produced) as a weaker
  secondary signal, folded in at lower weight.

Confidence, not just a point estimate, is what §8's override rule needs. The mechanics
(exact banding thresholds) are a tuning detail; the schema commitment is `cefr_measured` +
`cefr_measured_confidence`.

## 8. Level self-selection and silent override

Answers notes §6 Q5. Storage in §6.1: `cefr_declared` (the one-tap pick, default B1,
skippable — the picker UI itself is a separate roadmap item) and `cefr_measured` (from §7).

Resolution rule for the shown level (`cefr_estimate`):

- **Cold start:** no measured evidence → show `cefr_declared` (or B1 default). The learner is
  never blocked on picking.
- **Measured overrides gradually:** once `cefr_measured_confidence` passes a threshold, the
  resolved level follows the measurement. Because it is gradual and evidence-based, it does not
  feel arbitrary — and the progress centre can surface *why* ("Based on your dictation
  accuracy, we've set your level to B2"), which turns a silent override into a visible result
  of the learner's own practice. That transparency is the antidote to "arbitrary".
- **Never a hard contradiction in the moment:** we adjust the estimate, we do not tell a
  learner mid-session they were wrong about themselves.

The calibration feedback loop the notes §4 flag (easy passages served to weak learners depress
measured difficulty) is a **matching** concern and does not bite here, because this iteration
does not serve matched material — the learner practises what they choose. Recorded so it is not
reintroduced when matching arrives.

## 9. Unified progress centre

### 9.1 The surface

New route `/english/progress`: the single growth view across the studio, reachable from
`/english` and from each tool's shell. It reads one profile row plus a bounded observation
history — no per-attempt fan-out.

Contents, in priority order:

1. **Level and its basis** — resolved CEFR, and the one-line "why" from §8 when measured.
2. **Growth curve** — mastery/accuracy over time, the retrospective payoff of recording
   observations. This is the surface the whole material+model investment was for.
3. **Strengths and working-on** — the named tags from `persistent_issues_json` /
   `strengths_json`, each tied to the concrete tag mastery behind it.
4. **Practice volume** — the existing counters (`total_practice_seconds`, `total_attempts`),
   now spanning modes rather than reading only.

### 9.2 Relationship to the existing per-tool dashboards

`/reading/progress` and `/writing/progress` exist and are tool-scoped. **Proposal:**
`/english/progress` becomes the primary cross-tool surface; the per-tool dashboards stay as
drill-downs (reading-specific detail belongs on the reading dashboard). This is an additive
surface, not a migration that breaks the existing ones — consistent with the IA notes that
browse/secondary surfaces should not be rebuilt as primary ones (english-studio-ia §2). Whether
to eventually fold the per-tool dashboards in is left open (§12).

### 9.3 Cross-mode honesty

Because reading observations are marked noisier (§5.2), the progress centre should not present
a reading-driven weakness with the same confidence as a dictation-driven one. The growth curve
is most trustworthy for dictation; the UI copy should not overclaim precision the reading
signal does not have.

### 9.4 Progress centre ≠ "what to practise next"

Answers notes §6 Q4. They are two surfaces sharing one substrate:

- **Progress centre (this iteration):** retrospective. "Here is how far you've come."
- **Recommendation (next iteration, matching):** prospective. "Practise this next." It needs
  the matching policy and the `passage_stats` calibration the notes §4 defer.

Building the retrospective surface now, on the observation substrate, is what makes the
prospective one cheap later — recommendation reads the same `tag_mastery_json`.

## 10. Forward compatibility

1. `learner_tag_observations` is deliberately the *inputs* matching will consume — a tag
   mastery vector per user, already keyed on `passage_tags`. Matching (Dictation v2) joins that
   against `passage_tags` density and `passage_stats` difficulty. This iteration must not
   implement that join.
2. `passage_stats` stays untouched. The notes §4 calibration hazards are matching's to solve;
   recording learner-side observations does not interact with per-passage difficulty.
3. The observation mapping (§5) is re-runnable over history because the underlying attempt
   formats are unchanged — the same property the tagger has. If the op→tag or highlight→tag
   mapping improves, re-derive; do not migrate.
4. Writing joins later: when a writing vocabulary exists, it adds observation rows in the same
   table with a new `mode`, no schema change.

## 11. Implementation order (once approved)

1. Migration: `learner_tag_observations` + the `esl_learner_profiles` column additions.
   `@bcailab/db` helpers for both.
2. `attributeDictationErrors` pure helper + vitest, reusing `passage-tags.ts` predicates.
3. Dictation completion action writes observations synchronously. Verify against dev server.
4. Reading evaluation writes `source='llm'` observations via the highlight→tag mapping.
5. Deterministic aggregation (`tag_mastery_json`, `cefr_measured`) on the throttle boundary.
6. LLM naming pass (background) writing issues/strengths; resolve `cefr_estimate` per §8.
7. `/english/progress` surface reading the profile row.
8. Docs sync (§13) + roadmap Done, same PR.

Each step is verifiable before the next: observations can be inspected in D1 before any
aggregation exists; aggregation can be checked before the surface is built.

## 12. Decisions that need the owner's yes

1. **New `learner_tag_observations` table, and leave `esl_item_observations` /
   `esl_learning_items` dormant** (to be dropped later), rather than reviving the dormant
   tables (§4.1). Recommendation: new table — the dormant one carries a competing vocabulary.
2. **Extend `esl_learner_profiles` in place** rather than a fresh profile table (§6.1).
   Recommendation: extend.
3. **`/english/progress` as the primary cross-tool surface, per-tool dashboards kept as
   drill-downs** (§9.2) — versus folding them in now. Recommendation: additive, keep both.
4. **Reading observations included but down-weighted** (§5.2, §6.3) — versus recording only
   deterministic dictation observations this iteration and adding reading later. Recommendation:
   include but mark, because the progress centre is thin with dictation alone at cold start.
5. **Scope boundary confirmed:** no matching, no onboarding UI, no writing→tag write path this
   iteration (§1). This is the load-bearing scope call; confirm before anything is built.

## 13. Documentation sync (at implementation time)

- `docs/architecture.md`: new `/english/progress` route; the learner-model tables.
- New `docs/learner-model.md` (or sections in the tool docs) describing the observation layer,
  the deterministic-measures/LLM-interprets rule as it applies to the profile, and the CEFR
  estimation.
- `docs/tools/dictation.md` / `docs/tools/esl.md`: each mode now writes learner observations.
- `docs/roadmap.md`: move the item to Done; note matching is still the open Dictation v2 work.
- `docs/learner-model-notes.md`: the five open questions (§6) are now answered here; leave the
  notes as the historical reasoning, point them at this doc.
