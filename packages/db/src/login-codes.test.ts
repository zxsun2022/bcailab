import { describe, expect, it } from "vitest";
import { consumeLoginCode } from "./index";

const makeDb = (changes: number) => {
  let sql = "";
  let bindings: unknown[] = [];
  const db = {
    prepare(value: string) {
      sql = value;
      return {
        bind(...values: unknown[]) {
          bindings = values;
          return { run: async () => ({ meta: { changes } }) };
        }
      };
    }
  } as unknown as D1Database;
  return { db, getSql: () => sql, getBindings: () => bindings };
};

describe("consumeLoginCode", () => {
  it("only consumes a code that is still unconsumed", async () => {
    const { db, getSql } = makeDb(1);
    await consumeLoginCode(db, "code-1");
    expect(getSql()).toContain("consumed_at IS NULL");
  });

  it("returns true when it consumed the code (one row changed)", async () => {
    const { db } = makeDb(1);
    expect(await consumeLoginCode(db, "code-1")).toBe(true);
  });

  it("returns false when the code was already consumed (no row changed)", async () => {
    const { db } = makeDb(0);
    expect(await consumeLoginCode(db, "code-1")).toBe(false);
  });
});
