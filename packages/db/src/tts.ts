/// <reference types="@cloudflare/workers-types" />

import type { Db, TtsGeneration } from "./types";

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
