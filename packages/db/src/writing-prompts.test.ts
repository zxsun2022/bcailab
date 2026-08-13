import { describe, expect, it } from "vitest";
import {
  decodeWritingPromptCursor,
  encodeWritingPromptCursor,
  listPublishedWritingPromptPage
} from "./writing-prompts";

describe("Writing prompt catalogue pagination", () => {
  it("round-trips cursor values without confusing punctuation for structure", () => {
    const cursor = encodeWritingPromptCursor({
      id: "prompt:one/two",
      title: "A choice: work & travel?",
      cefr_band: "B2"
    });
    expect(decodeWritingPromptCursor(cursor)).toEqual({
      rank: 2,
      title: "A choice: work & travel?",
      id: "prompt:one/two"
    });
  });

  it("ignores malformed cursors", () => {
    expect(decodeWritingPromptCursor("99:bad:id")).toBeNull();
    expect(decodeWritingPromptCursor("2:%E0%A4%A:id")).toBeNull();
  });

  it("queries one bounded category page and exposes a continuation cursor", async () => {
    let sql = "";
    let bindings: unknown[] = [];
    const rows = Array.from({ length: 13 }, (_, index) => ({
      id: `p-${index}`,
      slug: `prompt-${index}`,
      family: "general",
      task_type: "guided",
      prompt_kind: "guided",
      cefr_band: "A2",
      title: `Prompt ${String(index).padStart(2, "0")}`,
      coach_id: "general",
      topic: "Everyday life",
      target_words: 90,
      target_minutes: 15,
      asset_path: null,
      asset_alt_text: null,
      attempt_count: 0,
      latest_attempt_at: null
    }));
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

    const page = await listPublishedWritingPromptPage(db, {
      userId: "user-1",
      family: "general",
      cefrBand: "A2",
      limit: 12
    });

    expect(sql).toContain("p.family = ?");
    expect(sql).toContain("p.cefr_band = ?");
    expect(bindings).toEqual(["user-1", "general", "A2", 13]);
    expect(page.items).toHaveLength(12);
    expect(decodeWritingPromptCursor(page.next_cursor)).toEqual({
      rank: 0,
      title: "Prompt 11",
      id: "p-11"
    });
  });
});
