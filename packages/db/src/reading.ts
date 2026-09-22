/// <reference types="@cloudflare/workers-types" />

import type {
  Db,
  EslReadingAttempt,
  EslReadingAttemptWithEvaluation,
  EslReadingEvaluation
} from "./types";
import { isMissingColumnError } from "./helpers";

const mapEslReadingAttempt = (row: Record<string, unknown>): EslReadingAttempt => ({
  id: String(row.id),
  passage_id: String(row.passage_id),
  user_id: String(row.user_id),
  mode: String(row.mode),
  audio_format: String(row.audio_format),
  audio_mime_type: String(row.audio_mime_type),
  r2_key: String(row.r2_key),
  audio_bytes: Number(row.audio_bytes),
  duration_ms: row.duration_ms != null ? Number(row.duration_ms) : null,
  evaluation_status:
    row.evaluation_status === "pending" || row.evaluation_status === "failed"
      ? row.evaluation_status
      : "completed",
  evaluation_run_id: row.evaluation_run_id ? String(row.evaluation_run_id) : null,
  evaluation_started_at: row.evaluation_started_at ? String(row.evaluation_started_at) : null,
  created_at: String(row.created_at),
  deleted_at: row.deleted_at ? String(row.deleted_at) : null
});

const mapEslReadingEvaluation = (row: Record<string, unknown>): EslReadingEvaluation => ({
  id: String(row.id),
  attempt_id: String(row.attempt_id),
  user_id: String(row.user_id),
  model_name: String(row.model_name),
  rubric_version: String(row.rubric_version),
  output_json: String(row.output_json),
  created_at: String(row.created_at)
});

const mapEslReadingAttemptWithEvaluation = (
  row: Record<string, unknown>
): EslReadingAttemptWithEvaluation => ({
  ...mapEslReadingAttempt(row),
  passage_title: row.passage_title ? String(row.passage_title) : null,
  passage_content_text: String(row.passage_content_text),
  evaluation_output_json: String(row.evaluation_output_json)
});

export async function createEslReadingAttempt(
  db: Db,
  input: {
    id?: string;
    passageId: string;
    userId: string;
    mode: string;
    audioFormat: string;
    audioMimeType: string;
    r2Key: string;
    audioBytes: number;
    durationMs?: number | null;
    evaluationStatus?: "pending" | "completed" | "failed";
    /** The first evaluation run, claimed in the same insert that creates the attempt. */
    evaluationRunId?: string | null;
  }
): Promise<{ attempt: EslReadingAttempt; supportsAsyncEvaluationStatus: boolean }> {
  const id = input.id ?? crypto.randomUUID();

  const loadCreatedAttempt = async () => {
    const created = await getEslReadingAttemptById(db, id, { includeDeleted: true });
    if (!created) {
      throw new Error("Failed to create esl reading attempt.");
    }
    return created;
  };

  try {
    await db
      .prepare(
        "INSERT INTO esl_reading_attempts (id, passage_id, user_id, mode, audio_format, audio_mime_type, r2_key, audio_bytes, duration_ms, evaluation_status, evaluation_run_id, evaluation_started_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? IS NULL THEN NULL ELSE datetime('now') END)"
      )
      .bind(
        id,
        input.passageId,
        input.userId,
        input.mode,
        input.audioFormat,
        input.audioMimeType,
        input.r2Key,
        input.audioBytes,
        input.durationMs ?? null,
        input.evaluationStatus ?? "pending",
        input.evaluationRunId ?? null,
        input.evaluationRunId ?? null
      )
      .run();
    return {
      attempt: await loadCreatedAttempt(),
      supportsAsyncEvaluationStatus: true
    };
  } catch (error) {
    if (!isMissingColumnError(error, "evaluation_status")) {
      if (!isMissingColumnError(error, "duration_ms")) {
        throw error;
      }
      await db
        .prepare(
          "INSERT INTO esl_reading_attempts (id, passage_id, user_id, mode, audio_format, audio_mime_type, r2_key, audio_bytes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(
          id,
          input.passageId,
          input.userId,
          input.mode,
          input.audioFormat,
          input.audioMimeType,
          input.r2Key,
          input.audioBytes
        )
        .run();
      return {
        attempt: await loadCreatedAttempt(),
        supportsAsyncEvaluationStatus: false
      };
    }

    try {
      await db
        .prepare(
          "INSERT INTO esl_reading_attempts (id, passage_id, user_id, mode, audio_format, audio_mime_type, r2_key, audio_bytes, duration_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(
          id,
          input.passageId,
          input.userId,
          input.mode,
          input.audioFormat,
          input.audioMimeType,
          input.r2Key,
          input.audioBytes,
          input.durationMs ?? null
        )
        .run();
    } catch (legacyError) {
      if (!isMissingColumnError(legacyError, "duration_ms")) {
        throw legacyError;
      }
      await db
        .prepare(
          "INSERT INTO esl_reading_attempts (id, passage_id, user_id, mode, audio_format, audio_mime_type, r2_key, audio_bytes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(
          id,
          input.passageId,
          input.userId,
          input.mode,
          input.audioFormat,
          input.audioMimeType,
          input.r2Key,
          input.audioBytes
        )
        .run();
    }
  }

  return {
    attempt: await loadCreatedAttempt(),
    supportsAsyncEvaluationStatus: false
  };
}

