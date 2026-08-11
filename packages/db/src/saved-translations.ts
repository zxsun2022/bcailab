/// <reference types="@cloudflare/workers-types" />

type SavedDb = D1Database;

export type SavedTranslation = {
  id: string;
  user_id: string;
  completion_id: string;
  proof_version: 1;
  source_language: string;
  detected_source_language: string | null;
  target_language: string;
  source_text: string;
  translated_text: string;
  created_at: string;
  updated_at: string;
};

export type SavedTranslationSummary = Pick<
  SavedTranslation,
  | "id"
  | "source_language"
  | "detected_source_language"
  | "target_language"
  | "created_at"
  | "updated_at"
> & {
  source_preview: string;
};

export type SavedTranslationCursor = {
  createdAt: string;
  id: string;
};

export class SavedTranslationConflictError extends Error {
  constructor() {
    super("The completion id is already associated with a different translation.");
    this.name = "SavedTranslationConflictError";
  }
}

const nullableString = (value: unknown): string | null =>
  value == null ? null : String(value);

const mapSavedTranslation = (row: Record<string, unknown>): SavedTranslation => ({
  id: String(row.id),
  user_id: String(row.user_id),
  completion_id: String(row.completion_id),
  proof_version: 1,
  source_language: String(row.source_language),
  detected_source_language: nullableString(row.detected_source_language),
  target_language: String(row.target_language),
  source_text: String(row.source_text),
  translated_text: String(row.translated_text),
  created_at: String(row.created_at),
  updated_at: String(row.updated_at)
});

const matchesSnapshot = (
  row: SavedTranslation,
  input: Omit<SavedTranslation, "created_at" | "updated_at">
): boolean =>
  row.user_id === input.user_id &&
  row.completion_id === input.completion_id &&
  row.proof_version === input.proof_version &&
  row.source_language === input.source_language &&
  row.detected_source_language === input.detected_source_language &&
  row.target_language === input.target_language &&
  row.source_text === input.source_text &&
  row.translated_text === input.translated_text;

export async function createSavedTranslation(
  db: SavedDb,
  input: {
    id?: string;
    userId: string;
    completionId: string;
    proofVersion?: 1;
    sourceLanguage: string;
    detectedSourceLanguage?: string | null;
    targetLanguage: string;
    sourceText: string;
    translatedText: string;
  }
): Promise<SavedTranslation> {
  const snapshot: Omit<SavedTranslation, "created_at" | "updated_at"> = {
    id: input.id ?? crypto.randomUUID(),
    user_id: input.userId,
    completion_id: input.completionId,
    proof_version: input.proofVersion ?? 1,
    source_language: input.sourceLanguage,
    detected_source_language: input.detectedSourceLanguage ?? null,
    target_language: input.targetLanguage,
    source_text: input.sourceText,
    translated_text: input.translatedText
  };

  await db
    .prepare(
      `INSERT INTO saved_translations (
         id, user_id, completion_id, proof_version,
         source_language, detected_source_language, target_language,
         source_text, translated_text
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, completion_id) DO NOTHING`
    )
    .bind(
      snapshot.id,
      snapshot.user_id,
      snapshot.completion_id,
      snapshot.proof_version,
      snapshot.source_language,
      snapshot.detected_source_language,
      snapshot.target_language,
      snapshot.source_text,
      snapshot.translated_text
    )
    .run();

  const stored = await getSavedTranslationByCompletionId(
    db,
    snapshot.user_id,
    snapshot.completion_id
  );
  if (!stored) throw new Error("Failed to save translation.");
  if (!matchesSnapshot(stored, snapshot)) throw new SavedTranslationConflictError();
  return stored;
}

export async function getSavedTranslationByCompletionId(
  db: SavedDb,
  userId: string,
  completionId: string
): Promise<SavedTranslation | null> {
  const row = await db
    .prepare(
      "SELECT * FROM saved_translations WHERE user_id = ? AND completion_id = ? LIMIT 1"
    )
    .bind(userId, completionId)
    .first();
  return row ? mapSavedTranslation(row) : null;
}

export async function getSavedTranslationById(
  db: SavedDb,
  userId: string,
  id: string
): Promise<SavedTranslation | null> {
  const row = await db
    .prepare("SELECT * FROM saved_translations WHERE id = ? AND user_id = ? LIMIT 1")
    .bind(id, userId)
    .first();
  return row ? mapSavedTranslation(row) : null;
}

export async function listSavedTranslations(
  db: SavedDb,
  input: {
    userId: string;
    cursor?: SavedTranslationCursor | null;
    limit?: number;
  }
): Promise<SavedTranslationSummary[]> {
  const limit = Math.min(Math.max(input.limit ?? 25, 1), 50);
  const cursorClause = input.cursor
    ? "AND (created_at < ? OR (created_at = ? AND id < ?))"
    : "";
  const statement = db.prepare(
    `SELECT id, source_language, detected_source_language, target_language,
            substr(source_text, 1, 160) AS source_preview,
            created_at, updated_at
     FROM saved_translations
     WHERE user_id = ? ${cursorClause}
     ORDER BY created_at DESC, id DESC
     LIMIT ?`
  );
  const bound = input.cursor
    ? statement.bind(
        input.userId,
        input.cursor.createdAt,
        input.cursor.createdAt,
        input.cursor.id,
        limit
      )
    : statement.bind(input.userId, limit);
  const result = await bound.all();
  return (result.results ?? []).map((row) => ({
    id: String(row.id),
    source_language: String(row.source_language),
    detected_source_language: nullableString(row.detected_source_language),
    target_language: String(row.target_language),
    source_preview: String(row.source_preview),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at)
  }));
}

export async function deleteSavedTranslation(
  db: SavedDb,
  input: { userId: string; id: string }
): Promise<boolean> {
  const result = await db
    .prepare("DELETE FROM saved_translations WHERE id = ? AND user_id = ?")
    .bind(input.id, input.userId)
    .run();
  return Number(result.meta.changes ?? 0) > 0;
}
