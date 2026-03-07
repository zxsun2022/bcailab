-- ESL passages (reading/recitation source text)
CREATE TABLE IF NOT EXISTS esl_passages (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT,
  content_text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS esl_passages_user_created_idx
  ON esl_passages(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS esl_passages_user_deleted_idx
  ON esl_passages(user_id, deleted_at);
CREATE INDEX IF NOT EXISTS esl_passages_deleted_idx
  ON esl_passages(deleted_at);

-- ESL reading attempts (uploaded user audio)
CREATE TABLE IF NOT EXISTS esl_reading_attempts (
  id TEXT PRIMARY KEY,
  passage_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  audio_format TEXT NOT NULL,
  audio_mime_type TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  audio_bytes INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (passage_id) REFERENCES esl_passages(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS esl_attempts_user_created_idx
  ON esl_reading_attempts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS esl_attempts_passage_created_idx
  ON esl_reading_attempts(passage_id, created_at DESC);
CREATE INDEX IF NOT EXISTS esl_attempts_user_deleted_idx
  ON esl_reading_attempts(user_id, deleted_at);
CREATE INDEX IF NOT EXISTS esl_attempts_deleted_idx
  ON esl_reading_attempts(deleted_at);

-- ESL reading evaluations (model outputs)
CREATE TABLE IF NOT EXISTS esl_reading_evaluations (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  model_name TEXT NOT NULL,
  rubric_version TEXT NOT NULL,
  output_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (attempt_id) REFERENCES esl_reading_attempts(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS esl_evaluations_attempt_created_idx
  ON esl_reading_evaluations(attempt_id, created_at DESC);
CREATE INDEX IF NOT EXISTS esl_evaluations_user_created_idx
  ON esl_reading_evaluations(user_id, created_at DESC);

-- Shared learning-item catalog for all ESL sub-tools
CREATE TABLE IF NOT EXISTS esl_learning_items (
  id TEXT PRIMARY KEY,
  item_type TEXT NOT NULL,
  key TEXT NOT NULL UNIQUE,
  display_zh TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS esl_learning_items_type_idx
  ON esl_learning_items(item_type, created_at DESC);

-- Time-series observations for learning curve modeling
CREATE TABLE IF NOT EXISTS esl_item_observations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  tool_type TEXT NOT NULL,
  artifact_id TEXT,
  outcome TEXT NOT NULL,
  severity INTEGER,
  evidence_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (item_id) REFERENCES esl_learning_items(id)
);

CREATE INDEX IF NOT EXISTS esl_observations_user_item_created_idx
  ON esl_item_observations(user_id, item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS esl_observations_user_created_idx
  ON esl_item_observations(user_id, created_at DESC);