export async function getEslReadingAttemptById(
  db: Db,
  id: string,
  options: { includeDeleted?: boolean } = {}
): Promise<EslReadingAttempt | null> {
  const { includeDeleted = false } = options;
  const query = includeDeleted
    ? "SELECT * FROM esl_reading_attempts WHERE id = ? LIMIT 1"
    : "SELECT * FROM esl_reading_attempts WHERE id = ? AND deleted_at IS NULL LIMIT 1";
  const result = await db.prepare(query).bind(id).first();
  return result ? mapEslReadingAttempt(result) : null;
}

export async function listEslReadingAttemptsByPassage(
  db: Db,
  input: { userId: string; passageId: string },
  options: { includeDeleted?: boolean } = {}
): Promise<EslReadingAttempt[]> {
  const { includeDeleted = false } = options;
  const query = includeDeleted
    ? "SELECT * FROM esl_reading_attempts WHERE user_id = ? AND passage_id = ? ORDER BY created_at DESC"
    : "SELECT * FROM esl_reading_attempts WHERE user_id = ? AND passage_id = ? AND deleted_at IS NULL ORDER BY created_at DESC";
  const result = await db
    .prepare(query)
    .bind(input.userId, input.passageId)
    .all();
  if (!result.results) return [];
  return result.results.map(mapEslReadingAttempt);
}

export async function softDeleteEslReadingAttempt(
  db: Db,
  input: { id: string; userId: string }
): Promise<void> {
  await db
    .prepare(
      "UPDATE esl_reading_attempts SET deleted_at = datetime('now') WHERE id = ? AND user_id = ?"
    )
    .bind(input.id, input.userId)
    .run();
}

export async function updateEslReadingAttemptEvaluationStatus(
  db: Db,
  input: {
    id: string;
    userId: string;
    status: "pending" | "completed" | "failed";
  }
): Promise<void> {
  try {
    await db
      .prepare("UPDATE esl_reading_attempts SET evaluation_status = ? WHERE id = ? AND user_id = ?")
      .bind(input.status, input.id, input.userId)
      .run();
  } catch (error) {
    if (isMissingColumnError(error, "evaluation_status")) return;
    throw error;
  }
}

export async function softDeleteEslReadingAttemptsByPassage(
  db: Db,
  input: { passageId: string; userId: string }
): Promise<void> {
  await db
    .prepare(
      "UPDATE esl_reading_attempts SET deleted_at = datetime('now') WHERE passage_id = ? AND user_id = ? AND deleted_at IS NULL"
    )
    .bind(input.passageId, input.userId)
    .run();
}

export async function deleteEslReadingEvaluationsByAttemptIds(
  db: Db,
  input: { attemptIds: string[]; userId: string }
): Promise<void> {
  const attemptIds = [...new Set(input.attemptIds.filter(Boolean))];
  if (attemptIds.length === 0) return;

  const chunkSize = 50;
  for (let i = 0; i < attemptIds.length; i += chunkSize) {
    const chunk = attemptIds.slice(i, i + chunkSize);
    const placeholders = chunk.map(() => "?").join(", ");
    await db
      .prepare(
        `DELETE FROM esl_reading_evaluations WHERE user_id = ? AND attempt_id IN (${placeholders})`
      )
      .bind(input.userId, ...chunk)
      .run();
  }
}

