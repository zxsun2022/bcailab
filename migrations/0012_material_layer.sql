-- Material layer: one graded, tagged passage store serving both dictation and reading.
-- Design: docs/material-layer-design.md.
--
-- Nothing is deleted. Ids are preserved throughout, so existing R2 keys and bookmarked
-- URLs keep working and attempt rows copy across unchanged. The old tables
-- (dictation_passages, dictation_sentences, esl_passages) are LEFT IN PLACE as a rollback
-- path and dropped by a later migration once a release has proven this one in production.

-- A passage is global library content when user_id IS NULL, user-created otherwise.
-- One row can be dictation-capable (has passage_sentences with audio), reading-capable
-- (has reference audio), or both. Library rows are both; user rows are reading-only.
CREATE TABLE passages (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),        -- NULL = global library content
  title TEXT NOT NULL,
  content_text TEXT NOT NULL,
  band TEXT,                                -- 'A2'|'B1'|'B2'|'C1'; NULL for user text
  topic TEXT,
  -- Objective difficulty metrics, derived by the tagger. Denormalized for cheap filtering.
  word_count INTEGER NOT NULL DEFAULT 0,
  sentence_count INTEGER NOT NULL DEFAULT 0,
  mean_sentence_words REAL NOT NULL DEFAULT 0,
  rare_word_ratio REAL NOT NULL DEFAULT 0,
  -- Capability flags / assets.
  has_sentence_audio INTEGER NOT NULL DEFAULT 0,
  reference_audio_status TEXT,              -- 'pending'|'completed'|'failed'|NULL
  reference_audio_r2_key TEXT,
  reference_audio_bytes INTEGER,
  reference_voice_name TEXT,
  reference_audio_created_at TEXT,
  status TEXT NOT NULL DEFAULT 'published', -- 'draft'|'published'
  source TEXT NOT NULL DEFAULT 'library',   -- 'library'|'user'
  -- Marks the single passage anonymous visitors practise in the reading trial.
  -- A column rather than a hardcoded id so the choice can change with one UPDATE
  -- instead of a deploy.
  is_trial INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX passages_library_idx ON passages(band, status, deleted_at);
CREATE INDEX passages_user_idx ON passages(user_id, created_at DESC);

CREATE TABLE passage_sentences (
  id TEXT PRIMARY KEY,
  passage_id TEXT NOT NULL REFERENCES passages(id),
  idx INTEGER NOT NULL,
  text TEXT NOT NULL,
  r2_key TEXT,                              -- NULL until audio is synthesized
  audio_bytes INTEGER,
  UNIQUE (passage_id, idx)
);

-- Feature tags with counts, not booleans: matching needs density, and density is
-- count normalized by word_count. Key/value so adding a tag means re-running the
-- tagger rather than migrating a schema.
CREATE TABLE passage_tags (
  passage_id TEXT NOT NULL REFERENCES passages(id),
  tag TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (passage_id, tag)
);

CREATE INDEX passage_tags_tag_idx ON passage_tags(tag, count DESC);

-- Empirical difficulty per practice mode. Separate table so the passages row is not
-- rewritten on every attempt. This iteration only records; interpreting the numbers
-- belongs to the matching service.
CREATE TABLE passage_stats (
  passage_id TEXT NOT NULL REFERENCES passages(id),
  mode TEXT NOT NULL,                       -- 'dictation'|'reading'
  attempt_count INTEGER NOT NULL DEFAULT 0,
  accuracy_sum REAL NOT NULL DEFAULT 0,     -- mean = accuracy_sum / attempt_count
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (passage_id, mode)
);

-- ---------- copy existing content, preserving ids ----------

-- Global dictation library. sentence_count carries over; the tagger recomputes the
-- other metrics in a follow-up pass (it needs the text, not SQL).
INSERT INTO passages (
  id, user_id, title, content_text, band, topic,
  sentence_count, has_sentence_audio, reference_voice_name,
  status, source, created_at, deleted_at
)
SELECT
  p.id, NULL, p.title,
  -- content_text is reconstructed from the sentence rows: dictation stored text per
  -- sentence and never kept a whole-passage copy. The inner ORDER BY matters —
  -- group_concat has no defined order without it, and this text is what reading
  -- practice and the tagger will read.
  (SELECT group_concat(s.text, ' ')
     FROM (SELECT text FROM dictation_sentences
            WHERE passage_id = p.id ORDER BY idx) AS s),
  p.band, p.topic,
  p.sentence_count, 1, p.voice_name,
  p.status, 'library', p.created_at, p.deleted_at
