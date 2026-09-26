-- Targeted practice after Writing feedback (roadmap Next, authorized 2026-09-25).
--
-- One row per practice on one annotation of one feedback generation. The annotation is copied
-- into the row, because a feedback retry replaces the revision's feedback_json and an index
-- alone would then point at a different annotation.
--
-- status: fix | transfer | finished | skipped | disputed. fix and transfer are the two steps;
-- the other three end the item (ended_at set). attempts_json is an append-only array of
-- {step, answer, acceptable, reason, reference, model, at}. version guards concurrent writes:
-- every update is conditional on the version it read.
--
-- Context, not measurement (ADR 0010): nothing here feeds learner_tag_observations.
-- A new table only, so it is safe to apply before deploying the code that uses it (ADR 0008).

CREATE TABLE writing_practice_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  article_id TEXT NOT NULL REFERENCES writing_articles(id),
  revision_id TEXT NOT NULL REFERENCES writing_revisions(id),
  feedback_generation INTEGER NOT NULL,
  annotation_index INTEGER NOT NULL,
  annotation_json TEXT NOT NULL,
  feedback_language TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'fix',
  transfer_prompt TEXT,
  attempts_json TEXT NOT NULL DEFAULT '[]',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at TEXT,
  UNIQUE (user_id, revision_id, feedback_generation, annotation_index)
);

CREATE INDEX idx_writing_practice_revision
  ON writing_practice_items(user_id, revision_id, feedback_generation);
