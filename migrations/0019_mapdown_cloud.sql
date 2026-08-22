-- Mapdown account save, independent sessions, frozen publications, and abuse reports.
-- Apply before deploying code that reads these tables (ADR 0008).

CREATE TABLE mapdown_handoff_nonces (
  nonce_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  audience TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_mapdown_handoff_nonces_expiry
  ON mapdown_handoff_nonces(expires_at);

CREATE TABLE mapdown_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_mapdown_sessions_user
  ON mapdown_sessions(user_id, expires_at DESC);
CREATE INDEX idx_mapdown_sessions_expiry
  ON mapdown_sessions(expires_at);

CREATE TABLE mapdown_documents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  client_document_id TEXT NOT NULL,
  title TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  snapshot_digest TEXT NOT NULL,
  node_count INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (user_id, client_document_id)
);

CREATE INDEX idx_mapdown_documents_user_updated
  ON mapdown_documents(user_id, updated_at DESC, id DESC);

-- Revoked rows remain as a moderation/audit record. The partial unique index permits a later
-- republish to receive a new public id while allowing only one active publication per document.
CREATE TABLE mapdown_publications (
  public_id TEXT PRIMARY KEY,
  document_id TEXT,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  markdown TEXT NOT NULL,
  svg_key TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  revoked_at INTEGER,
  FOREIGN KEY (document_id) REFERENCES mapdown_documents(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_mapdown_publications_one_active_document
  ON mapdown_publications(document_id)
  WHERE revoked_at IS NULL;
CREATE INDEX idx_mapdown_publications_user_active
  ON mapdown_publications(user_id, revoked_at, updated_at DESC);

CREATE TABLE mapdown_publication_reports (
  id TEXT PRIMARY KEY,
  public_id TEXT NOT NULL,
  reporter_digest TEXT NOT NULL,
  reason TEXT NOT NULL,
  details TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'reviewed', 'dismissed', 'actioned'))
);

CREATE INDEX idx_mapdown_publication_reports_rate
  ON mapdown_publication_reports(public_id, reporter_digest, created_at DESC);
CREATE INDEX idx_mapdown_publication_reports_status
  ON mapdown_publication_reports(status, created_at ASC);
