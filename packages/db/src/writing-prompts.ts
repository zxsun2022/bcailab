/// <reference types="@cloudflare/workers-types" />

type PromptDb = D1Database;

export type WritingPromptFamily = "general" | "ielts";
export type WritingPromptTaskType =
  | "guided"
  | "academic_task_1"
  | "academic_task_2";
export type WritingPromptKind =
  | "email"
  | "opinion"
  | "story"
  | "description"
  | "line_graph"
  | "bar_chart"
  | "pie_chart"
  | "table"
  | "process"
  | "map"
  | "opinion_essay"
  | "discussion"
  | "problem_solution"
  | "advantages_disadvantages";
export type WritingPromptStatus = "draft" | "reviewed" | "published" | "retired";

export type WritingPrompt = {
  id: string;
  slug: string;
  schema_version: 1;
  family: WritingPromptFamily;
  task_type: WritingPromptTaskType;
  prompt_kind: WritingPromptKind;
  cefr_band: "A2" | "B1" | "B2" | "C1" | null;
  title: string;
  prompt_text: string;
  coach_id: "general" | "ielts_task1" | "ielts_task2";
  topic: string;
  target_words: number;
  target_minutes: number;
  task_material_json: string | null;
  asset_path: string | null;
  asset_alt_text: string | null;
  accessible_description: string | null;
  source_label: string;
  content_hash: string;
  review_manifest_json: string | null;
  owner_approved_hash: string | null;
  status: WritingPromptStatus;
  reviewed_at: string | null;
  published_at: string | null;
  retired_at: string | null;
  created_at: string;
  updated_at: string;
};

export type WritingPromptSummary = Pick<
  WritingPrompt,
  | "id"
  | "slug"
  | "family"
  | "task_type"
  | "prompt_kind"
  | "cefr_band"
  | "title"
  | "coach_id"
  | "topic"
  | "target_words"
  | "target_minutes"
  | "asset_path"
  | "asset_alt_text"
> & {
  attempt_count: number;
  latest_attempt_at: string | null;
};

const nullableString = (value: unknown): string | null =>
  value == null ? null : String(value);

const mapWritingPrompt = (row: Record<string, unknown>): WritingPrompt => ({
  id: String(row.id),
  slug: String(row.slug),
  schema_version: 1,
  family: row.family as WritingPromptFamily,
  task_type: row.task_type as WritingPromptTaskType,
  prompt_kind: row.prompt_kind as WritingPromptKind,
  cefr_band: nullableString(row.cefr_band) as WritingPrompt["cefr_band"],
  title: String(row.title),
  prompt_text: String(row.prompt_text),
  coach_id: row.coach_id as WritingPrompt["coach_id"],
  topic: String(row.topic),
  target_words: Number(row.target_words),
  target_minutes: Number(row.target_minutes),
  task_material_json: nullableString(row.task_material_json),
  asset_path: nullableString(row.asset_path),
  asset_alt_text: nullableString(row.asset_alt_text),
  accessible_description: nullableString(row.accessible_description),
  source_label: String(row.source_label),
  content_hash: String(row.content_hash),
  review_manifest_json: nullableString(row.review_manifest_json),
  owner_approved_hash: nullableString(row.owner_approved_hash),
  status: row.status as WritingPromptStatus,
  reviewed_at: nullableString(row.reviewed_at),
  published_at: nullableString(row.published_at),
  retired_at: nullableString(row.retired_at),
  created_at: String(row.created_at),
  updated_at: String(row.updated_at)
});

const PROMPT_SUMMARY_COLUMNS = `
  p.id, p.slug, p.family, p.task_type, p.prompt_kind, p.cefr_band,
  p.title, p.coach_id, p.topic, p.target_words, p.target_minutes,
  p.asset_path, p.asset_alt_text,
  COUNT(a.id) AS attempt_count,
  MAX(a.updated_at) AS latest_attempt_at`;

export async function listPublishedWritingPrompts(
  db: PromptDb,
  input: {
    userId: string;
    family?: WritingPromptFamily | null;
    taskType?: WritingPromptTaskType | null;
    cefrBand?: WritingPrompt["cefr_band"];
    limit?: number;
  }
): Promise<WritingPromptSummary[]> {
  const clauses = ["p.status = 'published'"];
  const bindings: Array<string | number> = [input.userId];
  if (input.family) {
    clauses.push("p.family = ?");
    bindings.push(input.family);
  }
  if (input.taskType) {
    clauses.push("p.task_type = ?");
    bindings.push(input.taskType);
  }
  if (input.cefrBand) {
    clauses.push("p.cefr_band = ?");
    bindings.push(input.cefrBand);
  }
  bindings.push(Math.min(Math.max(input.limit ?? 100, 1), 100));

  const result = await db
    .prepare(
      `SELECT ${PROMPT_SUMMARY_COLUMNS}
       FROM writing_prompts p
       LEFT JOIN writing_articles a
         ON a.prompt_id = p.id AND a.user_id = ? AND a.deleted_at IS NULL
       WHERE ${clauses.join(" AND ")}
       GROUP BY p.id
       ORDER BY
         CASE p.family WHEN 'general' THEN 0 ELSE 1 END,
         CASE p.cefr_band WHEN 'A2' THEN 0 WHEN 'B1' THEN 1 WHEN 'B2' THEN 2 WHEN 'C1' THEN 3 ELSE 4 END,
         p.title ASC
       LIMIT ?`
    )
    .bind(...bindings)
    .all();

  return (result.results ?? []).map((row) => ({
    id: String(row.id),
    slug: String(row.slug),
    family: row.family as WritingPromptFamily,
    task_type: row.task_type as WritingPromptTaskType,
    prompt_kind: row.prompt_kind as WritingPromptKind,
    cefr_band: nullableString(row.cefr_band) as WritingPrompt["cefr_band"],
    title: String(row.title),
    coach_id: row.coach_id as WritingPrompt["coach_id"],
    topic: String(row.topic),
    target_words: Number(row.target_words),
    target_minutes: Number(row.target_minutes),
    asset_path: nullableString(row.asset_path),
    asset_alt_text: nullableString(row.asset_alt_text),
    attempt_count: Number(row.attempt_count ?? 0),
    latest_attempt_at: nullableString(row.latest_attempt_at)
  }));
}

export async function getPublishedWritingPromptBySlug(
  db: PromptDb,
  slug: string
): Promise<WritingPrompt | null> {
  const row = await db
    .prepare("SELECT * FROM writing_prompts WHERE slug = ? AND status = 'published' LIMIT 1")
    .bind(slug)
    .first();
  return row ? mapWritingPrompt(row) : null;
}

export async function getWritingPromptById(
  db: PromptDb,
  id: string
): Promise<WritingPrompt | null> {
  const row = await db
    .prepare("SELECT * FROM writing_prompts WHERE id = ? LIMIT 1")
    .bind(id)
    .first();
  return row ? mapWritingPrompt(row) : null;
}

/** Constant-cost schema probe used by the Writing layout. */
export async function probeWritingPromptSchema(db: PromptDb): Promise<void> {
  await db.prepare("SELECT id FROM writing_prompts LIMIT 1").first();
}
