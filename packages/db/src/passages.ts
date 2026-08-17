/// <reference types="@cloudflare/workers-types" />

import type { Db, Passage, PassageSentence, PassageStats, PassageTag, ReadingPassageStat, RecentReadingAttempt } from "./types";

const PASSAGE_COLS = `id, user_id, title, content_text, band, topic, word_count,
  sentence_count, mean_sentence_words, rare_word_ratio, has_sentence_audio, is_trial,
  reference_audio_status, reference_audio_r2_key, reference_audio_bytes,
  reference_voice_name, reference_audio_created_at, status, source,
  created_at, updated_at, deleted_at`;

const str = (value: unknown): string | null =>
  value === null || value === undefined ? null : String(value);

const mapPassage = (row: Record<string, unknown>): Passage => ({
  id: String(row.id),
  user_id: str(row.user_id),
  title: String(row.title),
  content_text: String(row.content_text),
  band: str(row.band),
  topic: str(row.topic),
  word_count: Number(row.word_count ?? 0),
  sentence_count: Number(row.sentence_count ?? 0),
  mean_sentence_words: Number(row.mean_sentence_words ?? 0),
  rare_word_ratio: Number(row.rare_word_ratio ?? 0),
  has_sentence_audio: Number(row.has_sentence_audio ?? 0),
  is_trial: Number(row.is_trial ?? 0),
  reference_audio_status: str(row.reference_audio_status) as Passage["reference_audio_status"],
  reference_audio_r2_key: str(row.reference_audio_r2_key),
  reference_audio_bytes:
    row.reference_audio_bytes === null || row.reference_audio_bytes === undefined
      ? null
      : Number(row.reference_audio_bytes),
  reference_voice_name: str(row.reference_voice_name),
  reference_audio_created_at: str(row.reference_audio_created_at),
  status: String(row.status),
  source: String(row.source),
  created_at: String(row.created_at),
  updated_at: String(row.updated_at),
  deleted_at: str(row.deleted_at)
});

const mapPassageSentence = (row: Record<string, unknown>): PassageSentence => ({
  id: String(row.id),
  passage_id: String(row.passage_id),
  idx: Number(row.idx ?? 0),
  text: String(row.text),
  r2_key: str(row.r2_key),
  audio_bytes:
    row.audio_bytes === null || row.audio_bytes === undefined ? null : Number(row.audio_bytes)
});

/**
 * **The authorization boundary for passages.** A passage is readable when it is global
 * library content (`user_id IS NULL`) or owned by the caller. Every read path must go
 * through this helper rather than re-spelling the predicate — getting it wrong exposes
 * one user's passage to another.
 *
 * Pass `userId: null` for anonymous callers, who may only reach library content.
 */

export async function getPassageForUser(
  db: Db,
  input: { id: string; userId: string | null }
): Promise<Passage | null> {
  const row = await db
    .prepare(
      `SELECT ${PASSAGE_COLS} FROM passages
       WHERE id = ? AND deleted_at IS NULL
         AND (user_id IS NULL OR user_id = ?)`
    )
    .bind(input.id, input.userId)
    .first();
  return row ? mapPassage(row as Record<string, unknown>) : null;
}

/** Published global library passages, optionally filtered by band. */
export async function listLibraryPassages(
  db: Db,
  options: { band?: string; requireSentenceAudio?: boolean; limit?: number } = {}
): Promise<Passage[]> {
  const where = ["user_id IS NULL", "deleted_at IS NULL", "status = 'published'"];
  const binds: (string | number)[] = [];
  if (options.band) {
    where.push("band = ?");
    binds.push(options.band);
  }
  if (options.requireSentenceAudio) where.push("has_sentence_audio = 1");
  // `limit` exists for callers that must stay bounded as the library grows (the Home's
  // recommendation inputs). Catalogue pages deliberately omit it and page/filter instead.
  const limitClause = options.limit ? " LIMIT ?" : "";
  if (options.limit) binds.push(options.limit);
  const result = await db
    .prepare(
      `SELECT ${PASSAGE_COLS} FROM passages WHERE ${where.join(" AND ")}
       ORDER BY band ASC, created_at ASC${limitClause}`
    )
    .bind(...binds)
    .all();
  return (result.results ?? []).map((row) => mapPassage(row as Record<string, unknown>));
}

/**
 * Recent reading attempts for the Home's activity strip.
 *
 * Bounded by `limit`. Reading attempts have pointed at the unified `passages` table since
 * the material-layer migration; every attempt reader must join that table so library and
 * user-created material are both represented.
 */
