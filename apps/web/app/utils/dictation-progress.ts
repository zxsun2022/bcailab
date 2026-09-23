/**
 * Stored dictation progress: the `sentence_results` of an in-progress attempt.
 *
 * The server merges each checked sentence into what it already stored, rather than into what the
 * page happens to remember. A resumed page starts with no checked sentences, so a client-supplied
 * list would silently drop every sentence checked before the resume — and with it the answers the
 * summary is scored from.
 */
import { scoreSentence, type DiffOp } from "./dictation-diff";

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

/** A checked sentence as the page reviews it: the full diff and the reference it was scored against. */
export type ReviewableResult = {
  accuracy: number;
  ops: DiffOp[];
  reference: string;
  /** Listens beyond the first, as stored when the sentence was checked. */
  replays: number;
};

/**
 * Rebuilds the review state of a resumed attempt's checked sentences.
 *
 * Storage keeps only non-matching ops, so the full diff is re-scored here from the stored answer
 * and the reference — deterministic, so it reproduces what the learner saw at check time. Only
 * sentences that were checked are returned: an unchecked sentence's reference never leaves the
 * server. A stored entry for a sentence the passage no longer has is ignored.
 */
export const reviewableResults = (
  sentences: Array<{ idx: number; text: string }>,
  stored: SentenceResult[]
): Record<number, ReviewableResult> => {
  const textByIdx = new Map(sentences.map((sentence) => [sentence.idx, sentence.text]));
  const out: Record<number, ReviewableResult> = {};
  for (const entry of stored) {
    const reference = textByIdx.get(entry.idx);
    if (reference === undefined) continue;
    const diff = scoreSentence(reference, entry.userText);
    out[entry.idx] = { accuracy: diff.accuracy, ops: diff.ops, reference, replays: entry.replays };
  }
  return out;
};
