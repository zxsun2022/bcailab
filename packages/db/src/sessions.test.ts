import { describe, expect, it } from "vitest";
import {
  deleteExpiredSessions,
  MAX_EXPIRED_SESSION_DELETE_BATCH
} from "./index";

describe("expired session cleanup", () => {
  it("deletes one bounded, strictly expired batch", async () => {
    let sql = "";
    let bindings: unknown[] = [];
    const db = {
      prepare(value: string) {
        sql = value;
        return {
          bind(...values: unknown[]) {
            bindings = values;
            return { run: async () => ({ meta: { changes: 7 } }) };
          }
        };
      }
    } as unknown as D1Database;

    const deleted = await deleteExpiredSessions(db, { nowMs: 1_700_000_000_000, limit: 250 });

    expect(deleted).toBe(7);
    expect(sql).toContain("expires_at < ?");
    expect(sql).toContain("ORDER BY expires_at ASC, id ASC");
    expect(bindings).toEqual([1_700_000_000_000, MAX_EXPIRED_SESSION_DELETE_BATCH]);
  });

  it("reports zero when the batch is already empty", async () => {
    const db = {
      prepare() {
        return {
          bind() {
            return { run: async () => ({ meta: {} }) };
          }
        };
      }
    } as unknown as D1Database;

    await expect(deleteExpiredSessions(db, { limit: 0 })).resolves.toBe(0);
  });
});
