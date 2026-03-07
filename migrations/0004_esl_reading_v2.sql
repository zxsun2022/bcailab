-- Add duration tracking to reading attempts
ALTER TABLE esl_reading_attempts ADD COLUMN duration_ms INTEGER;

-- Learner profile for cross-passage persistent patterns
CREATE TABLE IF NOT EXISTS esl_learner_profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  persistent_issues_json TEXT NOT NULL DEFAULT '[]',
  strengths_json TEXT NOT NULL DEFAULT '[]',
  cefr_estimate TEXT,
  total_practice_seconds INTEGER NOT NULL DEFAULT 0,
  total_attempts INTEGER NOT NULL DEFAULT 0,
  eval_count_since_update INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS esl_learner_profiles_user_idx
  ON esl_learner_profiles(user_id);
