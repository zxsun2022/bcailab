import { describe, expect, it } from "vitest";
import { mergeSentenceResult, parseSentenceResults, reviewableResults } from "./dictation-progress";

const entry = (idx: number, userText = `answer ${idx}`) => ({
  idx,
  userText,
  accuracy: 0.9,
  replays: 0,
  ops: [{ op: "match" as const, ref: "a", got: "a" }]
});

describe("parseSentenceResults", () => {
  it("returns stored results in sentence order", () => {
    const stored = JSON.stringify([entry(2), entry(0), entry(1)]);
    expect(parseSentenceResults(stored).map((e) => e.idx)).toEqual([0, 1, 2]);
  });

  it("treats missing, malformed and non-array storage as no progress", () => {
    expect(parseSentenceResults(null)).toEqual([]);
    expect(parseSentenceResults("")).toEqual([]);
    expect(parseSentenceResults("{oops")).toEqual([]);
    expect(parseSentenceResults('{"idx":0}')).toEqual([]);
  });

  it("skips entries that are not usable results and keeps the rest", () => {
    const stored = JSON.stringify([entry(0), { idx: "1", userText: "x" }, null, { idx: 2 }, entry(3)]);
    expect(parseSentenceResults(stored).map((e) => e.idx)).toEqual([0, 3]);
  });

  it("defaults a missing replay count rather than storing NaN", () => {
    const stored = JSON.stringify([{ ...entry(0), replays: undefined }]);
    expect(parseSentenceResults(stored)[0]!.replays).toBe(0);
  });

  it("keeps the last entry when storage repeats a sentence", () => {
    const stored = JSON.stringify([entry(0, "first"), entry(0, "second")]);
    const parsed = parseSentenceResults(stored);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.userText).toBe("second");
  });
});

describe("mergeSentenceResult", () => {
  it("keeps sentences checked before a resume", () => {
    const stored = JSON.stringify([entry(0), entry(1), entry(2)]);
    const merged = mergeSentenceResult(stored, entry(3));
    expect(merged.map((e) => e.idx)).toEqual([0, 1, 2, 3]);
  });

  it("replaces a re-checked sentence in place", () => {
    const stored = JSON.stringify([entry(0), entry(1, "old")]);
    const merged = mergeSentenceResult(stored, entry(1, "new"));
    expect(merged).toHaveLength(2);
    expect(merged[1]!.userText).toBe("new");
  });

  it("starts a fresh attempt from no storage", () => {
    expect(mergeSentenceResult(null, entry(0)).map((e) => e.idx)).toEqual([0]);
  });

  it("does not lose earlier work when storage is unreadable", () => {
    // Nothing can be recovered, but the new sentence is still stored.
    expect(mergeSentenceResult("not json", entry(4)).map((e) => e.idx)).toEqual([4]);
  });
});

describe("reviewableResults — review after a resume", () => {
  const sentences = [
    { idx: 0, text: "The cat sat on the mat." },
    { idx: 1, text: "It was a sunny day." },
    { idx: 2, text: "Nobody came home." }
  ];

  it("returns the full diff and reference for checked sentences only", () => {
    const out = reviewableResults(sentences, [
      { idx: 0, userText: "The cat sat on a mat", accuracy: 0.8, replays: 2, ops: [] }
    ]);
    expect(Object.keys(out)).toEqual(["0"]);
    expect(out[0]!.reference).toBe("The cat sat on the mat.");
    expect(out[0]!.replays).toBe(2);
    // Storage drops matches; the rebuilt diff has them back.
    expect(out[0]!.ops.some((op) => op.op === "match")).toBe(true);
    expect(out[0]!.ops.some((op) => op.op === "substitute")).toBe(true);
  });

  it("never exposes an unchecked sentence's reference", () => {
    const out = reviewableResults(sentences, [
      { idx: 0, userText: "The cat sat on the mat", accuracy: 1, replays: 0, ops: [] }
    ]);
    expect(JSON.stringify(out)).not.toContain("sunny");
    expect(JSON.stringify(out)).not.toContain("Nobody");
  });

  it("ignores a stored entry for a sentence the passage no longer has", () => {
    const out = reviewableResults(sentences, [
      { idx: 9, userText: "stale", accuracy: 1, replays: 0, ops: [] }
    ]);
    expect(out).toEqual({});
  });
});
