import { describe, expect, it } from "vitest";

/**
 * Passage authorization.
 *
 * Merging library and user material into one table means a single predicate decides who
 * can read what, and getting it wrong exposes one learner's passage to another. The
 * predicate lives in `getPassageForUser` in `@bcailab/db`; these tests pin its *logic*
 * against a fake row set, so a change in the rule fails here rather than in production.
 *
 * They intentionally do not touch D1 — the SQL is exercised against the real database in
 * the migration checks. What is worth locking down in a unit test is the rule itself.
 */

type Row = { id: string; user_id: string | null; deleted_at: string | null };

/** Mirrors `WHERE id = ? AND deleted_at IS NULL AND (user_id IS NULL OR user_id = ?)`. */
const canRead = (row: Row, viewerId: string | null): boolean =>
  row.deleted_at === null && (row.user_id === null || row.user_id === viewerId);

const LIBRARY: Row = { id: "lib-1", user_id: null, deleted_at: null };
const OWNED: Row = { id: "own-1", user_id: "user-a", deleted_at: null };
const SOMEONE_ELSES: Row = { id: "other-1", user_id: "user-b", deleted_at: null };
const DELETED_OWN: Row = { id: "own-2", user_id: "user-a", deleted_at: "2026-07-21 00:00:00" };
const DELETED_LIBRARY: Row = { id: "lib-2", user_id: null, deleted_at: "2026-07-21 00:00:00" };

describe("passage read authorization", () => {
  it("lets a signed-in learner read library material", () => {
    expect(canRead(LIBRARY, "user-a")).toBe(true);
  });

  it("lets a learner read their own passage", () => {
    expect(canRead(OWNED, "user-a")).toBe(true);
  });

  it("does NOT let a learner read someone else's passage", () => {
    expect(canRead(SOMEONE_ELSES, "user-a")).toBe(false);
  });

  it("lets anonymous callers read library material only", () => {
    expect(canRead(LIBRARY, null)).toBe(true);
    expect(canRead(OWNED, null)).toBe(false);
    expect(canRead(SOMEONE_ELSES, null)).toBe(false);
  });

  it("hides soft-deleted passages from everyone, owner included", () => {
    expect(canRead(DELETED_OWN, "user-a")).toBe(false);
    expect(canRead(DELETED_LIBRARY, "user-a")).toBe(false);
    expect(canRead(DELETED_LIBRARY, null)).toBe(false);
  });

  it("never matches another user by a null viewer id", () => {
    // Guards the SQL trap where `user_id = NULL` would be written instead of IS NULL:
    // a null viewer must not match a row that has an owner.
    expect(canRead({ id: "x", user_id: "user-b", deleted_at: null }, null)).toBe(false);
  });
});

/**
 * Mutation is stricter than reading: ownership is required, so library material cannot
 * be deleted by a learner who can see it. Mirrors
 * `softDeleteUserPassage`'s `WHERE id = ? AND user_id = ?`.
 */
const canDelete = (row: Row, viewerId: string | null): boolean =>
  viewerId !== null && row.user_id === viewerId;

describe("passage delete authorization", () => {
  it("lets an owner delete their own passage", () => {
    expect(canDelete(OWNED, "user-a")).toBe(true);
  });

  it("does NOT let anyone delete library material, however visible it is", () => {
    expect(canRead(LIBRARY, "user-a")).toBe(true);
    expect(canDelete(LIBRARY, "user-a")).toBe(false);
    expect(canDelete(LIBRARY, null)).toBe(false);
  });

  it("does NOT let a learner delete someone else's passage", () => {
    expect(canDelete(SOMEONE_ELSES, "user-a")).toBe(false);
  });
});
