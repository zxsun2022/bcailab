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
