/// <reference types="@cloudflare/workers-types" />

import type { Db, EslLearnerProfile, LearnerTagObservationRow } from "./types";
import { isMissingTableError } from "./helpers";

const mapEslLearnerProfile = (row: Record<string, unknown>): EslLearnerProfile => ({
  id: String(row.id),
  user_id: String(row.user_id),
  persistent_issues_json: String(row.persistent_issues_json),
  strengths_json: String(row.strengths_json),
  cefr_estimate: row.cefr_estimate ? String(row.cefr_estimate) : null,
  total_practice_seconds: Number(row.total_practice_seconds),
  total_attempts: Number(row.total_attempts),
  eval_count_since_update: Number(row.eval_count_since_update),
  tag_mastery_json: row.tag_mastery_json ? String(row.tag_mastery_json) : "{}",
  cefr_declared: row.cefr_declared ? String(row.cefr_declared) : null,
  cefr_measured: row.cefr_measured ? String(row.cefr_measured) : null,
  cefr_measured_confidence: Number(row.cefr_measured_confidence ?? 0),
  created_at: String(row.created_at),
  updated_at: String(row.updated_at)
});

export async function getEslLearnerProfile(
  db: Db,
  userId: string
): Promise<EslLearnerProfile | null> {
  let result;
  try {
    result = await db
      .prepare("SELECT * FROM esl_learner_profiles WHERE user_id = ? LIMIT 1")
      .bind(userId)
      .first();
  } catch (error) {
    if (isMissingTableError(error, "esl_learner_profiles")) return null;
    throw error;
  }
  return result ? mapEslLearnerProfile(result) : null;
}

export async function upsertEslLearnerProfile(
  db: Db,
  input: {
    userId: string;
    persistentIssuesJson: string;
    strengthsJson: string;
    cefrEstimate: string | null;
    totalPracticeSeconds: number;
    totalAttempts: number;
    evalCountSinceUpdate: number;
  }
): Promise<EslLearnerProfile> {
  const existing = await getEslLearnerProfile(db, input.userId);
  if (existing) {
    await db
      .prepare(
        "UPDATE esl_learner_profiles SET persistent_issues_json = ?, strengths_json = ?, cefr_estimate = ?, total_practice_seconds = ?, total_attempts = ?, eval_count_since_update = ?, updated_at = datetime('now') WHERE user_id = ?"
      )
      .bind(
        input.persistentIssuesJson,
        input.strengthsJson,
        input.cefrEstimate,
        input.totalPracticeSeconds,
        input.totalAttempts,
        input.evalCountSinceUpdate,
        input.userId
      )
      .run();
  } else {
    const id = crypto.randomUUID();
    await db
      .prepare(
        "INSERT INTO esl_learner_profiles (id, user_id, persistent_issues_json, strengths_json, cefr_estimate, total_practice_seconds, total_attempts, eval_count_since_update) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .bind(
        id,
        input.userId,
        input.persistentIssuesJson,
        input.strengthsJson,
        input.cefrEstimate,
        input.totalPracticeSeconds,
        input.totalAttempts,
        input.evalCountSinceUpdate
      )
      .run();
  }
  const profile = await getEslLearnerProfile(db, input.userId);
  if (!profile) throw new Error("Failed to upsert esl learner profile.");
  return profile;
}