export async function listRecentReadingAttempts(
  db: Db,
  input: { userId: string; limit?: number }
): Promise<RecentReadingAttempt[]> {
  const result = await db
    .prepare(
      `SELECT a.id AS id, a.passage_id AS passage_id, a.created_at AS created_at,
              p.title AS passage_title, e.output_json AS output_json
         FROM esl_reading_attempts a
         JOIN passages p ON p.id = a.passage_id
         LEFT JOIN esl_reading_evaluations e
           ON e.id = (
             SELECT e2.id FROM esl_reading_evaluations e2
              WHERE e2.attempt_id = a.id
              ORDER BY e2.created_at DESC, e2.id DESC LIMIT 1
           )
        WHERE a.user_id = ? AND a.deleted_at IS NULL AND p.deleted_at IS NULL
        ORDER BY a.created_at DESC
        LIMIT ?`
    )
    .bind(input.userId, input.limit ?? 20)
    .all();
  return (result.results ?? []).map((row) => {
    const record = row as Record<string, unknown>;
    let score: number | null = null;
    if (record.output_json) {
      try {
        const parsed = JSON.parse(String(record.output_json)) as { scores?: { overall?: unknown } };
        const overall = Number(parsed.scores?.overall);
        if (Number.isFinite(overall)) score = overall;
      } catch {
        // A malformed evaluation must not take down the Home; it just has no score.
      }
    }
    return {
      id: String(record.id),
      passage_id: String(record.passage_id),
      passage_title: record.passage_title ? String(record.passage_title) : null,
      created_at: String(record.created_at),
      overall_score: score
    };
  });
}

/**
 * CEFR bands represented by this learner's Reading and Dictation history.
 *
 * The result is naturally bounded by the six CEFR values even when the attempt history
 * grows. Joining the practised passages here avoids deriving coverage from a bounded
 * recommendation candidate window, which can omit older material.
 */
export async function listPractisedPassageBandsByUser(
  db: Db,
  userId: string
): Promise<string[]> {
  const result = await db
    .prepare(
      `SELECT DISTINCT band
         FROM (
           SELECT p.band AS band
             FROM dictation_attempts a
             JOIN passages p ON p.id = a.passage_id
            WHERE a.user_id = ? AND a.deleted_at IS NULL AND p.deleted_at IS NULL
           UNION
           SELECT p.band AS band
             FROM esl_reading_attempts a
             JOIN passages p ON p.id = a.passage_id
            WHERE a.user_id = ? AND a.deleted_at IS NULL AND p.deleted_at IS NULL
         )
        WHERE band IS NOT NULL
        ORDER BY band ASC`
    )
    .bind(userId, userId)
    .all();
  return (result.results ?? []).map((row) => String((row as Record<string, unknown>).band));
}

/**
 * Per-passage reading practice state for one learner, so a catalogue can show what has
 * been done without a query per card. Bounded by the learner's own attempts.
 *
 * The score lives inside the evaluation JSON, so this reads it with `json_extract` rather
 * than pulling every row into the worker to parse.
 */
export async function listReadingPassageStatsByUser(
  db: Db,
  userId: string
): Promise<ReadingPassageStat[]> {
  const result = await db
    .prepare(
      `SELECT a.passage_id AS passage_id,
              COUNT(a.id) AS attempts,
              MAX(CAST(json_extract(e.output_json, '$.scores.overall') AS REAL)) AS best_score,
              SUM(CASE WHEN e.id IS NULL THEN 1 ELSE 0 END) AS pending
         FROM esl_reading_attempts a
         LEFT JOIN esl_reading_evaluations e ON e.attempt_id = a.id
        WHERE a.user_id = ? AND a.deleted_at IS NULL
        GROUP BY a.passage_id`
    )
    .bind(userId)
    .all();
  return (result.results ?? []).map((row) => {
    const record = row as Record<string, unknown>;
    // Guard the null explicitly: an attempt with no evaluation yet yields SQL NULL here,
    // and `Number(null)` is 0 — which would render as a real score of zero rather than
    // "not evaluated".
    const best =
      record.best_score == null ? null : Number(record.best_score);
    return {
      passage_id: String(record.passage_id),
      attempts: Number(record.attempts ?? 0),
      best_score: best != null && Number.isFinite(best) ? best : null,
      pending: Number(record.pending ?? 0)
    };
  });
}

/** A user's own passages only — never library content. */
export async function listPassagesByUser(db: Db, userId: string): Promise<Passage[]> {
  const result = await db
    .prepare(
      `SELECT ${PASSAGE_COLS} FROM passages
       WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at DESC`
    )
    .bind(userId)
    .all();
  return (result.results ?? []).map((row) => mapPassage(row as Record<string, unknown>));
}

export async function listPassageSentences(
  db: Db,
  passageId: string
): Promise<PassageSentence[]> {
  const result = await db
    .prepare(
      "SELECT id, passage_id, idx, text, r2_key, audio_bytes FROM passage_sentences WHERE passage_id = ? ORDER BY idx ASC"
    )
    .bind(passageId)
    .all();
  return (result.results ?? []).map((row) => mapPassageSentence(row as Record<string, unknown>));
}

