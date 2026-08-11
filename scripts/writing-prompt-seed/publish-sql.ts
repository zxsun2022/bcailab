import type { GeneratedWritingPrompt } from "@bcailab/db";

export const sqlQuote = (value: string | null): string =>
  value == null ? "NULL" : `'${value.replace(/'/g, "''")}'`;

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
