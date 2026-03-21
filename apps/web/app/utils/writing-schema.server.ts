const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error ?? "");

export const isWritingSchemaMissingError = (error: unknown): boolean => {
  const message = getErrorMessage(error);
  return (
    message.includes("no such table: writing_articles") ||
    message.includes("no such table: writing_revisions") ||
    message.includes("no such column: essay_prompt") ||
    message.includes("has no column named essay_prompt") ||
    message.includes("no column named essay_prompt")
  );
};

export const logWritingSchemaMissing = (source: string, error: unknown) => {
  console.warn(
    `${source}: writing schema is missing. Apply the latest D1 migrations including 0008_writing_essay_prompt.sql.`,
    error
  );
};

export const WRITING_UNAVAILABLE_ERROR =
  "Writing is unavailable on this environment until the latest D1 migrations are applied.";
