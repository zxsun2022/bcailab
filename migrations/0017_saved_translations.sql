-- Explicitly saved translation snapshots. Streaming/ordinary translations do not write here.

CREATE TABLE saved_translations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  completion_id TEXT NOT NULL CHECK (length(completion_id) BETWEEN 16 AND 200),
  proof_version INTEGER NOT NULL DEFAULT 1 CHECK (proof_version = 1),
  source_language TEXT NOT NULL CHECK (length(source_language) BETWEEN 2 AND 16),
  detected_source_language TEXT CHECK (
    detected_source_language IS NULL OR length(detected_source_language) BETWEEN 2 AND 16
  ),
  target_language TEXT NOT NULL CHECK (length(target_language) BETWEEN 2 AND 16),
  source_text TEXT NOT NULL CHECK (length(source_text) BETWEEN 1 AND 20000),
  translated_text TEXT NOT NULL CHECK (length(translated_text) BETWEEN 1 AND 40000),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, completion_id)
);

CREATE INDEX idx_saved_translations_user_keyset
  ON saved_translations(user_id, created_at DESC, id DESC);
