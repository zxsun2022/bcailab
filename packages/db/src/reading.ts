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
        "INSERT INTO esl_reading_attempts (id, passage_id, user_id, mode, audio_format, audio_mime_type, r2_key, audio_bytes, duration_ms, evaluation_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
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
        input.evaluationStatus ?? "pending"
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
