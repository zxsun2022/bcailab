import { describe, expect, it } from "vitest";
import {
  getWritingPracticeItem,
  listWritingPracticeItemsByRevision,
  startWritingPracticeItem,
  updateWritingPracticeItem
} from "./index";

const row = {
  id: "p1", user_id: "user-1", article_id: "a1", revision_id: "r1", feedback_generation: 2,
  annotation_index: 3, annotation_json: "{}", feedback_language: "zh", status: "fix",
  transfer_prompt: null, attempts_json: "[]", version: 1,
  created_at: "2026-09-25 10:00:00", updated_at: "2026-09-25 10:00:00", ended_at: null
};

const recordingDb = (changes = 1) => {
  const calls: { sql: string; bindings: unknown[] }[] = [];
  const db = {
    prepare(sql: string) {
      const call = { sql, bindings: [] as unknown[] };
      calls.push(call);
      const bound = {
        run: async () => ({ meta: { changes } }),
        first: async () => row,
        all: async () => ({ results: [row] })
      };
      return { bind(...values: unknown[]) { call.bindings = values; return bound; } };
    }
  } as unknown as D1Database;
  return { db, calls };
};

describe("writing practice items", () => {
  it("starts idempotently: one item per user, round generation and annotation", async () => {
    const { db, calls } = recordingDb();
    const item = await startWritingPracticeItem(db, {
      userId: "user-1", articleId: "a1", revisionId: "r1", feedbackGeneration: 2,
      annotationIndex: 3, annotationJson: "{}", feedbackLanguage: "zh"
    });
    expect(calls[0]!.sql).toContain("ON CONFLICT (user_id, revision_id, feedback_generation, annotation_index) DO NOTHING");
    expect(calls[1]!.sql).toContain("WHERE user_id = ? AND revision_id = ? AND feedback_generation = ? AND annotation_index = ?");
    expect(calls[1]!.bindings).toEqual(["user-1", "r1", 2, 3]);
    expect(item.feedback_language).toBe("zh");
    expect(item.status).toBe("fix");
  });

  it("scopes every read to the owner", async () => {
    const { db, calls } = recordingDb();
    await getWritingPracticeItem(db, { id: "p1", userId: "user-1" });
    await listWritingPracticeItemsByRevision(db, { userId: "user-1", revisionId: "r1", feedbackGeneration: 2 });
    expect(calls[0]!.sql).toContain("WHERE id = ? AND user_id = ?");
    expect(calls[1]!.sql).toContain("WHERE user_id = ? AND revision_id = ? AND feedback_generation = ?");
    expect(calls[1]!.bindings).toEqual(["user-1", "r1", 2]);
  });

  it("writes only over the version it read, and reports a lost race", async () => {
    const won = recordingDb(1);
    const input = { id: "p1", userId: "user-1", version: 4, status: "finished" as const, transferPrompt: "s", attemptsJson: "[]", ended: true };
    expect(await updateWritingPracticeItem(won.db, input)).toBe(true);
    expect(won.calls[0]!.sql).toContain("WHERE id = ? AND user_id = ? AND version = ?");
    expect(won.calls[0]!.sql).toContain("version = version + 1");
    expect(won.calls[0]!.bindings).toEqual(["finished", "s", "[]", 1, "p1", "user-1", 4]);
    expect(await updateWritingPracticeItem(recordingDb(0).db, input)).toBe(false);
  });
});
