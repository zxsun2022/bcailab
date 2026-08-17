/// <reference types="@cloudflare/workers-types" />

import type { Db, WritingArticle, WritingRevision } from "./types";

const mapWritingArticle = (row: Record<string, unknown>): WritingArticle => ({
  id: String(row.id),
  user_id: String(row.user_id),
  title: row.title ? String(row.title) : null,
  essay_prompt: row.essay_prompt ? String(row.essay_prompt) : null,
  prompt_id: row.prompt_id ? String(row.prompt_id) : null,
  assignment_snapshot_json: row.assignment_snapshot_json
    ? String(row.assignment_snapshot_json)
    : null,
  start_key: row.start_key ? String(row.start_key) : null,
  agent_type: String(row.agent_type),
  status: String(row.status),
  created_at: String(row.created_at),
  updated_at: String(row.updated_at),
  deleted_at: row.deleted_at ? String(row.deleted_at) : null
});

const mapWritingRevision = (row: Record<string, unknown>): WritingRevision => ({
  id: String(row.id),
  article_id: String(row.article_id),
  user_id: String(row.user_id),
  round_number: Number(row.round_number),
  user_text: String(row.user_text),
  word_count: Number(row.word_count),
  feedback_json: row.feedback_json ? String(row.feedback_json) : null,
  feedback_status:
    row.feedback_status === "pending" || row.feedback_status === "failed"
      ? row.feedback_status
      : "completed",
  model_name: row.model_name ? String(row.model_name) : null,
  feedback_generation: Number(row.feedback_generation ?? 1),
  feedback_started_at: row.feedback_started_at ? String(row.feedback_started_at) : null,
  created_at: String(row.created_at)
});

export async function createWritingArticle(
  db: Db,
  input: {
    id?: string;
    userId: string;
    title?: string | null;
    essayPrompt?: string | null;
    promptId?: string | null;
    assignmentSnapshotJson?: string | null;
    startKey?: string | null;
    agentType: string;
  }
): Promise<WritingArticle> {
  const id = input.id ?? crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO writing_articles (
         id, user_id, title, essay_prompt, prompt_id,
         assignment_snapshot_json, start_key, agent_type
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      input.userId,
      input.title ?? null,
      input.essayPrompt ?? null,
      input.promptId ?? null,
      input.assignmentSnapshotJson ?? null,
      input.startKey ?? null,
      input.agentType
    )
    .run();

  const created = await getWritingArticleById(db, id, { includeDeleted: true });
  if (!created) throw new Error("Failed to create writing article.");
  return created;
}

export async function getWritingArticleByStartKey(
  db: Db,
  input: { userId: string; startKey: string }
): Promise<WritingArticle | null> {
  const result = await db
    .prepare(
      "SELECT * FROM writing_articles WHERE user_id = ? AND start_key = ? AND deleted_at IS NULL LIMIT 1"
    )
    .bind(input.userId, input.startKey)
    .first();
  return result ? mapWritingArticle(result) : null;
}

/**
 * Creates the learner's durable assignment and Round 1 as one D1 batch. A repeated
 * transport request with the same user/start key returns the original pair.
 */