/* ---------- evaluation runs (migration 0023) ---------- */

/** The same condition in every statement: an attempt with any stored evaluation is done. */
const HAS_EVALUATION =
  "EXISTS (SELECT 1 FROM esl_reading_evaluations e WHERE e.attempt_id = esl_reading_attempts.id)";

export type EvaluationClaim =
  | { outcome: "claimed" }
  /** A run started less than the stale window ago; keep waiting for it. */
  | { outcome: "running" }
  /** A result is already stored; never start another. */
  | { outcome: "completed" }
  | { outcome: "missing" };

/**
 * Take the right to run one evaluation, with a single conditional UPDATE so two concurrent
 * requests cannot both win: SQLite applies writes one at a time, and the second sees the first
 * run's fresh start time. Allowed unless a result exists or a run is still inside the stale window.
 * An explicit failure is claimable at once.
 */
export async function claimEslReadingEvaluationRun(
  db: Db,
  input: { attemptId: string; userId: string; runId: string; staleSeconds: number }
): Promise<EvaluationClaim> {
  const result = await db
    .prepare(
      `UPDATE esl_reading_attempts
          SET evaluation_status = 'pending', evaluation_run_id = ?, evaluation_started_at = datetime('now')
        WHERE id = ? AND user_id = ? AND deleted_at IS NULL
          AND NOT ${HAS_EVALUATION}
          AND NOT (evaluation_status = 'pending'
                   AND COALESCE(evaluation_started_at, created_at) > datetime('now', ?))`
    )
    .bind(input.runId, input.attemptId, input.userId, `-${Math.max(0, Math.floor(input.staleSeconds))} seconds`)
    .run();
  if ((result.meta?.changes ?? 0) === 1) return { outcome: "claimed" };

  const row = await db
    .prepare(
      `SELECT ${HAS_EVALUATION} AS has_evaluation FROM esl_reading_attempts
        WHERE id = ? AND user_id = ? AND deleted_at IS NULL`
    )
    .bind(input.attemptId, input.userId)
    .first<{ has_evaluation: number }>();
  if (!row) return { outcome: "missing" };
  return { outcome: Number(row.has_evaluation) === 1 ? "completed" : "running" };
}

/**
 * Store a result and mark the attempt completed in one D1 batch, so neither can exist without
 * the other. The first result stored wins: a later run — including a slow run that was retried
 * but did finish — finds a result already present and stores nothing, so the side effects that
 * follow run exactly once per attempt. `saved` is true only for the run that stored it.
 */
export async function saveEslReadingEvaluationResult(
  db: Db,
  input: {
    attemptId: string;
    userId: string;
    modelName: string;
    rubricVersion: string;
    outputJson: string;
  }
): Promise<{ saved: boolean; attemptExists: boolean }> {
  const id = crypto.randomUUID();
  const [inserted] = await db.batch([
    db
      .prepare(
        `INSERT INTO esl_reading_evaluations (id, attempt_id, user_id, model_name, rubric_version, output_json)
         SELECT ?, ?, ?, ?, ?, ?
          WHERE EXISTS (SELECT 1 FROM esl_reading_attempts a
                         WHERE a.id = ? AND a.user_id = ? AND a.deleted_at IS NULL)
            AND NOT EXISTS (SELECT 1 FROM esl_reading_evaluations e WHERE e.attempt_id = ?)`
      )
      .bind(
        id,
        input.attemptId,
        input.userId,
        input.modelName,
        input.rubricVersion,
        input.outputJson,
        input.attemptId,
        input.userId,
        input.attemptId
      ),
    db
      .prepare(
        `UPDATE esl_reading_attempts SET evaluation_status = 'completed'
          WHERE id = ? AND user_id = ? AND ${HAS_EVALUATION}`
      )
      .bind(input.attemptId, input.userId)
  ]);
  if ((inserted?.meta?.changes ?? 0) === 1) return { saved: true, attemptExists: true };
  const row = await db
    .prepare("SELECT 1 AS found FROM esl_reading_attempts WHERE id = ? AND user_id = ? AND deleted_at IS NULL")
    .bind(input.attemptId, input.userId)
    .first();
  return { saved: false, attemptExists: Boolean(row) };
}

