import type { Db } from "./types";

/** Home needs metadata, never passage bodies or audio payloads. */
export type HomePassage = {
  id: string; title: string; band: string | null; topic: string | null;
  sentence_count: number; has_sentence_audio: number;
};
const COLUMNS = "id, title, band, topic, sentence_count, has_sentence_audio";

/** Up to twenty published passages per requested band, at most three bands. */
export async function listHomeCandidates(db: Db, bands: string[]): Promise<HomePassage[]> {
  const bounded = [...new Set(bands)].slice(0, 3);
  if (!bounded.length) return [];
  const result = await db.prepare(`
    SELECT ${COLUMNS} FROM (
      SELECT ${COLUMNS}, ROW_NUMBER() OVER (PARTITION BY band ORDER BY created_at, id) AS position
      FROM passages WHERE user_id IS NULL AND deleted_at IS NULL AND status = 'published'
        AND band IN (${bounded.map(() => "?").join(",")})
    ) WHERE position <= 20 ORDER BY band, position
  `).bind(...bounded).all<HomePassage>();
  return result.results ?? [];
}

/** Separate publication lookup: forty recent dictations plus one older resumable attempt. */
export async function listHomeRecordPassages(db: Db, ids: string[]): Promise<HomePassage[]> {
  const bounded = [...new Set(ids)].slice(0, 41);
  if (!bounded.length) return [];
  const result = await db.prepare(`SELECT ${COLUMNS} FROM passages
    WHERE user_id IS NULL AND deleted_at IS NULL AND status = 'published'
      AND id IN (${bounded.map(() => "?").join(",")}) LIMIT 41
  `).bind(...bounded).all<HomePassage>();
  return result.results ?? [];
}
