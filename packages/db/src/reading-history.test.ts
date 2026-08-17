import { describe, expect, it } from "vitest";
import { listLatestEslReadingEvaluationsByPassage } from "./index";

const evaluationRow = (attemptId: string) => ({
  id: `evaluation-${attemptId}`,
  attempt_id: attemptId,
  user_id: "user-1",
  model_name: "test-model",
  rubric_version: "v1",
  output_json: "{}",
  created_at: "2026-08-17 10:00:00"
});

describe("Reading evaluation history query", () => {
  it("loads all latest evaluations for a passage with one query", async () => {
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
            return { all: async () => ({ results: [evaluationRow("attempt-1")] }) };
          }
        };
      }
    } as unknown as D1Database;

    const evaluations = await listLatestEslReadingEvaluationsByPassage(db, {
      userId: "user-1",
      passageId: "passage-1"
    });

    expect(prepareCount).toBe(1);
    expect(sql).toContain("JOIN esl_reading_attempts");
    expect(sql).toContain("ORDER BY e2.created_at DESC, e2.id DESC");
    expect(bindings).toEqual(["user-1", "user-1", "passage-1"]);
    expect(evaluations).toHaveLength(1);
    expect(evaluations[0]?.attempt_id).toBe("attempt-1");
  });
});
