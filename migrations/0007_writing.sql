CREATE TABLE writing_articles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  title TEXT,
  agent_type TEXT NOT NULL DEFAULT 'ielts_task2',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE writing_revisions (
  id TEXT PRIMARY KEY,
  article_id TEXT NOT NULL REFERENCES writing_articles(id),
  user_id TEXT NOT NULL,
  round_number INTEGER NOT NULL,
  user_text TEXT NOT NULL,
  word_count INTEGER NOT NULL DEFAULT 0,
  feedback_json TEXT,
  feedback_status TEXT NOT NULL DEFAULT 'pending',
  model_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_writing_articles_user ON writing_articles(user_id, created_at DESC);
CREATE INDEX idx_writing_revisions_article ON writing_revisions(article_id, round_number);