/**
 * Mark a run failed — only while it still owns the attempt and no result exists, so a stale run
 * cannot overwrite a newer run's pending state or a stored success. Returns whether it applied.
 */
export async function failEslReadingEvaluationRun(
  db: Db,
  input: { attemptId: string; userId: string; runId: string }
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE esl_reading_attempts SET evaluation_status = 'failed'
        WHERE id = ? AND user_id = ? AND evaluation_run_id = ? AND NOT ${HAS_EVALUATION}`
    )
    .bind(input.attemptId, input.userId, input.runId)
    .run();
  return (result.meta?.changes ?? 0) === 1;
}

export async function createEslReadingEvaluation(
  db: Db,
  input: {
    id?: string;
    attemptId: string;
    userId: string;
    modelName: string;
    rubricVersion: string;
    outputJson: string;
  }
): Promise<EslReadingEvaluation> {
  const id = input.id ?? crypto.randomUUID();
  await db
    .prepare(
      "INSERT INTO esl_reading_evaluations (id, attempt_id, user_id, model_name, rubric_version, output_json) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .bind(id, input.attemptId, input.userId, input.modelName, input.rubricVersion, input.outputJson)
    .run();

  const created = await getEslReadingEvaluationById(db, id);
  if (!created) {
    throw new Error("Failed to create esl reading evaluation.");
  }
  return created;
}

export async function getEslReadingEvaluationById(
  db: Db,
  id: string
): Promise<EslReadingEvaluation | null> {
  const result = await db
    .prepare("SELECT * FROM esl_reading_evaluations WHERE id = ? LIMIT 1")
    .bind(id)
    .first();
  return result ? mapEslReadingEvaluation(result) : null;
}

export async function getLatestEslReadingEvaluationByAttemptId(
  db: Db,
  attemptId: string
): Promise<EslReadingEvaluation | null> {
  const result = await db
    .prepare(
      "SELECT * FROM esl_reading_evaluations WHERE attempt_id = ? ORDER BY created_at DESC LIMIT 1"
    )
    .bind(attemptId)
    .first();
  return result ? mapEslReadingEvaluation(result) : null;
}

/**
 * Loads the latest evaluation for every attempt on one passage in a single bounded query.
 * Callers use this for the Reading history rail and evaluator context; querying one latest
 * row per attempt turns a history page into an N+1 query pattern.
 */
export async function listLatestEslReadingEvaluationsByPassage(
  db: Db,
  input: { userId: string; passageId: string }
): Promise<EslReadingEvaluation[]> {
  const result = await db
    .prepare(
      `SELECT e.*
         FROM esl_reading_evaluations e
         JOIN esl_reading_attempts a ON a.id = e.attempt_id
        WHERE e.user_id = ?
          AND a.user_id = ?
          AND a.passage_id = ?
          AND a.deleted_at IS NULL
          AND e.id = (
            SELECT e2.id
              FROM esl_reading_evaluations e2
             WHERE e2.attempt_id = e.attempt_id
             ORDER BY e2.created_at DESC, e2.id DESC
             LIMIT 1
          )`
    )
    .bind(input.userId, input.userId, input.passageId)
    .all();
  return (result.results ?? []).map(mapEslReadingEvaluation);
}

export async function listCompletedEslReadingAttemptsByUser(
  db: Db,
  userId: string
): Promise<EslReadingAttemptWithEvaluation[]> {
  const result = await db
    .prepare(
      `SELECT a.*, p.title AS passage_title, p.content_text AS passage_content_text, e.output_json AS evaluation_output_json
       FROM esl_reading_attempts a
       JOIN passages p ON p.id = a.passage_id
       JOIN esl_reading_evaluations e
         ON e.id = (
           SELECT e2.id
           FROM esl_reading_evaluations e2
           WHERE e2.attempt_id = a.id
           ORDER BY e2.created_at DESC, e2.id DESC
           LIMIT 1
         )
       WHERE a.user_id = ?
         AND a.deleted_at IS NULL
         AND p.deleted_at IS NULL
       ORDER BY a.created_at ASC`
    )
    .bind(userId)
    .all();
  return (result.results ?? []).map(mapEslReadingAttemptWithEvaluation);
}
