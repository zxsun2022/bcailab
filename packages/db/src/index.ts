/// <reference types="@cloudflare/workers-types" />

export type Db = D1Database;

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

export type EslReadingAttemptWithEvaluation = EslReadingAttempt & {
  passage_title: string | null;
  passage_content_text: string;
  evaluation_output_json: string;
};

export type WritingArticle = {
  id: string;
  user_id: string;
  title: string | null;
  essay_prompt: string | null;
  agent_type: string;
  status: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type WritingRevision = {
  id: string;
  article_id: string;
  user_id: string;
  round_number: number;
  user_text: string;
  word_count: number;
  feedback_json: string | null;
  feedback_status: "pending" | "completed" | "failed";
  model_name: string | null;
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

const mapEslReadingAttemptWithEvaluation = (
  row: Record<string, unknown>
): EslReadingAttemptWithEvaluation => ({
  ...mapEslReadingAttempt(row),
  passage_title: row.passage_title ? String(row.passage_title) : null,
  passage_content_text: String(row.passage_content_text),
  evaluation_output_json: String(row.evaluation_output_json)
});

const mapWritingArticle = (row: Record<string, unknown>): WritingArticle => ({
  id: String(row.id),
  user_id: String(row.user_id),
  title: row.title ? String(row.title) : null,
  essay_prompt: row.essay_prompt ? String(row.essay_prompt) : null,
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

  // Merge with an existing email-login account so both methods share one user.
  if (profile.email) {
    const byEmail = await getUserByEmail(db, profile.email);
    if (byEmail) {
      await db
        .prepare(
          "UPDATE users SET google_sub = ?, name = COALESCE(?, name), avatar_url = COALESCE(?, avatar_url), updated_at = datetime('now') WHERE id = ?"
        )
        .bind(profile.sub, profile.name ?? null, profile.picture ?? null, byEmail.id)
        .run();
      const merged = await getUserById(db, byEmail.id);
      if (!merged) {
        throw new Error("Failed to load merged user.");
      }
      return merged;
    }
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

export async function listCompletedEslReadingAttemptsByUser(
  db: Db,
  userId: string
): Promise<EslReadingAttemptWithEvaluation[]> {
  const result = await db
    .prepare(
      `SELECT a.*, p.title AS passage_title, p.content_text AS passage_content_text, e.output_json AS evaluation_output_json
       FROM esl_reading_attempts a
       JOIN esl_passages p ON p.id = a.passage_id
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

// ---------------------------------------------------------------------------
// Writing Articles
// ---------------------------------------------------------------------------

export async function createWritingArticle(
  db: Db,
  input: {
    id?: string;
    userId: string;
    title?: string | null;
    essayPrompt?: string | null;
    agentType: string;
  }
): Promise<WritingArticle> {
  const id = input.id ?? crypto.randomUUID();
  await db
    .prepare(
      "INSERT INTO writing_articles (id, user_id, title, essay_prompt, agent_type) VALUES (?, ?, ?, ?, ?)"
    )
    .bind(id, input.userId, input.title ?? null, input.essayPrompt ?? null, input.agentType)
    .run();

  const created = await getWritingArticleById(db, id, { includeDeleted: true });
  if (!created) throw new Error("Failed to create writing article.");
  return created;
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
      "INSERT INTO writing_revisions (id, article_id, user_id, round_number, user_text, word_count) VALUES (?, ?, ?, ?, ?, ?)"
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
    feedbackJson: string | null;
    feedbackStatus: "pending" | "completed" | "failed";
    modelName: string;
  }
): Promise<void> {
  await db
    .prepare(
      "UPDATE writing_revisions SET feedback_json = ?, feedback_status = ?, model_name = ? WHERE id = ?"
    )
    .bind(input.feedbackJson, input.feedbackStatus, input.modelName, input.id)
    .run();
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

/* ---------- email login (OTP) ---------- */

export type LoginCode = {
  id: string;
  email: string;
  code_hash: string;
  ip: string | null;
  expires_at: number;
  attempts: number;
  consumed_at: string | null;
  created_at: string;
};

const mapLoginCode = (row: Record<string, unknown>): LoginCode => ({
  id: String(row.id),
  email: String(row.email),
  code_hash: String(row.code_hash),
  ip: row.ip ? String(row.ip) : null,
  expires_at: Number(row.expires_at),
  attempts: Number(row.attempts ?? 0),
  consumed_at: row.consumed_at ? String(row.consumed_at) : null,
  created_at: String(row.created_at)
});

export async function getUserByEmail(db: Db, email: string): Promise<User | null> {
  const result = await db
    .prepare("SELECT * FROM users WHERE email = ? LIMIT 1")
    .bind(email)
    .first();
  return result ? mapUser(result) : null;
}

export async function createUserWithEmail(db: Db, email: string): Promise<User> {
  const id = crypto.randomUUID();
  await db.prepare("INSERT INTO users (id, email) VALUES (?, ?)").bind(id, email).run();
  const created = await getUserById(db, id);
  if (!created) {
    throw new Error("Failed to create user.");
  }
  return created;
}

export async function createLoginCode(
  db: Db,
  input: { email: string; codeHash: string; ip: string | null; expiresAt: number }
): Promise<string> {
  const id = crypto.randomUUID();
  await db
    .prepare(
      "INSERT INTO login_codes (id, email, code_hash, ip, expires_at) VALUES (?, ?, ?, ?, ?)"
    )
    .bind(id, input.email, input.codeHash, input.ip, input.expiresAt)
    .run();
  return id;
}

export async function getActiveLoginCode(db: Db, email: string): Promise<LoginCode | null> {
  const result = await db
    .prepare(
      "SELECT * FROM login_codes WHERE email = ? AND consumed_at IS NULL ORDER BY created_at DESC, id DESC LIMIT 1"
    )
    .bind(email)
    .first();
  return result ? mapLoginCode(result) : null;
}

export async function incrementLoginCodeAttempts(db: Db, id: string): Promise<void> {
  await db.prepare("UPDATE login_codes SET attempts = attempts + 1 WHERE id = ?").bind(id).run();
}

export async function consumeLoginCode(db: Db, id: string): Promise<void> {
  await db
    .prepare("UPDATE login_codes SET consumed_at = datetime('now') WHERE id = ?")
    .bind(id)
    .run();
}

export async function countRecentLoginCodes(
  db: Db,
  input: { email?: string; ip?: string; sinceIso: string }
): Promise<number> {
  if (input.email) {
    const row = await db
      .prepare("SELECT COUNT(*) AS n FROM login_codes WHERE email = ? AND created_at >= ?")
      .bind(input.email, input.sinceIso)
      .first();
    return Number(row?.n ?? 0);
  }
  if (input.ip) {
    const row = await db
      .prepare("SELECT COUNT(*) AS n FROM login_codes WHERE ip = ? AND created_at >= ?")
      .bind(input.ip, input.sinceIso)
      .first();
    return Number(row?.n ?? 0);
  }
  return 0;
}

/* ---------- translate usage quotas ---------- */

export type TranslateUsage = {
  subject: string;
  day: string;
  requests: number;
  chars: number;
};

export async function getTranslateUsage(
  db: Db,
  subjects: string[],
  day: string
): Promise<TranslateUsage[]> {
  if (subjects.length === 0) return [];
  const placeholders = subjects.map(() => "?").join(", ");
  const result = await db
    .prepare(
      `SELECT subject, day, requests, chars FROM translate_usage WHERE day = ? AND subject IN (${placeholders})`
    )
    .bind(day, ...subjects)
    .all();
  return (result.results ?? []).map((row) => ({
    subject: String(row.subject),
    day: String(row.day),
    requests: Number(row.requests ?? 0),
    chars: Number(row.chars ?? 0)
  }));
}

export async function incrementTranslateUsage(
  db: Db,
  subjects: string[],
  day: string,
  chars: number
): Promise<void> {
  if (subjects.length === 0) return;
  const statement = db.prepare(
    `INSERT INTO translate_usage (subject, day, requests, chars) VALUES (?, ?, 1, ?)
     ON CONFLICT(subject, day) DO UPDATE SET
       requests = requests + 1,
       chars = chars + excluded.chars,
       updated_at = datetime('now')`
  );
  await db.batch(subjects.map((subject) => statement.bind(subject, day, chars)));
}

/* ---------- feature usage quotas (generic, per-feature) ---------- */

export type FeatureUsage = {
  feature: string;
  subject: string;
  day: string;
  requests: number;
  units: number;
};

export async function getFeatureUsage(
  db: Db,
  feature: string,
  subjects: string[],
  day: string
): Promise<FeatureUsage[]> {
  if (subjects.length === 0) return [];
  const placeholders = subjects.map(() => "?").join(", ");
  const result = await db
    .prepare(
      `SELECT feature, subject, day, requests, units FROM feature_usage WHERE feature = ? AND day = ? AND subject IN (${placeholders})`
    )
    .bind(feature, day, ...subjects)
    .all();
  return (result.results ?? []).map((row) => ({
    feature: String(row.feature),
    subject: String(row.subject),
    day: String(row.day),
    requests: Number(row.requests ?? 0),
    units: Number(row.units ?? 0)
  }));
}

export async function incrementFeatureUsage(
  db: Db,
  feature: string,
  subjects: string[],
  day: string,
  units: number
): Promise<void> {
  if (subjects.length === 0) return;
  const statement = db.prepare(
    `INSERT INTO feature_usage (feature, subject, day, requests, units) VALUES (?, ?, ?, 1, ?)
     ON CONFLICT(feature, subject, day) DO UPDATE SET
       requests = requests + 1,
       units = units + excluded.units,
       updated_at = datetime('now')`
  );
  await db.batch(subjects.map((subject) => statement.bind(feature, subject, day, units)));
}

/* ---------- dictation ---------- */

export type DictationPassage = {
  id: string;
  band: string;
  topic: string;
  title: string;
  voice_name: string;
  sentence_count: number;
  status: string;
  created_at: string;
  deleted_at: string | null;
};

export type DictationSentence = {
  id: string;
  passage_id: string;
  idx: number;
  text: string;
  r2_key: string;
  audio_bytes: number;
};

export type DictationAttempt = {
  id: string;
  user_id: string;
  passage_id: string;
  accuracy: number;
  sentence_results: string;
  feedback_json: string | null;
  created_at: string;
  deleted_at: string | null;
};

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
      "SELECT id, user_id, passage_id, accuracy, sentence_results, feedback_json, created_at, deleted_at FROM dictation_attempts WHERE id = ? AND user_id = ? AND deleted_at IS NULL"
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
      "SELECT id, user_id, passage_id, accuracy, sentence_results, feedback_json, created_at, deleted_at FROM dictation_attempts WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT ?"
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

/* ---------- material layer (unified passages) ---------- */

export type Passage = {
  id: string;
  /** NULL for global library content. */
  user_id: string | null;
  title: string;
  content_text: string;
  band: string | null;
  topic: string | null;
  word_count: number;
  sentence_count: number;
  mean_sentence_words: number;
  rare_word_ratio: number;
  has_sentence_audio: number;
  is_trial: number;
  /** Mirrors the old esl_passages status union so callers can switch on it. */
  reference_audio_status: "pending" | "completed" | "failed" | null;
  reference_audio_r2_key: string | null;
  reference_audio_bytes: number | null;
  reference_voice_name: string | null;
  reference_audio_created_at: string | null;
  status: string;
  source: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type PassageSentence = {
  id: string;
  passage_id: string;
  idx: number;
  text: string;
  r2_key: string | null;
  audio_bytes: number | null;
};

export type PassageTag = { tag: string; count: number };

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
  options: { band?: string; requireSentenceAudio?: boolean } = {}
): Promise<Passage[]> {
  const where = ["user_id IS NULL", "deleted_at IS NULL", "status = 'published'"];
  const binds: string[] = [];
  if (options.band) {
    where.push("band = ?");
    binds.push(options.band);
  }
  if (options.requireSentenceAudio) where.push("has_sentence_audio = 1");
  const result = await db
    .prepare(
      `SELECT ${PASSAGE_COLS} FROM passages WHERE ${where.join(" AND ")}
       ORDER BY band ASC, created_at ASC`
    )
    .bind(...binds)
    .all();
  return (result.results ?? []).map((row) => mapPassage(row as Record<string, unknown>));
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

export type PassageStats = {
  passage_id: string;
  mode: string;
  attempt_count: number;
  accuracy_sum: number;
};

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