FROM dictation_passages p;

INSERT INTO passage_sentences (id, passage_id, idx, text, r2_key, audio_bytes)
SELECT id, passage_id, idx, text, r2_key, audio_bytes FROM dictation_sentences;

-- User-created reading passages. No band, no tags (design §5.4).
INSERT INTO passages (
  id, user_id, title, content_text, band, topic,
  has_sentence_audio,
  reference_audio_status, reference_audio_r2_key, reference_audio_bytes,
  reference_voice_name, reference_audio_created_at,
  status, source, created_at, updated_at, deleted_at
)
SELECT
  id, user_id, COALESCE(title, 'Untitled'), content_text, NULL, NULL,
  0,
  reference_tts_status, reference_tts_r2_key, reference_tts_audio_bytes,
  reference_tts_voice_name, reference_tts_created_at,
  'published', 'user', created_at, updated_at, deleted_at
FROM esl_passages;

-- ---------- repoint esl_reading_attempts at passages ----------
--
-- SQLite cannot retarget a foreign key in place, so the table is rebuilt. Passage ids
-- were preserved above, so every attempt row copies across unchanged.
--
-- esl_reading_evaluations has its own foreign key onto esl_reading_attempts, and with
-- foreign_keys=ON (D1 default, verified) DROP TABLE runs an implicit DELETE that would
-- violate it. So the child is rebuilt and dropped first, then the parent. Renaming the
-- new parent last lets SQLite rewrite the child's reference to the final name for us —
-- no PRAGMA toggle, which is what makes this safe inside a D1 migration.

CREATE TABLE esl_reading_attempts_new (
  id TEXT PRIMARY KEY,
  passage_id TEXT NOT NULL REFERENCES passages(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  mode TEXT NOT NULL,
  audio_format TEXT NOT NULL,
  audio_mime_type TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  audio_bytes INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  duration_ms INTEGER,
  evaluation_status TEXT NOT NULL DEFAULT 'completed'
);

INSERT INTO esl_reading_attempts_new (
  id, passage_id, user_id, mode, audio_format, audio_mime_type, r2_key, audio_bytes,
  created_at, deleted_at, duration_ms, evaluation_status
)
SELECT
  id, passage_id, user_id, mode, audio_format, audio_mime_type, r2_key, audio_bytes,
  created_at, deleted_at, duration_ms, evaluation_status
FROM esl_reading_attempts;

CREATE TABLE esl_reading_evaluations_new (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES esl_reading_attempts_new(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  model_name TEXT NOT NULL,
  rubric_version TEXT NOT NULL,
  output_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO esl_reading_evaluations_new (
  id, attempt_id, user_id, model_name, rubric_version, output_json, created_at
)
SELECT id, attempt_id, user_id, model_name, rubric_version, output_json, created_at
FROM esl_reading_evaluations;

DROP TABLE esl_reading_evaluations;
DROP TABLE esl_reading_attempts;

ALTER TABLE esl_reading_attempts_new RENAME TO esl_reading_attempts;
ALTER TABLE esl_reading_evaluations_new RENAME TO esl_reading_evaluations;

CREATE INDEX esl_attempts_user_created_idx
  ON esl_reading_attempts(user_id, created_at DESC);
CREATE INDEX esl_attempts_passage_created_idx
  ON esl_reading_attempts(passage_id, created_at DESC);
CREATE INDEX esl_attempts_user_deleted_idx
  ON esl_reading_attempts(user_id, deleted_at);
CREATE INDEX esl_evaluations_attempt_idx
  ON esl_reading_evaluations(attempt_id);

-- ---------- pick the anonymous reading trial passage ----------
-- One B1 library passage: easy enough that a first-time visitor succeeds, hard enough
-- that the evaluation has something to say. Deterministic (oldest B1) so local,
-- preview, and production all choose the same row. Replaces the hardcoded passage
-- constant the trial route used to carry.
UPDATE passages SET is_trial = 1
 WHERE id = (
   SELECT id FROM passages
    WHERE user_id IS NULL AND band = 'B1' AND deleted_at IS NULL
    ORDER BY created_at ASC, id ASC LIMIT 1
 );
