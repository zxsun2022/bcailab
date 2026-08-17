/// <reference types="@cloudflare/workers-types" />

import type { Db, FeatureUsage, TranslateUsage } from "./types";

/* ---------- translate usage quotas ---------- */

export async function getTranslateUsage(
  db: Db,
  subjects: string[],
  day: string
): Promise<TranslateUsage[]> {
  if (subjects.length === 0) return [];
  const placeholders = subjects.map(() => "?").join(", ");
  const result = await db
    .prepare(
      `SELECT subject, day, requests, chars FROM translate_usage WHERE day = ? AND subject IN (${placeholders})`
    )
    .bind(day, ...subjects)
    .all();
  return (result.results ?? []).map((row) => ({
    subject: String(row.subject),
    day: String(row.day),
    requests: Number(row.requests ?? 0),
    chars: Number(row.chars ?? 0)
  }));
}

export async function incrementTranslateUsage(
  db: Db,
  subjects: string[],
  day: string,
  chars: number
): Promise<void> {
  if (subjects.length === 0) return;
  const statement = db.prepare(
    `INSERT INTO translate_usage (subject, day, requests, chars) VALUES (?, ?, 1, ?)
     ON CONFLICT(subject, day) DO UPDATE SET
       requests = requests + 1,
       chars = chars + excluded.chars,
       updated_at = datetime('now')`
  );
  await db.batch(subjects.map((subject) => statement.bind(subject, day, chars)));
}

/* ---------- feature usage quotas (generic, per-feature) ---------- */

export async function getFeatureUsage(
  db: Db,
  feature: string,
  subjects: string[],
  day: string
): Promise<FeatureUsage[]> {
  if (subjects.length === 0) return [];
  const placeholders = subjects.map(() => "?").join(", ");
  const result = await db
    .prepare(
      `SELECT feature, subject, day, requests, units FROM feature_usage WHERE feature = ? AND day = ? AND subject IN (${placeholders})`
    )
    .bind(feature, day, ...subjects)
    .all();
  return (result.results ?? []).map((row) => ({
    feature: String(row.feature),
    subject: String(row.subject),
    day: String(row.day),
    requests: Number(row.requests ?? 0),
    units: Number(row.units ?? 0)
  }));
}

export async function incrementFeatureUsage(
  db: Db,
  feature: string,
  subjects: string[],
  day: string,
  units: number
): Promise<void> {
  if (subjects.length === 0) return;
  const statement = db.prepare(
    `INSERT INTO feature_usage (feature, subject, day, requests, units) VALUES (?, ?, ?, 1, ?)
     ON CONFLICT(feature, subject, day) DO UPDATE SET
       requests = requests + 1,
       units = units + excluded.units,
       updated_at = datetime('now')`
  );
  await db.batch(subjects.map((subject) => statement.bind(feature, subject, day, units)));
}