/**
 * Sentence lookup for the public dictation audio route. Joins the passage so
 * unpublished, deleted, or non-library material stops being served.
 */
export async function getLibraryPassageSentenceById(
  db: Db,
  id: string
): Promise<PassageSentence | null> {
  const row = await db
    .prepare(
      `SELECT s.id, s.passage_id, s.idx, s.text, s.r2_key, s.audio_bytes
       FROM passage_sentences s
       JOIN passages p ON p.id = s.passage_id
       WHERE s.id = ? AND p.user_id IS NULL AND p.deleted_at IS NULL AND p.status = 'published'`
    )
    .bind(id)
    .first();
  return row ? mapPassageSentence(row as Record<string, unknown>) : null;
}

export async function createUserPassage(
  db: Db,
  input: { id?: string; userId: string; title: string; contentText: string }
): Promise<Passage> {
  const id = input.id ?? crypto.randomUUID();
  await db
    .prepare(
      "INSERT INTO passages (id, user_id, title, content_text, source, status) VALUES (?, ?, ?, ?, 'user', 'published')"
    )
    .bind(id, input.userId, input.title, input.contentText)
    .run();
  const created = await getPassageForUser(db, { id, userId: input.userId });
  if (!created) throw new Error("Failed to create passage.");
  return created;
}

export async function softDeleteUserPassage(
  db: Db,
  input: { id: string; userId: string }
): Promise<void> {
  await db
    .prepare(
      "UPDATE passages SET deleted_at = datetime('now') WHERE id = ? AND user_id = ?"
    )
    .bind(input.id, input.userId)
    .run();
}

/* ---------- tags ---------- */

export async function getPassageTags(db: Db, passageId: string): Promise<PassageTag[]> {
  const result = await db
    .prepare("SELECT tag, count FROM passage_tags WHERE passage_id = ? ORDER BY count DESC")
    .bind(passageId)
    .all();
  return (result.results ?? []).map((row) => ({
    tag: String((row as Record<string, unknown>).tag),
    count: Number((row as Record<string, unknown>).count ?? 0)
  }));
}

/** Replaces a passage's tags wholesale — the tagger is re-runnable by design. */
export async function replacePassageTags(
  db: Db,
  passageId: string,
  tags: PassageTag[]
): Promise<void> {
  const statements = [
    db.prepare("DELETE FROM passage_tags WHERE passage_id = ?").bind(passageId)
  ];
  const insert = db.prepare(
    "INSERT INTO passage_tags (passage_id, tag, count) VALUES (?, ?, ?)"
  );
  for (const entry of tags) {
    if (entry.count > 0) statements.push(insert.bind(passageId, entry.tag, entry.count));
  }
  await db.batch(statements);
}

/** Writes the derived difficulty metrics computed by the tagger. */
export async function updatePassageMetrics(
  db: Db,
  input: {
    id: string;
    wordCount: number;
    sentenceCount: number;
    meanSentenceWords: number;
    rareWordRatio: number;
  }
): Promise<void> {
  await db
    .prepare(
      `UPDATE passages SET word_count = ?, sentence_count = ?, mean_sentence_words = ?,
         rare_word_ratio = ?, updated_at = datetime('now') WHERE id = ?`
    )
    .bind(
      input.wordCount,
      input.sentenceCount,
      input.meanSentenceWords,
      input.rareWordRatio,
      input.id
    )
    .run();
}

/* ---------- empirical difficulty ---------- */

/**
 * Records one scored attempt against a passage. Accumulates only — deciding when a
 * measured difficulty should override a declared band belongs to the matching service.
 *
 * **Library passages only.** The `WHERE EXISTS` guard makes this a no-op for
 * user-created material: a passage only one person will ever practise cannot be
 * calibrated, and counting it would dilute the meaning of the table. Keeping the rule
 * in the statement rather than at the call sites means it cannot be forgotten by one
 * of them.
 *
 * Anonymous attempts count. The row carries no identity — it is a fact about the
 * passage, not the learner — and excluding them would throw away calibration data.
 *
 * `accuracy` is normalized 0..1 for every mode, so dictation and reading stay
 * comparable.
 */
