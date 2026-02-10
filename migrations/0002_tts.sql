-- Speech / TTS generations
CREATE TABLE IF NOT EXISTS tts_generations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  input_text TEXT NOT NULL,
  processed_text TEXT NOT NULL,
  input_mode TEXT NOT NULL,
  language_code TEXT NOT NULL,
  voice_name TEXT NOT NULL,
  audio_format TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  audio_bytes INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS tts_generations_user_created_idx
  ON tts_generations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tts_generations_user_deleted_idx
  ON tts_generations(user_id, deleted_at);
CREATE INDEX IF NOT EXISTS tts_generations_deleted_idx
  ON tts_generations(deleted_at);
