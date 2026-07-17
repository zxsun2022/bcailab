-- Daily translation usage counters (anonymous + signed-in quotas).
-- subject examples: "user:<id>", "anon:<cookie-id>", "ip:<address>"
CREATE TABLE IF NOT EXISTS translate_usage (
  subject TEXT NOT NULL,
  day TEXT NOT NULL,
  requests INTEGER NOT NULL DEFAULT 0,
  chars INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (subject, day)
);

CREATE INDEX IF NOT EXISTS translate_usage_day_idx ON translate_usage(day);
