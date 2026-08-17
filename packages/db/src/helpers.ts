/// <reference types="@cloudflare/workers-types" />

const getDbErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error ?? "");

export const isMissingColumnError = (error: unknown, column: string): boolean => {
  const message = getDbErrorMessage(error);
  return (
    message.includes(`no such column: ${column}`) ||
    message.includes(`has no column named ${column}`) ||
    message.includes(`no column named ${column}`)
  );
};

export const isMissingTableError = (error: unknown, table: string): boolean => {
  const message = getDbErrorMessage(error);
  return message.includes(`no such table: ${table}`);
};
