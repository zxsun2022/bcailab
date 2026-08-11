const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error ?? "");

export const isWritingSchemaMissingError = (error: unknown): boolean => {
  const message = getErrorMessage(error);
  return (
    message.includes("no such table: writing_articles") ||
    message.includes("no such table: writing_revisions") ||
    message.includes("no such table: writing_prompts") ||
    message.includes("no such column: essay_prompt") ||
    message.includes("has no column named essay_prompt") ||
    message.includes("no column named essay_prompt") ||
    message.includes("no such column: prompt_id") ||
    message.includes("has no column named prompt_id") ||
    message.includes("no such column: assignment_snapshot_json") ||
    message.includes("has no column named assignment_snapshot_json") ||
    message.includes("no such column: feedback_generation") ||
    message.includes("has no column named feedback_generation")
  );
};

export const logWritingSchemaMissing = (source: string, error: unknown) => {
  console.warn(
    `${source}: writing schema is missing. Apply the latest D1 migrations through 0016_writing_prompts.sql.`,
    { errorClass: error instanceof Error ? error.name : "unknown", message: getErrorMessage(error) }
  );
};

export const WRITING_UNAVAILABLE_ERROR =
  "Writing is unavailable on this environment until the latest D1 migrations are applied.";
