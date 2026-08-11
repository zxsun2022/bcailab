import { describe, expect, it } from "vitest";
import {
  decodeWritingArticleCursor,
  encodeWritingArticleCursor,
  listWritingArticlePageByUser
} from "./index";

const articleRow = (index: number) => ({
  id: `article-${String(index).padStart(2, "0")}`,
  user_id: "user-1",
  title: `Session ${index}`,
  essay_prompt: null,
  prompt_id: null,
  assignment_snapshot_json: null,
  start_key: null,
  agent_type: "general",
  status: "active",
  created_at: `2026-08-${String(index + 1).padStart(2, "0")} 10:00:00`,
  updated_at: `2026-08-${String(index + 1).padStart(2, "0")} 11:00:00`,
  deleted_at: null
});

describe("Writing session pagination", () => {
  it("round-trips cursor values", () => {
    const cursor = encodeWritingArticleCursor(articleRow(1));
    expect(decodeWritingArticleCursor(cursor)).toEqual({
      updatedAt: "2026-08-02 11:00:00",
      createdAt: "2026-08-02 10:00:00",
      id: "article-01"
    });
    expect(decodeWritingArticleCursor("bad:cursor")).toBeNull();
  });

  it("queries one bounded user-owned page and exposes a continuation cursor", async () => {
    let sql = "";
    let bindings: unknown[] = [];
    const rows = Array.from({ length: 21 }, (_, index) => articleRow(index));
    const db = {
      prepare(value: string) {
        sql = value;
        return {
          bind(...values: unknown[]) {
            bindings = values;
            return { all: async () => ({ results: rows }) };
          }
        };
      }
    } as unknown as D1Database;

    const page = await listWritingArticlePageByUser(db, {
      userId: "user-1",
      limit: 20
    });

    expect(sql).toContain("user_id = ?");
    expect(sql).toContain("deleted_at IS NULL");
    expect(sql).toContain("ORDER BY updated_at DESC, created_at DESC, id DESC");
    expect(bindings).toEqual(["user-1", 21]);
    expect(page.items).toHaveLength(20);
    expect(decodeWritingArticleCursor(page.next_cursor)).toEqual({
      updatedAt: "2026-08-20 11:00:00",
      createdAt: "2026-08-20 10:00:00",
      id: "article-19"
    });
  });

  it("continues after the complete stable ordering key", async () => {
    let sql = "";
    let bindings: unknown[] = [];
    const db = {
      prepare(value: string) {
        sql = value;
        return {
          bind(...values: unknown[]) {
            bindings = values;
            return { all: async () => ({ results: [] }) };
          }
        };
      }
    } as unknown as D1Database;
    const cursor = encodeWritingArticleCursor(articleRow(4));

    await listWritingArticlePageByUser(db, {
      userId: "user-1",
      cursor,
      limit: 20
    });

    expect(sql).toContain("updated_at < ?");
    expect(sql).toContain("created_at < ?");
    expect(sql).toContain("id < ?");
    expect(bindings).toEqual([
      "user-1",
      "2026-08-05 11:00:00",
      "2026-08-05 11:00:00",
      "2026-08-05 10:00:00",
      "2026-08-05 10:00:00",
      "article-04",
      21
    ]);
  });
});
