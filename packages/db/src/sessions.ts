import type { Db } from "./types";

export const MAX_EXPIRED_SESSION_DELETE_BATCH = 100;

export type DeleteExpiredSessionsOptions = {
  nowMs?: number;
  limit?: number;
};

/**
 * Deletes at most one bounded batch of expired sessions. A strict `<` keeps a
 * session valid through its exact expiry instant and makes reruns idempotent.
 */
export const deleteExpiredSessions = async (
  db: Db,
  options: DeleteExpiredSessionsOptions = {}
): Promise<number> => {
  const nowMs = options.nowMs ?? Date.now();
  const requestedLimit = options.limit ?? MAX_EXPIRED_SESSION_DELETE_BATCH;
  const limit = Math.min(
    MAX_EXPIRED_SESSION_DELETE_BATCH,
    Math.max(1, Math.floor(requestedLimit))
  );

  const result = await db
    .prepare(
      `DELETE FROM sessions
       WHERE id IN (
         SELECT id
         FROM sessions
         WHERE expires_at < ?
         ORDER BY expires_at ASC, id ASC
         LIMIT ?
       )`
    )
    .bind(nowMs, limit)
    .run();

  return result.meta.changes ?? 0;
};
