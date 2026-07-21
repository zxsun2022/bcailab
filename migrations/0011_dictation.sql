-- Dictation v1: global material library, attempts, and generic per-feature quotas.
-- Design: docs/dictation-v1-design.md §4.

-- Passages and sentences are app content, not user data: no user_id, and the audio
-- they point at is served publicly with immutable cache headers.
CREATE TABLE dictation_passages (
  id TEXT PRIMARY KEY,
  band TEXT NOT NULL,              -- 'A2' | 'B1' | 'B2' | 'C1'
  topic TEXT NOT NULL,
  title TEXT NOT NULL,
  voice_name TEXT NOT NULL,        -- Chirp3 voice used for all its sentences
  sentence_count INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'published',   -- future: 'draft'
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX dictation_passages_band_idx ON dictation_passages(band, status);

CREATE TABLE dictation_sentences (
  id TEXT PRIMARY KEY,
  passage_id TEXT NOT NULL REFERENCES dictation_passages(id),
  idx INTEGER NOT NULL,            -- 0-based order within the passage
  text TEXT NOT NULL,              -- reference transcript (scoring ground truth)
  r2_key TEXT NOT NULL,            -- dictation/{passageId}/{idx}.mp3
  audio_bytes INTEGER NOT NULL,
  UNIQUE (passage_id, idx)
);

-- Signed-in users only; anonymous results are session-only and never persisted.
CREATE TABLE dictation_attempts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  passage_id TEXT NOT NULL REFERENCES dictation_passages(id),
  accuracy REAL NOT NULL,          -- 0..1, server-computed
  sentence_results TEXT NOT NULL,  -- JSON, shape defined in design §7 (v2 aggregation input)
  feedback_json TEXT,              -- LLM error-pattern feedback, nullable
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX dictation_attempts_user_idx ON dictation_attempts(user_id, created_at);

-- Generic per-feature daily counters; same subject scheme as translate_usage
-- ("user:<id>" / "anon:<cookie-id>" / "ip:<addr>"). New features use this table;
-- translate_usage stays as-is (consolidation is a Later engineering item, not v1).
CREATE TABLE feature_usage (
  feature TEXT NOT NULL,           -- 'dictation' | 'reading_trial' | 'writing_trial'
  subject TEXT NOT NULL,
  day TEXT NOT NULL,
  requests INTEGER NOT NULL DEFAULT 0,
  units INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (feature, subject, day)
);

CREATE INDEX feature_usage_day_idx ON feature_usage(day);
