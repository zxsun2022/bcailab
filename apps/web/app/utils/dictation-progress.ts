/**
 * Stored dictation progress: the `sentence_results` of an in-progress attempt.
 *
 * The server merges each checked sentence into what it already stored, rather than into what the
 * page happens to remember. A resumed page starts with no checked sentences, so a client-supplied
 * list would silently drop every sentence checked before the resume — and with it the answers the
 * summary is scored from.
 */
import type { DiffOp } from "./dictation-diff";

export type SentenceResult = {
  idx: number;
  userText: string;
  accuracy: number;
  replays: number;
  ops: DiffOp[];
};

const isSentenceResult = (value: unknown): value is SentenceResult => {
  if (value === null || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return (
    Number.isInteger(entry.idx) &&
    (entry.idx as number) >= 0 &&
    typeof entry.userText === "string" &&
    typeof entry.accuracy === "number" &&
    Number.isFinite(entry.accuracy) &&
    Array.isArray(entry.ops)
  );
};

/** Tolerant: unparseable or malformed storage yields no prior results instead of failing practice. */
export const parseSentenceResults = (stored: string | null | undefined): SentenceResult[] => {
  if (!stored) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(stored);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const byIdx = new Map<number, SentenceResult>();
  for (const value of parsed) {
    if (!isSentenceResult(value)) continue;
    byIdx.set(value.idx, {
      idx: value.idx,
      userText: value.userText,
      accuracy: value.accuracy,
      replays: Number.isFinite(value.replays) ? value.replays : 0,
      ops: value.ops
    });
  }
  return [...byIdx.values()].sort((a, b) => a.idx - b.idx);
};

/** Re-checking a sentence replaces that entry; every other stored sentence is kept. */
export const mergeSentenceResult = (
  stored: string | null | undefined,
  entry: SentenceResult
): SentenceResult[] =>
  [...parseSentenceResults(stored).filter((prior) => prior.idx !== entry.idx), entry].sort(
    (a, b) => a.idx - b.idx
  );
