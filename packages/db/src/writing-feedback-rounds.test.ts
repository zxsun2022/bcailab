import { describe, expect, it } from "vitest";
import { listLatestWritingFeedbackRoundsByUser } from "./index";

const roundRow = {
  article_id: "article-1",
  agent_type: "ielts_task2",
  feedback_json: "{\"annotations\":[]}",
  created_at: "2026-09-14 09:00:00"
};

describe("Writing feedback rounds for the learner brief", () => {
  it("reads one bounded, user-scoped query that keeps deleted sessions out", async () => {
    let prepareCount = 0;
    let sql = "";
    let bindings: unknown[] = [];
    const db = {
      prepare(value: string) {
        prepareCount += 1;
        sql = value;
        return {
          bind(...values: unknown[]) {
            bindings = values;
            return { all: async () => ({ results: [roundRow] }) };
          }
        };
      }
    } as unknown as D1Database;

    const rounds = await listLatestWritingFeedbackRoundsByUser(db, { userId: "user-1", limit: 99 });

    expect(prepareCount).toBe(1);
    // Revisions of a deleted session are retained for recovery; only the article join hides them.
    expect(sql).toContain("a.deleted_at IS NULL");
    expect(sql).toContain("r2.feedback_status = 'completed'");
    expect(sql).toContain("ORDER BY r2.round_number DESC");
    expect(bindings).toEqual(["user-1", "user-1", null, null, 25]);
    expect(rounds).toEqual([roundRow]);
  });
});
