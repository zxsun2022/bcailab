import { describe, expect, it } from "vitest";
import { completeDictationAttempt, saveDictationAttemptProgress } from "./index";

const recordingDb = (firstRow: unknown = null) => {
  const calls: { sql: string; bindings: unknown[] }[] = [];
  const db = {
    prepare(sql: string) {
      return {
        bind(...bindings: unknown[]) {
          calls.push({ sql, bindings });
          return { run: async () => ({}), first: async () => firstRow };
        }
      };
    }
  } as unknown as D1Database;
  return { db, calls };
};

describe("dictation attempt practice time", () => {
  it("only ever raises the stored total while the attempt is in progress", async () => {
    const { db, calls } = recordingDb();
    await saveDictationAttemptProgress(db, {
      attemptId: "attempt-1",
      userId: "user-1",
      passageId: "passage-1",
      accuracy: 0.5,
      sentenceResults: "[]",
      sentencesDone: 2,
      practiceSeconds: 42
    });
    expect(calls[0]?.sql).toContain("practice_seconds = MAX(practice_seconds, ?)");
    expect(calls[0]?.sql).toContain("status = 'in_progress'");
    expect(calls[0]?.bindings).toEqual([0.5, "[]", 2, 42, "attempt-1", "user-1"]);
  });

  it("stores the first total on a new attempt", async () => {
    const { db, calls } = recordingDb();
    await saveDictationAttemptProgress(db, {
      attemptId: null,
      userId: "user-1",
      passageId: "passage-1",
      accuracy: 1,
      sentenceResults: "[]",
      sentencesDone: 1,
      practiceSeconds: 17
    });
    expect(calls[0]?.sql).toContain("practice_seconds)");
    expect(calls[0]?.bindings.at(-1)).toBe(17);
  });

  it("completes with MAX and returns the stored total for the profile", async () => {
    const { db, calls } = recordingDb({ practice_seconds: 180 });
    const result = await completeDictationAttempt(db, {
      attemptId: "attempt-1",
      userId: "user-1",
      accuracy: 0.9,
      sentenceResults: "[]",
      sentencesDone: 10,
      practiceSeconds: 150
    });
    expect(calls[0]?.sql).toContain("practice_seconds = MAX(practice_seconds, ?)");
    expect(calls[0]?.sql).toContain("RETURNING practice_seconds");
    expect(result.practiceSeconds).toBe(180);
  });

  it("credits nothing when the attempt row is not found", async () => {
    const { db } = recordingDb(null);
    const result = await completeDictationAttempt(db, {
      attemptId: "missing",
      userId: "user-1",
      accuracy: 0,
      sentenceResults: "[]",
      sentencesDone: 0,
      practiceSeconds: 99
    });
    expect(result.practiceSeconds).toBe(0);
  });
});
