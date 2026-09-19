import type { GeneratedWritingPrompt } from "@bcailab/db";

export const sqlQuote = (value: string | null): string =>
  value == null ? "NULL" : `'${value.replace(/'/g, "''")}'`;

/**
 * D1 rejects a statement longer than about 100 KB with `SQLITE_TOOBIG`, so the whole bank
 * cannot be one statement once it passes roughly forty-eight prompts: the second batch's
 * single INSERT reached 133 KB and was refused. Statements are packed to this budget
 * instead. Each one repeats the same upsert clause, so a re-run of a partially applied
 * batch converges exactly as a single statement would.
 */
export const PUBLISH_STATEMENT_BUDGET_BYTES = 60_000;

const PUBLISH_COLUMNS = `
    id, slug, family, task_type, prompt_kind, cefr_band,
    title, prompt_text, coach_id, topic, target_words, target_minutes,
    task_material_json, asset_path, asset_alt_text, accessible_description,
    source_label, content_hash, review_manifest_json, owner_approved_hash,
    status, published_at, updated_at`;

const PUBLISH_UPSERT = `
  ON CONFLICT(id) DO UPDATE SET
    slug = excluded.slug,
    family = excluded.family,
    task_type = excluded.task_type,
    prompt_kind = excluded.prompt_kind,
    cefr_band = excluded.cefr_band,
    title = excluded.title,
    prompt_text = excluded.prompt_text,
    coach_id = excluded.coach_id,
    topic = excluded.topic,
    target_words = excluded.target_words,
    target_minutes = excluded.target_minutes,
    task_material_json = excluded.task_material_json,
    asset_path = excluded.asset_path,
    asset_alt_text = excluded.asset_alt_text,
    accessible_description = excluded.accessible_description,
    source_label = excluded.source_label,
    content_hash = excluded.content_hash,
    review_manifest_json = excluded.review_manifest_json,
    owner_approved_hash = excluded.owner_approved_hash,
    status = 'published',
    reviewed_at = COALESCE(writing_prompts.reviewed_at, datetime('now')),
    published_at = COALESCE(writing_prompts.published_at, datetime('now')),
    retired_at = NULL,
    updated_at = datetime('now');`;

/** Keep the column/value contract explicit so field reordering cannot change SQL quoting. */
export const buildPublishedPromptValueRow = (
  prompt: GeneratedWritingPrompt,
  reviewManifest: string
): string => `(${[
  sqlQuote(prompt.id),
  sqlQuote(prompt.slug),
  sqlQuote(prompt.family),
  sqlQuote(prompt.taskType),
  sqlQuote(prompt.promptKind),
  sqlQuote(prompt.cefrBand),
  sqlQuote(prompt.title),
  sqlQuote(prompt.promptText),
  sqlQuote(prompt.coachId),
  sqlQuote(prompt.topic),
  String(prompt.targetWords),
  String(prompt.targetMinutes),
  sqlQuote(prompt.taskMaterialJson),
  sqlQuote(prompt.assetPath),
  sqlQuote(prompt.assetAltText ?? null),
  sqlQuote(prompt.accessibleDescription),
  sqlQuote(prompt.sourceLabel),
  sqlQuote(prompt.contentHash),
  sqlQuote(reviewManifest),
  sqlQuote(prompt.contentHash),
  "'published'",
  "datetime('now')",
  "datetime('now')"
].join(", ")})`;

const buildStatement = (rows: string[]): string =>
  `INSERT INTO writing_prompts (${PUBLISH_COLUMNS}) VALUES\n${rows.join(",\n")}\n${PUBLISH_UPSERT}`;

/**
 * Splits the batch into statements that each stay inside `budgetBytes`. Order is preserved
 * and a single prompt always lands in exactly one statement, so the applied result is the
 * same as one statement would have produced.
 */
export const buildPublishedPromptStatements = (
  prompts: GeneratedWritingPrompt[],
  reviewManifest: string,
  budgetBytes: number = PUBLISH_STATEMENT_BUDGET_BYTES
): string[] => {
  if (prompts.length === 0) return [];
  const statements: string[] = [];
  let rows: string[] = [];
  const flush = () => {
    if (rows.length === 0) return;
    statements.push(buildStatement(rows));
    rows = [];
  };
  for (const prompt of prompts) {
    const row = buildPublishedPromptValueRow(prompt, reviewManifest);
    if (rows.length > 0 && buildStatement([...rows, row]).length > budgetBytes) flush();
    rows.push(row);
  }
  flush();
  return statements;
};
