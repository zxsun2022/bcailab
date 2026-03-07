/// <reference types="@cloudflare/workers-types" />

type Db = D1Database;

export type User = {
  id: string;
  google_sub: string | null;
  email: string | null;
  name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

export type Post = {
  id: string;
  user_id: string;
  content_md: string;
  content_html: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type TtsGeneration = {
  id: string;
  user_id: string;
  input_text: string;
  processed_text: string;
  input_mode: string;
  language_code: string;
  voice_name: string;
  audio_format: string;
  r2_key: string;
  audio_bytes: number;
  created_at: string;
  deleted_at: string | null;
};

export type EslPassage = {
  id: string;
  user_id: string;
  title: string | null;
  content_text: string;
  reference_tts_status: "pending" | "completed" | "failed" | null;
  reference_tts_voice_name: string | null;
  reference_tts_r2_key: string | null;
  reference_tts_audio_bytes: number | null;
  reference_tts_created_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type EslReadingAttempt = {
  id: string;
  passage_id: string;
  user_id: string;
  mode: string;
  audio_format: string;
  audio_mime_type: string;
  r2_key: string;
  audio_bytes: number;
  duration_ms: number | null;
  evaluation_status: "pending" | "completed" | "failed";
  created_at: string;
  deleted_at: string | null;
};

export type EslLearnerProfile = {
  id: string;
  user_id: string;
  persistent_issues_json: string;
  strengths_json: string;
  cefr_estimate: string | null;
  total_practice_seconds: number;
  total_attempts: number;
  eval_count_since_update: number;
  created_at: string;
  updated_at: string;
};

export type EslReadingEvaluation = {
  id: string;
  attempt_id: string;
  user_id: string;
  model_name: string;
  rubric_version: string;
  output_json: string;
  created_at: string;
};

export type GoogleProfile = {
  sub: string;
  email?: string;
  name?: string;
  picture?: string;
};

const mapUser = (row: Record<string, unknown>): User => ({
  id: String(row.id),
  google_sub: row.google_sub ? String(row.google_sub) : null,
  email: row.email ? String(row.email) : null,
  name: row.name ? String(row.name) : null,
  avatar_url: row.avatar_url ? String(row.avatar_url) : null,
  created_at: String(row.created_at),
  updated_at: String(row.updated_at)
});

const mapPost = (row: Record<string, unknown>): Post => ({
  id: String(row.id),
  user_id: String(row.user_id),
  content_md: String(row.content_md),
  content_html: String(row.content_html),
  created_at: String(row.created_at),
  updated_at: String(row.updated_at),
  deleted_at: row.deleted_at ? String(row.deleted_at) : null
});

const mapTtsGeneration = (row: Record<string, unknown>): TtsGeneration => ({
  id: String(row.id),
  user_id: String(row.user_id),
  input_text: String(row.input_text),
  processed_text: String(row.processed_text),
  input_mode: String(row.input_mode),
  language_code: String(row.language_code),
  voice_name: String(row.voice_name),
  audio_format: String(row.audio_format),
  r2_key: String(row.r2_key),
  audio_bytes: Number(row.audio_bytes),
  created_at: String(row.created_at),
  deleted_at: row.deleted_at ? String(row.deleted_at) : null
});

const mapEslPassage = (row: Record<string, unknown>): EslPassage => ({
  id: String(row.id),
  user_id: String(row.user_id),
  title: row.title ? String(row.title) : null,
  content_text: String(row.content_text),
  reference_tts_status:
    row.reference_tts_status === "pending" ||
    row.reference_tts_status === "completed" ||
    row.reference_tts_status === "failed"
      ? row.reference_tts_status
      : null,
  reference_tts_voice_name: row.reference_tts_voice_name
    ? String(row.reference_tts_voice_name)
    : null,
  reference_tts_r2_key: row.reference_tts_r2_key ? String(row.reference_tts_r2_key) : null,
  reference_tts_audio_bytes:
    row.reference_tts_audio_bytes != null ? Number(row.reference_tts_audio_bytes) : null,
  reference_tts_created_at: row.reference_tts_created_at
    ? String(row.reference_tts_created_at)
    : null,
  created_at: String(row.created_at),
  updated_at: String(row.updated_at),
  deleted_at: row.deleted_at ? String(row.deleted_at) : null
});

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

const mapEslLearnerProfile = (row: Record<string, unknown>): EslLearnerProfile => ({
  id: String(row.id),
  user_id: String(row.user_id),
  persistent_issues_json: String(row.persistent_issues_json),
  strengths_json: String(row.strengths_json),
  cefr_estimate: row.cefr_estimate ? String(row.cefr_estimate) : null,
  total_practice_seconds: Number(row.total_practice_seconds),
  total_attempts: Number(row.total_attempts),
  eval_count_since_update: Number(row.eval_count_since_update),
  created_at: String(row.created_at),
  updated_at: String(row.updated_at)
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

const getDbErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error ?? "");

const isMissingColumnError = (error: unknown, column: string): boolean => {
  const message = getDbErrorMessage(error);
  return (
    message.includes(`no such column: ${column}`) ||
    message.includes(`has no column named ${column}`) ||
    message.includes(`no column named ${column}`)
  );
};

const isMissingTableError = (error: unknown, table: string): boolean => {
  const message = getDbErrorMessage(error);
  return message.includes(`no such table: ${table}`);
};

export async function getUserById(db: Db, id: string): Promise<User | null> {
  const result = await db.prepare("SELECT * FROM users WHERE id = ? LIMIT 1").bind(id).first();
  return result ? mapUser(result) : null;
}

export async function getUserByGoogleSub(db: Db, sub: string): Promise<User | null> {
  const result = await db
    .prepare("SELECT * FROM users WHERE google_sub = ? LIMIT 1")
    .bind(sub)
    .first();
  return result ? mapUser(result) : null;
}

export async function upsertUserFromGoogleProfile(db: Db, profile: GoogleProfile): Promise<User> {
  const existing = await getUserByGoogleSub(db, profile.sub);
  if (existing) {
    await db
      .prepare(
        "UPDATE users SET email = ?, name = ?, avatar_url = ?, updated_at = datetime('now') WHERE id = ?"
      )
      .bind(profile.email ?? null, profile.name ?? null, profile.picture ?? null, existing.id)
      .run();
    const updated = await getUserById(db, existing.id);
    if (!updated) {
      throw new Error("Failed to load updated user.");
    }
    return updated;
  }

  const id = crypto.randomUUID();
  await db
    .prepare(
      "INSERT INTO users (id, google_sub, email, name, avatar_url) VALUES (?, ?, ?, ?, ?)"
    )
    .bind(id, profile.sub, profile.email ?? null, profile.name ?? null, profile.picture ?? null)
    .run();

  const created = await getUserById(db, id);
  if (!created) {
    throw new Error("Failed to create user.");
  }
  return created;
}

export async function createPost(db: Db, input: { userId: string; contentMd: string; contentHtml: string }): Promise<Post> {
  const id = crypto.randomUUID();
  await db
    .prepare(
      "INSERT INTO posts (id, user_id, content_md, content_html) VALUES (?, ?, ?, ?)"
    )
    .bind(id, input.userId, input.contentMd, input.contentHtml)
    .run();

  const created = await getPostById(db, id, { includeDeleted: true });
  if (!created) {
    throw new Error("Failed to create post.");
  }
  return created;
}

export async function getPostById(
  db: Db,
  id: string,
  options: { includeDeleted?: boolean } = {}
): Promise<Post | null> {
  const { includeDeleted = false } = options;
  const query = includeDeleted
    ? "SELECT * FROM posts WHERE id = ? LIMIT 1"
    : "SELECT * FROM posts WHERE id = ? AND deleted_at IS NULL LIMIT 1";
  const result = await db.prepare(query).bind(id).first();
  return result ? mapPost(result) : null;
}

export async function listPostsByUser(db: Db, userId: string): Promise<Post[]> {
  const result = await db
    .prepare(
      "SELECT * FROM posts WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at DESC"
    )
    .bind(userId)
    .all();
  if (!result.results) return [];
  return result.results.map(mapPost);
}

export async function updatePost(
  db: Db,
  input: { id: string; userId: string; contentMd: string; contentHtml: string }
): Promise<Post | null> {
  await db
    .prepare(
      "UPDATE posts SET content_md = ?, content_html = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?"
    )
    .bind(input.contentMd, input.contentHtml, input.id, input.userId)
    .run();
  return getPostById(db, input.id, { includeDeleted: true });
}

export async function softDeletePost(db: Db, input: { id: string; userId: string }): Promise<void> {
  await db
    .prepare("UPDATE posts SET deleted_at = datetime('now') WHERE id = ? AND user_id = ?")
    .bind(input.id, input.userId)
    .run();
}

export async function createTtsGeneration(
  db: Db,
  input: {
    id?: string;
    userId: string;
    inputText: string;
    processedText: string;
    inputMode: string;
    languageCode: string;
    voiceName: string;
    audioFormat: string;
    r2Key: string;
    audioBytes: number;
  }
): Promise<TtsGeneration> {
  const id = input.id ?? crypto.randomUUID();
  await db
    .prepare(
      "INSERT INTO tts_generations (id, user_id, input_text, processed_text, input_mode, language_code, voice_name, audio_format, r2_key, audio_bytes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(
      id,
      input.userId,
      input.inputText,
      input.processedText,
      input.inputMode,
      input.languageCode,
      input.voiceName,
      input.audioFormat,
      input.r2Key,
      input.audioBytes
    )
    .run();

  const created = await getTtsGenerationById(db, id, { includeDeleted: true });
  if (!created) {
    throw new Error("Failed to create tts generation.");
  }
  return created;
}

export async function getTtsGenerationById(
  db: Db,
  id: string,
  options: { includeDeleted?: boolean } = {}
): Promise<TtsGeneration | null> {
  const { includeDeleted = false } = options;
  const query = includeDeleted
    ? "SELECT * FROM tts_generations WHERE id = ? LIMIT 1"
    : "SELECT * FROM tts_generations WHERE id = ? AND deleted_at IS NULL LIMIT 1";
  const result = await db.prepare(query).bind(id).first();
  return result ? mapTtsGeneration(result) : null;
}

export async function listTtsGenerationsByUser(db: Db, userId: string): Promise<TtsGeneration[]> {
  const result = await db
    .prepare(
      "SELECT * FROM tts_generations WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at DESC"
    )
    .bind(userId)
    .all();
  if (!result.results) return [];
  return result.results.map(mapTtsGeneration);
}

export async function softDeleteTtsGeneration(
  db: Db,
  input: { id: string; userId: string }
): Promise<void> {
  await db
    .prepare("UPDATE tts_generations SET deleted_at = datetime('now') WHERE id = ? AND user_id = ?")
    .bind(input.id, input.userId)
    .run();
}

export async function createEslPassage(
  db: Db,
  input: { id?: string; userId: string; title?: string | null; contentText: string }
): Promise<EslPassage> {
  const id = input.id ?? crypto.randomUUID();
  await db
    .prepare(
      "INSERT INTO esl_passages (id, user_id, title, content_text) VALUES (?, ?, ?, ?)"
    )
    .bind(id, input.userId, input.title ?? null, input.contentText)
    .run();

  const created = await getEslPassageById(db, id, { includeDeleted: true });
  if (!created) {
    throw new Error("Failed to create esl passage.");
  }
  return created;
}

export async function getEslPassageById(
  db: Db,
  id: string,
  options: { includeDeleted?: boolean } = {}
): Promise<EslPassage | null> {
  const { includeDeleted = false } = options;
  const query = includeDeleted
    ? "SELECT * FROM esl_passages WHERE id = ? LIMIT 1"
    : "SELECT * FROM esl_passages WHERE id = ? AND deleted_at IS NULL LIMIT 1";
  const result = await db.prepare(query).bind(id).first();
  return result ? mapEslPassage(result) : null;
}

export async function listEslPassagesByUser(db: Db, userId: string): Promise<EslPassage[]> {
  const result = await db
    .prepare(
      "SELECT * FROM esl_passages WHERE user_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC, created_at DESC"
    )
    .bind(userId)
    .all();
  if (!result.results) return [];
  return result.results.map(mapEslPassage);
}

export async function updateEslPassage(
  db: Db,
  input: { id: string; userId: string; title?: string | null; contentText: string }
): Promise<EslPassage | null> {
  await db
    .prepare(
      "UPDATE esl_passages SET title = ?, content_text = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?"
    )
    .bind(input.title ?? null, input.contentText, input.id, input.userId)
    .run();
  return getEslPassageById(db, input.id, { includeDeleted: true });
}

export async function markEslPassageReferenceTtsPending(
  db: Db,
  input: { id: string; userId: string }
): Promise<boolean> {
  try {
    await db
      .prepare(
        "UPDATE esl_passages SET reference_tts_status = 'pending', reference_tts_voice_name = NULL, reference_tts_r2_key = NULL, reference_tts_audio_bytes = NULL, reference_tts_created_at = NULL WHERE id = ? AND user_id = ?"
      )
      .bind(input.id, input.userId)
      .run();
    return true;
  } catch (error) {
    if (isMissingColumnError(error, "reference_tts_status")) return false;
    throw error;
  }
}

export async function markEslPassageReferenceTtsCompleted(
  db: Db,
  input: {
    id: string;
    userId: string;
    voiceName: string;
    r2Key: string;
    audioBytes: number;
  }
): Promise<boolean> {
  try {
    await db
      .prepare(
        "UPDATE esl_passages SET reference_tts_status = 'completed', reference_tts_voice_name = ?, reference_tts_r2_key = ?, reference_tts_audio_bytes = ?, reference_tts_created_at = datetime('now') WHERE id = ? AND user_id = ?"
      )
      .bind(input.voiceName, input.r2Key, input.audioBytes, input.id, input.userId)
      .run();
    return true;
  } catch (error) {
    if (isMissingColumnError(error, "reference_tts_status")) return false;
    throw error;
  }
}

export async function markEslPassageReferenceTtsFailed(
  db: Db,
  input: { id: string; userId: string }
): Promise<boolean> {
  try {
    await db
      .prepare(
        "UPDATE esl_passages SET reference_tts_status = 'failed', reference_tts_voice_name = NULL, reference_tts_r2_key = NULL, reference_tts_audio_bytes = NULL WHERE id = ? AND user_id = ?"
      )
      .bind(input.id, input.userId)
      .run();
    return true;
  } catch (error) {
    if (isMissingColumnError(error, "reference_tts_status")) return false;
    throw error;
  }
}

export async function softDeleteEslPassage(
  db: Db,
  input: { id: string; userId: string }
): Promise<void> {
  await db
    .prepare("UPDATE esl_passages SET deleted_at = datetime('now') WHERE id = ? AND user_id = ?")
    .bind(input.id, input.userId)
    .run();
}

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

export async function getEslLearnerProfile(
  db: Db,
  userId: string
): Promise<EslLearnerProfile | null> {
  let result;
  try {
    result = await db
      .prepare("SELECT * FROM esl_learner_profiles WHERE user_id = ? LIMIT 1")
      .bind(userId)
      .first();
  } catch (error) {
    if (isMissingTableError(error, "esl_learner_profiles")) return null;
    throw error;
  }
  return result ? mapEslLearnerProfile(result) : null;
}

export async function upsertEslLearnerProfile(
  db: Db,
  input: {
    userId: string;
    persistentIssuesJson: string;
    strengthsJson: string;
    cefrEstimate: string | null;
    totalPracticeSeconds: number;
    totalAttempts: number;
    evalCountSinceUpdate: number;
  }
): Promise<EslLearnerProfile> {
  const existing = await getEslLearnerProfile(db, input.userId);
  if (existing) {
    await db
      .prepare(
        "UPDATE esl_learner_profiles SET persistent_issues_json = ?, strengths_json = ?, cefr_estimate = ?, total_practice_seconds = ?, total_attempts = ?, eval_count_since_update = ?, updated_at = datetime('now') WHERE user_id = ?"
      )
      .bind(
        input.persistentIssuesJson,
        input.strengthsJson,
        input.cefrEstimate,
        input.totalPracticeSeconds,
        input.totalAttempts,
        input.evalCountSinceUpdate,
        input.userId
      )
      .run();
  } else {
    const id = crypto.randomUUID();
    await db
      .prepare(
        "INSERT INTO esl_learner_profiles (id, user_id, persistent_issues_json, strengths_json, cefr_estimate, total_practice_seconds, total_attempts, eval_count_since_update) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .bind(
        id,
        input.userId,
        input.persistentIssuesJson,
        input.strengthsJson,
        input.cefrEstimate,
        input.totalPracticeSeconds,
        input.totalAttempts,
        input.evalCountSinceUpdate
      )
      .run();
  }
  const profile = await getEslLearnerProfile(db, input.userId);
  if (!profile) throw new Error("Failed to upsert esl learner profile.");
  return profile;
}

export async function incrementEslLearnerProfileCounters(
  db: Db,
  input: { userId: string; practiceSeconds: number }
): Promise<void> {
  try {
    const existing = await getEslLearnerProfile(db, input.userId);
    if (existing) {
      await db
        .prepare(
          "UPDATE esl_learner_profiles SET total_practice_seconds = total_practice_seconds + ?, total_attempts = total_attempts + 1, eval_count_since_update = eval_count_since_update + 1, updated_at = datetime('now') WHERE user_id = ?"
        )
        .bind(input.practiceSeconds, input.userId)
        .run();
    } else {
      const id = crypto.randomUUID();
      await db
        .prepare(
          "INSERT INTO esl_learner_profiles (id, user_id, total_practice_seconds, total_attempts, eval_count_since_update) VALUES (?, ?, ?, 1, 1)"
        )
        .bind(id, input.userId, input.practiceSeconds)
        .run();
    }
  } catch (error) {
    if (isMissingTableError(error, "esl_learner_profiles")) return;
    throw error;
  }
}
