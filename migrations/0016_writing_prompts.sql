-- Reviewed Writing prompt catalogue, immutable assignment provenance, and
-- generation-scoped feedback work. Additive only: old freeform articles remain valid.

CREATE TABLE writing_prompts (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version = 1),
  family TEXT NOT NULL CHECK (family IN ('general', 'ielts')),
  task_type TEXT NOT NULL CHECK (
    task_type IN ('guided', 'academic_task_1', 'academic_task_2')
  ),
  prompt_kind TEXT NOT NULL CHECK (
    prompt_kind IN (
      'email', 'opinion', 'story', 'description',
      'line_graph', 'bar_chart', 'pie_chart', 'table', 'process', 'map',
      'opinion_essay', 'discussion', 'problem_solution',
      'advantages_disadvantages'
    )
  ),
  cefr_band TEXT CHECK (cefr_band IS NULL OR cefr_band IN ('A2', 'B1', 'B2', 'C1')),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 3 AND 120),
  prompt_text TEXT NOT NULL CHECK (length(prompt_text) BETWEEN 20 AND 2000),
  coach_id TEXT NOT NULL CHECK (coach_id IN ('general', 'ielts_task1', 'ielts_task2')),
  topic TEXT NOT NULL CHECK (length(topic) BETWEEN 2 AND 80),
  target_words INTEGER NOT NULL CHECK (target_words BETWEEN 40 AND 400),
  target_minutes INTEGER NOT NULL CHECK (target_minutes BETWEEN 5 AND 60),
  task_material_json TEXT CHECK (
    task_material_json IS NULL OR json_valid(task_material_json)
  ),
  asset_path TEXT,
  asset_alt_text TEXT,
  accessible_description TEXT,
  source_label TEXT NOT NULL DEFAULT 'bcailab original',
  content_hash TEXT NOT NULL CHECK (length(content_hash) = 64),
  review_manifest_json TEXT CHECK (
    review_manifest_json IS NULL OR json_valid(review_manifest_json)
  ),
  owner_approved_hash TEXT CHECK (
    owner_approved_hash IS NULL OR length(owner_approved_hash) = 64
  ),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (
    status IN ('draft', 'reviewed', 'published', 'retired')
  ),
  reviewed_at TEXT,
  published_at TEXT,
  retired_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (
    (family = 'general' AND task_type = 'guided' AND cefr_band IS NOT NULL
      AND coach_id = 'general' AND task_material_json IS NULL)
    OR
    (family = 'ielts' AND task_type = 'academic_task_1' AND cefr_band IS NULL
      AND coach_id = 'ielts_task1' AND task_material_json IS NOT NULL
      AND asset_path IS NOT NULL AND asset_alt_text IS NOT NULL
      AND accessible_description IS NOT NULL)
    OR
    (family = 'ielts' AND task_type = 'academic_task_2' AND cefr_band IS NULL
      AND coach_id = 'ielts_task2' AND task_material_json IS NULL)
  ),
  CHECK (status = 'draft' OR status = 'retired' OR review_manifest_json IS NOT NULL),
  CHECK (
    status <> 'published'
    OR (owner_approved_hash = content_hash AND published_at IS NOT NULL)
  )
);

CREATE INDEX idx_writing_prompts_catalogue
  ON writing_prompts(status, family, task_type, cefr_band, title);
CREATE INDEX idx_writing_prompts_hash
  ON writing_prompts(content_hash);

ALTER TABLE writing_articles
  ADD COLUMN prompt_id TEXT REFERENCES writing_prompts(id) ON DELETE RESTRICT;
ALTER TABLE writing_articles
  ADD COLUMN assignment_snapshot_json TEXT CHECK (
    assignment_snapshot_json IS NULL OR json_valid(assignment_snapshot_json)
  );
ALTER TABLE writing_articles
  ADD COLUMN start_key TEXT CHECK (
    start_key IS NULL OR length(start_key) BETWEEN 16 AND 200
  );

CREATE INDEX idx_writing_articles_prompt
  ON writing_articles(prompt_id, user_id, updated_at DESC);
CREATE UNIQUE INDEX idx_writing_articles_user_start
  ON writing_articles(user_id, start_key)
  WHERE start_key IS NOT NULL;

ALTER TABLE writing_revisions
  ADD COLUMN feedback_generation INTEGER NOT NULL DEFAULT 1 CHECK (feedback_generation >= 1);
ALTER TABLE writing_revisions
  ADD COLUMN feedback_started_at TEXT;

UPDATE writing_revisions
SET feedback_started_at = created_at
WHERE feedback_started_at IS NULL;

-- This intentionally fails migration if historical duplicate rounds exist. Resolve the
-- data explicitly before retrying rather than silently choosing one learner revision.
CREATE UNIQUE INDEX idx_writing_revisions_article_round_unique
  ON writing_revisions(article_id, round_number);
CREATE INDEX idx_writing_revisions_feedback_work
  ON writing_revisions(user_id, feedback_status, feedback_started_at);
