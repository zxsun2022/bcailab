/// <reference types="@cloudflare/workers-types" />

import type { Db, DictationAttempt, DictationPassage, DictationSentence } from "./types";

const PASSAGE_COLUMNS =
  "id, band, topic, title, voice_name, sentence_count, status, created_at, deleted_at";

const mapDictationPassage = (row: Record<string, unknown>): DictationPassage => ({
  id: String(row.id),
  band: String(row.band),
  topic: String(row.topic),
  title: String(row.title),
  voice_name: String(row.voice_name),
  sentence_count: Number(row.sentence_count ?? 0),
  status: String(row.status),
  created_at: String(row.created_at),
  deleted_at: row.deleted_at === null || row.deleted_at === undefined ? null : String(row.deleted_at)
});

const mapDictationSentence = (row: Record<string, unknown>): DictationSentence => ({
  id: String(row.id),
  passage_id: String(row.passage_id),
  idx: Number(row.idx ?? 0),
  text: String(row.text),
  r2_key: String(row.r2_key),
  audio_bytes: Number(row.audio_bytes ?? 0)
});

const mapDictationAttempt = (row: Record<string, unknown>): DictationAttempt => ({
  id: String(row.id),
  user_id: String(row.user_id),
  passage_id: String(row.passage_id),
  accuracy: Number(row.accuracy ?? 0),
  sentence_results: String(row.sentence_results),
  feedback_json:
    row.feedback_json === null || row.feedback_json === undefined ? null : String(row.feedback_json),
  status: String(row.status ?? "completed"),
  sentences_done: Number(row.sentences_done ?? 0),
  created_at: String(row.created_at),
  deleted_at: row.deleted_at === null || row.deleted_at === undefined ? null : String(row.deleted_at)
});

/** Published, non-deleted passages, ordered by band then creation. Global content: no user scope. */
export async function listDictationPassages(
  db: Db,
  options: { band?: string } = {}
): Promise<DictationPassage[]> {
  const where = ["deleted_at IS NULL", "status = 'published'"];
  const binds: string[] = [];
  if (options.band) {
    where.push("band = ?");
    binds.push(options.band);
  }
  const result = await db
    .prepare(
      `SELECT ${PASSAGE_COLUMNS} FROM dictation_passages WHERE ${where.join(" AND ")} ORDER BY band ASC, created_at ASC`
    )
    .bind(...binds)
    .all();
  return (result.results ?? []).map((row) => mapDictationPassage(row as Record<string, unknown>));
}

export async function getDictationPassageById(
  db: Db,
  id: string
): Promise<DictationPassage | null> {
  const row = await db
    .prepare(
      `SELECT ${PASSAGE_COLUMNS} FROM dictation_passages WHERE id = ? AND deleted_at IS NULL AND status = 'published'`
    )
    .bind(id)
    .first();
  return row ? mapDictationPassage(row as Record<string, unknown>) : null;
}

export async function listDictationSentences(
  db: Db,
  passageId: string
): Promise<DictationSentence[]> {
  const result = await db
    .prepare(
      "SELECT id, passage_id, idx, text, r2_key, audio_bytes FROM dictation_sentences WHERE passage_id = ? ORDER BY idx ASC"
    )
    .bind(passageId)
    .all();
  return (result.results ?? []).map((row) => mapDictationSentence(row as Record<string, unknown>));
}

/**
 * Sentence lookup for the public audio route. Joins the passage so unpublished or
 * soft-deleted material stops being served without a separate query.
 */
export async function getDictationSentenceById(
  db: Db,
  id: string
): Promise<DictationSentence | null> {
  const row = await db
    .prepare(
      `SELECT s.id, s.passage_id, s.idx, s.text, s.r2_key, s.audio_bytes
       FROM dictation_sentences s
       JOIN dictation_passages p ON p.id = s.passage_id
       WHERE s.id = ? AND p.deleted_at IS NULL AND p.status = 'published'`
    )
    .bind(id)
    .first();
  return row ? mapDictationSentence(row as Record<string, unknown>) : null;
}

export async function createDictationAttempt(
  db: Db,
  input: {
    id?: string;
    userId: string;
    passageId: string;
    accuracy: number;
    sentenceResults: string;
  }
): Promise<DictationAttempt> {
  const id = input.id ?? crypto.randomUUID();
  await db
    .prepare(
      "INSERT INTO dictation_attempts (id, user_id, passage_id, accuracy, sentence_results) VALUES (?, ?, ?, ?, ?)"
    )
    .bind(id, input.userId, input.passageId, input.accuracy, input.sentenceResults)
    .run();
  const created = await getDictationAttemptById(db, { id, userId: input.userId });
  if (!created) throw new Error("Failed to create dictation attempt.");
  return created;
}

