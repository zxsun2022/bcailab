import { describe, expect, it } from "vitest";
import {
  deriveEslAttemptEvaluationState,
  ESL_PENDING_EVAL_STALE_MS,
  parseSqliteUtc
} from "./esl-reading";

const now = Date.UTC(2026, 8, 21, 12, 0, 0);
const sqliteAgo = (ms: number) => new Date(now - ms).toISOString().slice(0, 19).replace("T", " ");

describe("parseSqliteUtc", () => {
  it("reads SQLite datetime text as UTC whatever the host timezone", () => {
    expect(parseSqliteUtc("2026-09-21 12:00:00")).toBe(now);
    expect(parseSqliteUtc("2026-09-21 12:00:00.250")).toBe(now + 250);
  });

  it("leaves values that already carry a zone alone", () => {
    expect(parseSqliteUtc("2026-09-21T12:00:00Z")).toBe(now);
    expect(parseSqliteUtc("2026-09-21T05:00:00-07:00")).toBe(now);
  });
});

describe("deriveEslAttemptEvaluationState staleness", () => {
  const pending = { storedStatus: "pending" as const, hasEvaluation: false, now };

  it("measures from the current run, so a retry on an old attempt is not stale", () => {
    const state = deriveEslAttemptEvaluationState({
      ...pending,
      createdAt: sqliteAgo(10 * 60 * 1000),
      startedAt: sqliteAgo(2 * 1000)
    });
    expect(state).toEqual({ status: "pending", isStalePending: false });
  });

  it("marks a run stale once the window has passed", () => {
    const state = deriveEslAttemptEvaluationState({
      ...pending,
      createdAt: sqliteAgo(10 * 60 * 1000),
      startedAt: sqliteAgo(ESL_PENDING_EVAL_STALE_MS + 1000)
    });
    expect(state.isStalePending).toBe(true);
  });

  it("falls back to created_at for attempts from before run tracking", () => {
    expect(
      deriveEslAttemptEvaluationState({ ...pending, createdAt: sqliteAgo(60 * 1000), startedAt: null })
        .isStalePending
    ).toBe(true);
    expect(
      deriveEslAttemptEvaluationState({ ...pending, createdAt: sqliteAgo(5 * 1000) }).isStalePending
    ).toBe(false);
  });

  it("treats a stored evaluation as completed regardless of timing", () => {
    expect(
      deriveEslAttemptEvaluationState({
        storedStatus: "pending",
        hasEvaluation: true,
        createdAt: sqliteAgo(60 * 60 * 1000),
        now
      })
    ).toEqual({ status: "completed", isStalePending: false });
  });
});
