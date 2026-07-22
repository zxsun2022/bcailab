-- Shared learner model: deterministic per-tag observations + generalised profile.
-- Design: docs/learner-model-design.md.
--
-- The material layer gave us tagged material and per-passage difficulty. This adds the
-- learner side: every scored attempt records which practice features (passage_tags names)
-- the learner handled correctly, and the profile aggregates that into per-tag mastery and
-- a CEFR estimate. Deterministic layer measures; the LLM only names patterns (design §2).

-- One row per (attempt, tag): "on this attempt, the learner met tag T, met it `exposure`
-- times in the material, and got `hits` of them right." Append-only and deterministic —
-- the aggregation reads it, the LLM never writes it. Re-derivable from the unchanged
-- attempt formats if the op->tag mapping improves (design §5.3, §10.3).
CREATE TABLE learner_tag_observations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  tag TEXT NOT NULL,                 -- a passage_tags name; the shared vocabulary
  mode TEXT NOT NULL,                -- 'dictation'|'reading'
  passage_id TEXT NOT NULL REFERENCES passages(id),
  attempt_id TEXT NOT NULL,          -- dictation_attempts.id or esl_reading_attempts.id
  exposure INTEGER NOT NULL,         -- occurrences of the tag in the material (>0)
  hits INTEGER NOT NULL,             -- occurrences the learner handled correctly
  -- Signal quality: dictation is a deterministic measure, reading is an LLM judgement.
  -- Aggregation down-weights 'llm' rows (design §5.2, §6.3).
  source TEXT NOT NULL DEFAULT 'deterministic',  -- 'deterministic'|'llm'
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX learner_tag_observations_user_tag_idx
  ON learner_tag_observations(user_id, tag, created_at DESC);
CREATE INDEX learner_tag_observations_user_created_idx
  ON learner_tag_observations(user_id, created_at DESC);

-- Generalise the (reading-only, half-built) profile into the English-Studio learner
-- profile. Name kept — English Studio has no other learner. The existing counters and
-- issue/strength/cefr_estimate columns stay; these add the deterministic aggregate and
-- level self-selection (design §6.1, §8).

-- Deterministic per-tag mastery, recomputed from observations. JSON keyed by tag name:
--   { "final_s": {"mastery": 0.42, "exposure": 37, "trend": -0.05}, ... }
-- Denormalized onto the profile so the progress centre is one row read.
ALTER TABLE esl_learner_profiles ADD COLUMN tag_mastery_json TEXT NOT NULL DEFAULT '{}';

-- Level self-selection. `cefr_declared` is the learner's one-tap pick (the picker UI is a
-- separate roadmap item); `cefr_measured` comes from dictation accuracy against known bands.
-- `cefr_estimate` (existing) stays the RESOLVED level the product shows, per the §8 rule.
ALTER TABLE esl_learner_profiles ADD COLUMN cefr_declared TEXT;
ALTER TABLE esl_learner_profiles ADD COLUMN cefr_measured TEXT;
ALTER TABLE esl_learner_profiles ADD COLUMN cefr_measured_confidence REAL NOT NULL DEFAULT 0;

-- Note: esl_item_observations / esl_learning_items (migration 0003) are left dormant and
-- will be dropped in a later cleanup migration (design §4.1, §12.1). They key on a
-- competing vocabulary and are superseded by learner_tag_observations.