export async function createWritingArticleWithFirstRevision(
  db: Db,
  input: {
    articleId?: string;
    revisionId?: string;
    userId: string;
    title?: string | null;
    essayPrompt?: string | null;
    promptId?: string | null;
    assignmentSnapshotJson?: string | null;
    startKey: string;
    agentType: string;
    userText: string;
    wordCount: number;
  }
): Promise<{ article: WritingArticle; revision: WritingRevision; created: boolean }> {
  const articleId = input.articleId ?? crypto.randomUUID();
  const revisionId = input.revisionId ?? crypto.randomUUID();
  try {
    await db.batch([
      db
        .prepare(
          `INSERT INTO writing_articles (
             id, user_id, title, essay_prompt, prompt_id,
             assignment_snapshot_json, start_key, agent_type
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          articleId,
          input.userId,
          input.title ?? null,
          input.essayPrompt ?? null,
          input.promptId ?? null,
          input.assignmentSnapshotJson ?? null,
          input.startKey,
          input.agentType
        ),
      db
        .prepare(
          `INSERT INTO writing_revisions (
             id, article_id, user_id, round_number, user_text, word_count,
             feedback_generation, feedback_started_at
           ) VALUES (?, ?, ?, 1, ?, ?, 1, datetime('now'))`
        )
        .bind(revisionId, articleId, input.userId, input.userText, input.wordCount)
    ]);
  } catch (error) {
    const existing = await getWritingArticleByStartKey(db, {
      userId: input.userId,
      startKey: input.startKey
    });
    if (!existing) throw error;
    if (
      existing.prompt_id !== (input.promptId ?? null) ||
      existing.assignment_snapshot_json !== (input.assignmentSnapshotJson ?? null)
    ) {
      throw new Error("The Writing start key is already associated with another assignment.");
    }
    const revision = await getLatestWritingRevision(db, existing.id);
    if (!revision || revision.round_number !== 1) throw error;
    return { article: existing, revision, created: false };
  }

  const [article, revision] = await Promise.all([
    getWritingArticleById(db, articleId, { includeDeleted: true }),
    getWritingRevisionById(db, revisionId)
  ]);
  if (!article || !revision) throw new Error("Failed to load the new Writing assignment.");
  return { article, revision, created: true };
}

export async function getWritingArticleById(
  db: Db,
  id: string,
  options: { includeDeleted?: boolean } = {}
): Promise<WritingArticle | null> {
  const { includeDeleted = false } = options;
  const query = includeDeleted
    ? "SELECT * FROM writing_articles WHERE id = ? LIMIT 1"
    : "SELECT * FROM writing_articles WHERE id = ? AND deleted_at IS NULL LIMIT 1";
  const result = await db.prepare(query).bind(id).first();
  return result ? mapWritingArticle(result) : null;
}

export async function listWritingArticlesByUser(
  db: Db,
  userId: string
): Promise<WritingArticle[]> {
  const result = await db
    .prepare(
      "SELECT * FROM writing_articles WHERE user_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC, created_at DESC"
    )
    .bind(userId)
    .all();
  if (!result.results) return [];
  return result.results.map(mapWritingArticle);
}

type WritingArticleCursor = {
  updatedAt: string;
  createdAt: string;
  id: string;
};

export type WritingArticlePage = {
  items: WritingArticle[];
  next_cursor: string | null;
};

export const encodeWritingArticleCursor = (
  article: Pick<WritingArticle, "updated_at" | "created_at" | "id">
): string => [
  encodeURIComponent(article.updated_at),
  encodeURIComponent(article.created_at),
  encodeURIComponent(article.id)
].join(":");

export const decodeWritingArticleCursor = (
  value: string | null | undefined
): WritingArticleCursor | null => {
  if (!value) return null;
  const [updatedAtText, createdAtText, idText, ...rest] = value.split(":");
  if (rest.length > 0 || !updatedAtText || !createdAtText || !idText) return null;
  try {
    return {
      updatedAt: decodeURIComponent(updatedAtText),
      createdAt: decodeURIComponent(createdAtText),
      id: decodeURIComponent(idText)
    };
  } catch {
    return null;
  }
};

export async function listWritingArticlePageByUser(
  db: Db,
  input: { userId: string; cursor?: string | null; limit?: number }
): Promise<WritingArticlePage> {
  const cursor = decodeWritingArticleCursor(input.cursor);
  const clauses = ["user_id = ?", "deleted_at IS NULL"];
  const bindings: Array<string | number> = [input.userId];
  if (cursor) {
    clauses.push(
      "(updated_at < ? OR (updated_at = ? AND (created_at < ? OR (created_at = ? AND id < ?))))"
    );
    bindings.push(
      cursor.updatedAt,
      cursor.updatedAt,
      cursor.createdAt,
      cursor.createdAt,
      cursor.id
    );
  }

  const limit = Math.min(Math.max(input.limit ?? 20, 1), 25);
  bindings.push(limit + 1);
  const result = await db
    .prepare(
      `SELECT * FROM writing_articles
       WHERE ${clauses.join(" AND ")}
       ORDER BY updated_at DESC, created_at DESC, id DESC
       LIMIT ?`
    )
    .bind(...bindings)
    .all();
  const rows = (result.results ?? []).map(mapWritingArticle);
  const hasNext = rows.length > limit;
  const items = rows.slice(0, limit);
  return {
    items,
    next_cursor: hasNext && items.length > 0
      ? encodeWritingArticleCursor(items[items.length - 1]!)
      : null
  };
}

export async function listRecentWritingArticlesByUser(
  db: Db,
  input: { userId: string; limit?: number }
): Promise<WritingArticle[]> {
  const limit = Math.min(Math.max(input.limit ?? 6, 1), 25);
  const result = await db
    .prepare(
      `SELECT * FROM writing_articles
       WHERE user_id = ? AND deleted_at IS NULL
       ORDER BY updated_at DESC, created_at DESC
       LIMIT ?`
    )
    .bind(input.userId, limit)
    .all();
  return (result.results ?? []).map(mapWritingArticle);
}

export async function updateWritingArticleTitle(
  db: Db,
  input: { id: string; userId: string; title: string }
): Promise<WritingArticle | null> {
  await db
    .prepare(
      "UPDATE writing_articles SET title = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ? AND deleted_at IS NULL"
    )
    .bind(input.title, input.id, input.userId)
    .run();
  return getWritingArticleById(db, input.id, { includeDeleted: true });
}

export async function touchWritingArticle(
  db: Db,
  input: { id: string; userId: string }
): Promise<void> {
  await db
    .prepare(
      "UPDATE writing_articles SET updated_at = datetime('now') WHERE id = ? AND user_id = ?"
    )
    .bind(input.id, input.userId)
    .run();
}

export async function softDeleteWritingArticle(
  db: Db,
  input: { id: string; userId: string }
): Promise<void> {
  await db
    .prepare(
      "UPDATE writing_articles SET deleted_at = datetime('now') WHERE id = ? AND user_id = ?"
    )
    .bind(input.id, input.userId)
    .run();
}

/** @deprecated Use softDeleteWritingArticle; retained for workspace API compatibility. */
export async function deleteWritingArticleBatch(
  db: Db,
  input: { id: string; userId: string }
): Promise<void> {
  await softDeleteWritingArticle(db, input);
}

// ---------------------------------------------------------------------------
// Writing Revisions
// ---------------------------------------------------------------------------

export async function createWritingRevision(
  db: Db,
  input: {
    id?: string;
    articleId: string;
    userId: string;
    roundNumber: number;
    userText: string;
    wordCount: number;
  }
): Promise<WritingRevision> {
  const id = input.id ?? crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO writing_revisions (
         id, article_id, user_id, round_number, user_text, word_count,
         feedback_generation, feedback_started_at
       ) VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'))`
    )
    .bind(id, input.articleId, input.userId, input.roundNumber, input.userText, input.wordCount)
    .run();

  const created = await getWritingRevisionById(db, id);
  if (!created) throw new Error("Failed to create writing revision.");
  return created;
}

export async function getWritingRevisionById(
  db: Db,
  id: string
): Promise<WritingRevision | null> {
  const result = await db
    .prepare("SELECT * FROM writing_revisions WHERE id = ? LIMIT 1")
    .bind(id)
    .first();
  return result ? mapWritingRevision(result) : null;
}

export async function listWritingRevisionsByArticle(
  db: Db,
  articleId: string
): Promise<WritingRevision[]> {
  const result = await db
    .prepare(
      "SELECT * FROM writing_revisions WHERE article_id = ? ORDER BY round_number ASC"
    )
    .bind(articleId)
    .all();
  if (!result.results) return [];
  return result.results.map(mapWritingRevision);
}

export async function getLatestWritingRevision(
  db: Db,
  articleId: string
): Promise<WritingRevision | null> {
  const result = await db
    .prepare(
      "SELECT * FROM writing_revisions WHERE article_id = ? ORDER BY round_number DESC LIMIT 1"
    )
    .bind(articleId)
    .first();
  return result ? mapWritingRevision(result) : null;
}

export async function updateWritingRevisionFeedback(
  db: Db,
  input: {
    id: string;
    userId: string;
    generation: number;
    feedbackJson: string | null;
    feedbackStatus: "pending" | "completed" | "failed";
    modelName: string;
  }
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE writing_revisions
       SET feedback_json = ?, feedback_status = ?, model_name = ?
       WHERE id = ? AND user_id = ? AND feedback_generation = ?`
    )
    .bind(
      input.feedbackJson,
      input.feedbackStatus,
      input.modelName,
      input.id,
      input.userId,
      input.generation
    )
    .run();
  return Number(result.meta.changes ?? 0) > 0;
}

export async function beginWritingRevisionFeedbackRetry(
  db: Db,
  input: { id: string; articleId: string; userId: string }
): Promise<WritingRevision | null> {
  const result = await db
    .prepare(
      `UPDATE writing_revisions
       SET feedback_json = NULL,
           feedback_status = 'pending',
           model_name = NULL,
           feedback_generation = feedback_generation + 1,
           feedback_started_at = datetime('now')
       WHERE id = ? AND article_id = ? AND user_id = ?
         AND (
           feedback_status <> 'pending'
           OR feedback_started_at IS NULL
           OR feedback_started_at <= datetime('now', '-60 seconds')
         )`
    )
    .bind(input.id, input.articleId, input.userId)
    .run();
  if (Number(result.meta.changes ?? 0) === 0) return null;
  const revision = await getWritingRevisionById(db, input.id);
  return revision?.article_id === input.articleId && revision.user_id === input.userId
    ? revision
    : null;
}

export async function softDeleteWritingRevisionsByArticle(
  db: Db,
  input: { articleId: string; userId: string }
): Promise<void> {
  await db
    .prepare(
      "DELETE FROM writing_revisions WHERE article_id = ? AND user_id = ?"
    )
    .bind(input.articleId, input.userId)
    .run();
}

export async function listCompletedWritingRevisionsByUser(
  db: Db,
  userId: string
): Promise<WritingRevision[]> {
  const result = await db
    .prepare(
      `SELECT r.* FROM writing_revisions r
       JOIN writing_articles a ON r.article_id = a.id
       WHERE r.user_id = ?
         AND r.feedback_status = 'completed'
         AND r.feedback_json IS NOT NULL
         AND a.deleted_at IS NULL
       ORDER BY r.created_at ASC`
    )
    .bind(userId)
    .all();
  return (result.results ?? []).map(mapWritingRevision);
}