export async function recordPassageAttemptStat(
  db: Db,
  input: { passageId: string; mode: "dictation" | "reading"; accuracy: number }
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO passage_stats (passage_id, mode, attempt_count, accuracy_sum)
       SELECT ?, ?, 1, ?
        WHERE EXISTS (SELECT 1 FROM passages WHERE id = ? AND user_id IS NULL)
       ON CONFLICT(passage_id, mode) DO UPDATE SET
         attempt_count = attempt_count + 1,
         accuracy_sum = accuracy_sum + excluded.accuracy_sum,
         updated_at = datetime('now')`
    )
    .bind(input.passageId, input.mode, input.accuracy, input.passageId)
    .run();
}

export async function getPassageStats(
  db: Db,
  passageId: string
): Promise<PassageStats[]> {
  const result = await db
    .prepare(
      "SELECT passage_id, mode, attempt_count, accuracy_sum FROM passage_stats WHERE passage_id = ?"
    )
    .bind(passageId)
    .all();
  return (result.results ?? []).map((row) => {
    const record = row as Record<string, unknown>;
    return {
      passage_id: String(record.passage_id),
      mode: String(record.mode),
      attempt_count: Number(record.attempt_count ?? 0),
      accuracy_sum: Number(record.accuracy_sum ?? 0)
    };
  });
}

/**
 * A single published library passage. Dictation uses this rather than
 * `getPassageForUser`: dictation only ever serves global material, for signed-in and
 * anonymous learners alike, so ownership never enters the question.
 */
export async function getLibraryPassageById(db: Db, id: string): Promise<Passage | null> {
  const row = await db
    .prepare(
      `SELECT ${PASSAGE_COLS} FROM passages
       WHERE id = ? AND user_id IS NULL AND deleted_at IS NULL AND status = 'published'`
    )
    .bind(id)
    .first();
  return row ? mapPassage(row as Record<string, unknown>) : null;
}

/* ---------- reference audio (whole-passage, for reading practice) ---------- */

/**
 * Reference-audio state transitions. Scoped to the owner: library passages get their
 * reference audio from the offline seed pipeline, not from this runtime path, so an
 * unowned passage should never reach these.
 *
 * Each returns whether a row actually changed. `false` means the passage no longer
 * exists or is not the caller's — it was deleted while a background synthesis task was
 * in flight — which the caller uses to clean up the orphaned audio it just uploaded.
 */
export async function markPassageReferenceAudioPending(
  db: Db,
  input: { id: string; userId: string }
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE passages SET reference_audio_status = 'pending', reference_audio_r2_key = NULL,
         reference_audio_bytes = NULL, updated_at = datetime('now')
       WHERE id = ? AND user_id = ?`
    )
    .bind(input.id, input.userId)
    .run();
  return Number(result.meta?.changes ?? 0) > 0;
}

export async function markPassageReferenceAudioCompleted(
  db: Db,
  input: { id: string; userId: string; voiceName: string; r2Key: string; audioBytes: number }
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE passages SET reference_audio_status = 'completed', reference_voice_name = ?,
         reference_audio_r2_key = ?, reference_audio_bytes = ?,
         reference_audio_created_at = datetime('now'), updated_at = datetime('now')
       WHERE id = ? AND user_id = ?`
    )
    .bind(input.voiceName, input.r2Key, input.audioBytes, input.id, input.userId)
    .run();
  return Number(result.meta?.changes ?? 0) > 0;
}

export async function markPassageReferenceAudioFailed(
  db: Db,
  input: { id: string; userId: string }
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE passages SET reference_audio_status = 'failed', reference_voice_name = NULL,
         reference_audio_r2_key = NULL, reference_audio_bytes = NULL,
         updated_at = datetime('now')
       WHERE id = ? AND user_id = ?`
    )
    .bind(input.id, input.userId)
    .run();
  return Number(result.meta?.changes ?? 0) > 0;
}

/** Owner-scoped lookup, including soft-deleted rows, for background TTS tasks. */
export async function getOwnedPassage(
  db: Db,
  input: { id: string; userId: string }
): Promise<Passage | null> {
  const row = await db
    .prepare(`SELECT ${PASSAGE_COLS} FROM passages WHERE id = ? AND user_id = ?`)
    .bind(input.id, input.userId)
    .first();
  return row ? mapPassage(row as Record<string, unknown>) : null;
}

/**
 * The library passage anonymous visitors practise in the reading trial.
 *
 * `is_trial` is an override, not a requirement: the migration flags a row where content
 * already exists, but a freshly-seeded database has none, so this falls back to the
 * oldest B1 passage and then to the oldest library passage. Robust in every environment,
 * and changing the choice in production is a one-row UPDATE rather than a deploy.
 */
export async function getTrialPassage(db: Db): Promise<Passage | null> {
  const row = await db
    .prepare(
      `SELECT ${PASSAGE_COLS} FROM passages
        WHERE user_id IS NULL AND deleted_at IS NULL AND status = 'published'
        ORDER BY is_trial DESC,
                 CASE band WHEN 'B1' THEN 0 ELSE 1 END ASC,
                 created_at ASC, id ASC
        LIMIT 1`
    )
    .first();
  return row ? mapPassage(row as Record<string, unknown>) : null;
}