export async function incrementEslLearnerProfileCounters(
  db: Db,
  input: { userId: string; practiceSeconds: number }
): Promise<void> {
  try {
    const existing = await getEslLearnerProfile(db, input.userId);
    if (existing) {
      await db
        .prepare(
          "UPDATE esl_learner_profiles SET total_practice_seconds = total_practice_seconds + ?, total_attempts = total_attempts + 1, eval_count_since_update = eval_count_since_update + 1, updated_at = datetime('now') WHERE user_id = ?"
        )
        .bind(input.practiceSeconds, input.userId)
        .run();
    } else {
      const id = crypto.randomUUID();
      await db
        .prepare(
          "INSERT INTO esl_learner_profiles (id, user_id, total_practice_seconds, total_attempts, eval_count_since_update) VALUES (?, ?, ?, 1, 1)"
        )
        .bind(id, input.userId, input.practiceSeconds)
        .run();
    }
  } catch (error) {
    if (isMissingTableError(error, "esl_learner_profiles")) return;
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Learner model: per-tag observations + profile aggregation (migration 0014).
// Design: docs/learner-model-design.md. Deterministic layer only — no LLM here.
// ---------------------------------------------------------------------------

/**
 * Append the per-tag tallies for one scored attempt. Batched, one row per tag. A missing
 * table is swallowed the same way the profile helpers do it, so an environment that has not
 * run migration 0014 keeps scoring attempts rather than erroring.
 */
export async function insertLearnerTagObservations(
  db: Db,
  input: {
    userId: string;
    mode: "dictation" | "reading";
    passageId: string;
    attemptId: string;
    source: "deterministic" | "llm";
    tallies: { tag: string; exposure: number; hits: number }[];
  }
): Promise<void> {
  const rows = input.tallies.filter((t) => t.exposure > 0);
  if (rows.length === 0) return;
  const insert = db.prepare(
    `INSERT INTO learner_tag_observations
       (id, user_id, tag, mode, passage_id, attempt_id, exposure, hits, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const statements = rows.map((t) =>
    insert.bind(
      crypto.randomUUID(),
      input.userId,
      t.tag,
      input.mode,
      input.passageId,
      input.attemptId,
      t.exposure,
      t.hits,
      input.source
    )
  );
  try {
    await db.batch(statements);
  } catch (error) {
    if (isMissingTableError(error, "learner_tag_observations")) return;
    throw error;
  }
}

/** A learner's most recent tag observations, newest-first — the aggregation's input. The
 *  limit bounds the recompute to a fixed scan rather than a learner's whole history. */
export async function getRecentLearnerTagObservations(
  db: Db,
  userId: string,
  limit = 500
): Promise<LearnerTagObservationRow[]> {
  let result;
  try {
    result = await db
      .prepare(
        `SELECT tag, exposure, hits, source FROM learner_tag_observations
         WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?`
      )
      .bind(userId, limit)
      .all();
  } catch (error) {
    if (isMissingTableError(error, "learner_tag_observations")) return [];
    throw error;
  }
  return (result.results ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      tag: String(r.tag),
      exposure: Number(r.exposure ?? 0),
      hits: Number(r.hits ?? 0),
      source: r.source === "llm" ? "llm" : "deterministic"
    };
  });
}

/** Completed dictation attempts joined to their passage band — the CEFR estimate's input.
 *  Newest-first, bounded. */
export async function getDictationBandResults(
  db: Db,
  userId: string,
  limit = 100
): Promise<{ band: string | null; accuracy: number }[]> {
  const result = await db
    .prepare(
      `SELECT p.band AS band, a.accuracy AS accuracy
         FROM dictation_attempts a
         JOIN passages p ON p.id = a.passage_id
        WHERE a.user_id = ? AND a.status = 'completed' AND a.deleted_at IS NULL
        ORDER BY a.created_at DESC LIMIT ?`
    )
    .bind(userId, limit)
    .all();
  return (result.results ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      band: r.band ? String(r.band) : null,
      accuracy: Number(r.accuracy ?? 0)
    };
  });
}

/**
 * Write the deterministic aggregation output (per-tag mastery + measured/resolved CEFR) and
 * reset the recompute throttle. Upserts so it works before the profile row exists. Does not
 * touch the LLM-named issue/strength fields — those have their own writer below.
 */
export async function updateLearnerProfileAggregate(
  db: Db,
  input: {
    userId: string;
    tagMasteryJson: string;
    cefrMeasured: string | null;
    cefrMeasuredConfidence: number;
    cefrEstimate: string | null;
  }
): Promise<void> {
  try {
    await db
      .prepare(
        `INSERT INTO esl_learner_profiles
           (id, user_id, tag_mastery_json, cefr_measured, cefr_measured_confidence, cefr_estimate, eval_count_since_update)
         VALUES (?, ?, ?, ?, ?, ?, 0)
         ON CONFLICT(user_id) DO UPDATE SET
           tag_mastery_json = excluded.tag_mastery_json,
           cefr_measured = excluded.cefr_measured,
           cefr_measured_confidence = excluded.cefr_measured_confidence,
           cefr_estimate = excluded.cefr_estimate,
           eval_count_since_update = 0,
           updated_at = datetime('now')`
      )
      .bind(
        crypto.randomUUID(),
        input.userId,
        input.tagMasteryJson,
        input.cefrMeasured,
        input.cefrMeasuredConfidence,
        input.cefrEstimate
      )
      .run();
  } catch (error) {
    if (isMissingTableError(error, "esl_learner_profiles")) return;
    throw error;
  }
}

/** Write the LLM-named patterns. This finally supplies the write path the profile's
 *  issue/strength fields were designed for and never got (design §3, §6.4). */
export async function updateLearnerNamedPatterns(
  db: Db,
  input: { userId: string; persistentIssuesJson: string; strengthsJson: string }
): Promise<void> {
  try {
    await db
      .prepare(
        `INSERT INTO esl_learner_profiles (id, user_id, persistent_issues_json, strengths_json)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           persistent_issues_json = excluded.persistent_issues_json,
           strengths_json = excluded.strengths_json,
           updated_at = datetime('now')`
      )
      .bind(
        crypto.randomUUID(),
        input.userId,
        input.persistentIssuesJson,
        input.strengthsJson
      )
      .run();
  } catch (error) {
    if (isMissingTableError(error, "esl_learner_profiles")) return;
    throw error;
  }
}

/** Store the learner's one-tap declared level and the resolved shown level (design §8). */
export async function setLearnerDeclaredLevel(
  db: Db,
  input: { userId: string; cefrDeclared: string; cefrEstimate: string }
): Promise<void> {
  try {
    await db
      .prepare(
        `INSERT INTO esl_learner_profiles (id, user_id, cefr_declared, cefr_estimate)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           cefr_declared = excluded.cefr_declared,
           cefr_estimate = COALESCE(esl_learner_profiles.cefr_estimate, excluded.cefr_estimate),
           updated_at = datetime('now')`
      )
      .bind(crypto.randomUUID(), input.userId, input.cefrDeclared, input.cefrEstimate)
      .run();
  } catch (error) {
    if (isMissingTableError(error, "esl_learner_profiles")) return;
    throw error;
  }
}
