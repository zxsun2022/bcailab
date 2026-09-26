/// <reference types="@cloudflare/workers-types" />

import type { Db, WritingPracticeItem } from "./types";

const STATUSES = new Set(["fix", "transfer", "finished", "skipped", "disputed"]);

const mapWritingPracticeItem = (row: Record<string, unknown>): WritingPracticeItem => ({
  id: String(row.id),
  user_id: String(row.user_id),
  article_id: String(row.article_id),
  revision_id: String(row.revision_id),
  feedback_generation: Number(row.feedback_generation),
  annotation_index: Number(row.annotation_index),
  annotation_json: String(row.annotation_json),
  feedback_language: row.feedback_language === "zh" ? "zh" : "en",
  status: (STATUSES.has(String(row.status)) ? String(row.status) : "fix") as WritingPracticeItem["status"],
  transfer_prompt: row.transfer_prompt ? String(row.transfer_prompt) : null,
  attempts_json: String(row.attempts_json ?? "[]"),
  version: Number(row.version ?? 1),
  created_at: String(row.created_at),
  updated_at: String(row.updated_at),
  ended_at: row.ended_at ? String(row.ended_at) : null
});

/**
 * Starts a practice, or returns the one that already exists for this annotation. Starting twice
 * (a double click, two tabs) must not create two items for the same annotation.
 */
export async function startWritingPracticeItem(
  db: Db,
  input: {
    userId: string;
    articleId: string;
    revisionId: string;
    feedbackGeneration: number;
    annotationIndex: number;
    annotationJson: string;
    feedbackLanguage: "en" | "zh";
  }
): Promise<WritingPracticeItem> {
  await db
    .prepare(
      `INSERT INTO writing_practice_items (
         id, user_id, article_id, revision_id, feedback_generation,
         annotation_index, annotation_json, feedback_language
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id, revision_id, feedback_generation, annotation_index) DO NOTHING`
    )
    .bind(
      crypto.randomUUID(),
      input.userId,
      input.articleId,
      input.revisionId,
      input.feedbackGeneration,
      input.annotationIndex,
      input.annotationJson,
      input.feedbackLanguage
    )
    .run();
  const row = await db
    .prepare(
      `SELECT * FROM writing_practice_items
       WHERE user_id = ? AND revision_id = ? AND feedback_generation = ? AND annotation_index = ?
       LIMIT 1`
    )
    .bind(input.userId, input.revisionId, input.feedbackGeneration, input.annotationIndex)
    .first();
  if (!row) throw new Error("Failed to start the practice item.");
  return mapWritingPracticeItem(row);
}

export async function getWritingPracticeItem(
  db: Db,
  input: { id: string; userId: string }
): Promise<WritingPracticeItem | null> {
  const row = await db
    .prepare("SELECT * FROM writing_practice_items WHERE id = ? AND user_id = ? LIMIT 1")
    .bind(input.id, input.userId)
    .first();
  return row ? mapWritingPracticeItem(row) : null;
}

/** The practice items of one feedback generation, for marking annotations on the round. */
export async function listWritingPracticeItemsByRevision(
  db: Db,
  input: { userId: string; revisionId: string; feedbackGeneration: number }
): Promise<WritingPracticeItem[]> {
  const result = await db
    .prepare(
      `SELECT * FROM writing_practice_items
       WHERE user_id = ? AND revision_id = ? AND feedback_generation = ?
       ORDER BY annotation_index ASC`
    )
    .bind(input.userId, input.revisionId, input.feedbackGeneration)
    .all();
  return (result.results ?? []).map(mapWritingPracticeItem);
}

/**
 * Writes the next state only if nobody else wrote since `version` was read. Returns false when
 * another request got there first, so a double submit cannot record two answers as one.
 */
export async function updateWritingPracticeItem(
  db: Db,
  input: {
    id: string;
    userId: string;
    version: number;
    status: WritingPracticeItem["status"];
    transferPrompt: string | null;
    attemptsJson: string;
    ended: boolean;
  }
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE writing_practice_items
       SET status = ?, transfer_prompt = ?, attempts_json = ?, version = version + 1,
           updated_at = datetime('now'),
           ended_at = CASE WHEN ? THEN datetime('now') ELSE ended_at END
       WHERE id = ? AND user_id = ? AND version = ?`
    )
    .bind(
      input.status,
      input.transferPrompt,
      input.attemptsJson,
      input.ended ? 1 : 0,
      input.id,
      input.userId,
      input.version
    )
    .run();
  return Number(result.meta.changes ?? 0) > 0;
}