export async function getDictationAttemptById(
  db: Db,
  input: { id: string; userId: string }
): Promise<DictationAttempt | null> {
  const row = await db
    .prepare(
      "SELECT id, user_id, passage_id, accuracy, sentence_results, feedback_json, status, sentences_done, created_at, deleted_at FROM dictation_attempts WHERE id = ? AND user_id = ? AND deleted_at IS NULL"
    )
    .bind(input.id, input.userId)
    .first();
  return row ? mapDictationAttempt(row as Record<string, unknown>) : null;
}

export async function listDictationAttemptsByUser(
  db: Db,
  input: { userId: string; limit?: number }
): Promise<DictationAttempt[]> {
  const result = await db
    .prepare(
      "SELECT id, user_id, passage_id, accuracy, sentence_results, feedback_json, status, sentences_done, created_at, deleted_at FROM dictation_attempts WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT ?"
    )
    .bind(input.userId, input.limit ?? 50)
    .all();
  return (result.results ?? []).map((row) => mapDictationAttempt(row as Record<string, unknown>));
}

/** Fills the null feedback slot after the deferred LLM call resolves. */
export async function setDictationAttemptFeedback(
  db: Db,
  input: { id: string; userId: string; feedbackJson: string }
): Promise<void> {
  await db
    .prepare("UPDATE dictation_attempts SET feedback_json = ? WHERE id = ? AND user_id = ?")
    .bind(input.feedbackJson, input.id, input.userId)
    .run();
}


export async function getInProgressDictationAttempt(
  db: Db,
  input: { userId: string; passageId: string }
): Promise<DictationAttempt | null> {
  const row = await db
    .prepare(
      `SELECT id, user_id, passage_id, accuracy, sentence_results, feedback_json, status,
              sentences_done, created_at, deleted_at
         FROM dictation_attempts
        WHERE user_id = ? AND passage_id = ? AND status = 'in_progress' AND deleted_at IS NULL
        ORDER BY created_at DESC LIMIT 1`
    )
    .bind(input.userId, input.passageId)
    .first();
  return row ? mapDictationAttempt(row as Record<string, unknown>) : null;
}

/**
 * Creates or updates the in-progress attempt after a sentence is checked.
 *
 * `accuracy` here is the running score over checked sentences only, so it is not
 * comparable with a finished attempt's — which is why partial attempts are excluded from
 * `passage_stats` until they complete.
 */
export async function saveDictationAttemptProgress(
  db: Db,
  input: {
    attemptId: string | null;
    userId: string;
    passageId: string;
    accuracy: number;
    sentenceResults: string;
    sentencesDone: number;
  }
): Promise<string> {
  if (input.attemptId) {
    await db
      .prepare(
        `UPDATE dictation_attempts
            SET accuracy = ?, sentence_results = ?, sentences_done = ?
          WHERE id = ? AND user_id = ? AND status = 'in_progress'`
      )
      .bind(
        input.accuracy,
        input.sentenceResults,
        input.sentencesDone,
        input.attemptId,
        input.userId
      )
      .run();
    return input.attemptId;
  }

  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO dictation_attempts
         (id, user_id, passage_id, accuracy, sentence_results, status, sentences_done)
       VALUES (?, ?, ?, ?, ?, 'in_progress', ?)`
    )
    .bind(id, input.userId, input.passageId, input.accuracy, input.sentenceResults, input.sentencesDone)
    .run();
  return id;
}

/** Finalizes an in-progress attempt with the authoritative whole-passage score. */
export async function completeDictationAttempt(
  db: Db,
  input: {
    attemptId: string;
    userId: string;
    accuracy: number;
    sentenceResults: string;
    sentencesDone: number;
  }
): Promise<void> {
  await db
    .prepare(
      `UPDATE dictation_attempts
          SET accuracy = ?, sentence_results = ?, sentences_done = ?, status = 'completed'
        WHERE id = ? AND user_id = ?`
    )
    .bind(
      input.accuracy,
      input.sentenceResults,
      input.sentencesDone,
      input.attemptId,
      input.userId
    )
    .run();
}
