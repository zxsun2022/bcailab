/// <reference types="@cloudflare/workers-types" />

import type { Db, Post } from "./types";

const mapPost = (row: Record<string, unknown>): Post => ({
  id: String(row.id),
  user_id: String(row.user_id),
  content_md: String(row.content_md),
  content_html: String(row.content_html),
  created_at: String(row.created_at),
  updated_at: String(row.updated_at),
  deleted_at: row.deleted_at ? String(row.deleted_at) : null
});

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
