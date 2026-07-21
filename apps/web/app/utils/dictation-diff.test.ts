import { describe, expect, it } from "vitest";
import {
  normalizeText,
  tokenize,
  scoreSentence,
  scorePassage,
  storableOps,
  type DiffOp
} from "./dictation-diff";

/**
 * These tests guard data the learner never sees us compute.
 *
 * A wrong score is visible and someone would report it. A subtly wrong *op list* is
 * not — it is written to `dictation_attempts.sentence_results` and is the observation
 * format Dictation v2 aggregates. A bug here corrupts the calibration input silently,
 * and only surfaces months later as bad difficulty estimates. So the op-level
 * assertions matter as much as the accuracy ones.
 */

/** Ops in reading order, matches collapsed to their token, for readable assertions. */
const opSummary = (ops: DiffOp[]): string[] =>
  ops.map((op) => {
    if (op.op === "match") return `=${op.got}`;
    if (op.op === "substitute") return `~${op.ref}>${op.got}`;
    if (op.op === "delete") return `-${op.ref}`;
    return `+${op.got}`;
  });

describe("normalizeText", () => {
  it("lowercases and collapses whitespace", () => {
    expect(normalizeText("  The   Weather\nis  NICE ")).toBe("the weather is nice");
  });

  it("drops sentence punctuation but keeps intra-word apostrophes and hyphens", () => {
    expect(normalizeText("Don't worry — it's twenty-five, “really”!")).toBe(
      "don't worry it's twenty-five really"
    );
  });

  it("normalizes curly apostrophes and unicode dashes to ASCII", () => {
    expect(normalizeText("don’t twenty‑five")).toBe("don't twenty-five");
  });
});

describe("tokenize", () => {
  it("strips edge apostrophes and hyphens left by quoting or dashes", () => {
    expect(tokenize("'hello' well-- --world")).toEqual(["hello", "well", "world"]);
  });

  it("returns an empty array for punctuation-only input", () => {
    expect(tokenize("!!! ... ---")).toEqual([]);
  });
});

describe("scoreSentence — alignment ops", () => {
  it("scores a perfect answer as 1 with only matches", () => {
    const result = scoreSentence("The weather is nice today.", "the weather is nice today");
    expect(result.accuracy).toBe(1);
    expect(storableOps(result.ops)).toEqual([]);
  });

  it("reports substitutions with both the reference and the typed word", () => {
    const result = scoreSentence("I like their house.", "I like there house");
    expect(storableOps(result.ops)).toEqual([{ op: "substitute", ref: "their", got: "there" }]);
    expect(result.accuracy).toBeCloseTo(3 / 4);
  });

  it("reports a missed word as a delete carrying the reference token", () => {
    const result = scoreSentence("She walked to the store.", "She walked the store");
    expect(storableOps(result.ops)).toEqual([{ op: "delete", ref: "to" }]);
    expect(result.accuracy).toBeCloseTo(4 / 5);
  });

  it("reports an extra word as an insert carrying the typed token", () => {
    const result = scoreSentence("He is here.", "He is right here");
    expect(storableOps(result.ops)).toEqual([{ op: "insert", got: "right" }]);
  });

  it("keeps ops in reading order so the client can render aligned tokens", () => {
    const result = scoreSentence("a b c d", "a x c d e");
    expect(opSummary(result.ops)).toEqual(["=a", "~b>x", "=c", "=d", "+e"]);
  });

  it("counts every reference token as missed when nothing is typed", () => {
    const result = scoreSentence("Hello world.", "");
    expect(result.accuracy).toBe(0);
    expect(storableOps(result.ops)).toEqual([
      { op: "delete", ref: "hello" },
      { op: "delete", ref: "world" }
    ]);
  });

  it("treats an empty reference as fully correct rather than dividing by zero", () => {
    expect(scoreSentence("", "").accuracy).toBe(1);
    expect(Number.isNaN(scoreSentence("...", "anything").accuracy)).toBe(false);
  });
});

describe("scoreSentence — punctuation and case are free", () => {
  it("ignores capitalization and terminal punctuation", () => {
    expect(scoreSentence("It's a nice day!", "its a nice day").accuracy).toBeLessThan(1);
    expect(scoreSentence("It's a nice day!", "IT'S A NICE DAY").accuracy).toBe(1);
  });

  it("does not penalize a missing comma", () => {
    expect(scoreSentence("First, she washes the vegetables.", "First she washes the vegetables").accuracy).toBe(1);
  });
});

describe("scoreSentence — British/American spelling equivalence", () => {
  it("accepts American spellings against a British reference", () => {
    const result = scoreSentence(
      "I realised the colour of my favourite theatre was grey.",
      "I realized the color of my favorite theater was gray"
    );
    expect(result.accuracy).toBe(1);
    expect(storableOps(result.ops)).toEqual([]);
  });

  it("accepts British spellings against an American reference", () => {
    expect(
      scoreSentence("The traveler organized his labeled jewelry.", "The traveller organised his labelled jewellery")
        .accuracy
    ).toBe(1);
  });

  it("accepts either past-tense form for learnt/learned-style verbs", () => {
    expect(scoreSentence("She learnt to practise daily.", "she learned to practice daily").accuracy).toBe(1);
  });

  it("still marks a genuine mishearing wrong when it looks like a suffix case", () => {
    // "four" vs "for" is a real listening error, not a spelling convention.
    const result = scoreSentence("I waited four hours.", "I waited for hours");
    expect(storableOps(result.ops)).toEqual([{ op: "substitute", ref: "four", got: "for" }]);
  });

  it("does not treat short -our stems as British spellings", () => {
    // "hour"/"tour"/"pour" must not canonicalize to "hor"/"tor"/"por".
    const result = scoreSentence("an hour", "an our");
    expect(storableOps(result.ops)).toEqual([{ op: "substitute", ref: "hour", got: "our" }]);
  });
});

describe("scoreSentence — flooding guard", () => {
  const reference = "Hello world.";

  it("charges nothing for extra words under 2x the reference length", () => {
    expect(scoreSentence(reference, "hello world one two").accuracy).toBe(1);
  });

  it("cancels one match per overflow token past the 2x limit", () => {
    // 5 typed vs 2 reference: overflow 1, matches 2 -> (2-1)/2
    expect(scoreSentence(reference, "hello world one two three").accuracy).toBeCloseTo(0.5);
  });

  it("floors a pasted wall of text at zero rather than going negative", () => {
    const flood = `hello world ${"filler ".repeat(50)}`;
    const result = scoreSentence(reference, flood);
    expect(result.accuracy).toBe(0);
    expect(result.accuracy).toBeGreaterThanOrEqual(0);
  });

  it("leaves a normal answer with a couple of hedge words untouched", () => {
    const result = scoreSentence("She walked to the store.", "she um walked to the store I think");
    expect(result.accuracy).toBe(1);
  });
});

describe("scorePassage", () => {
  it("weights sentences by reference length, not sentence count", () => {
    const result = scorePassage([
      { reference: "One two three.", userText: "one two three" },
      { reference: "Four five six seven eight nine.", userText: "" }
    ]);
    // 3 of 9 reference tokens correct — a naive per-sentence mean would say 0.5.
    expect(result.accuracy).toBeCloseTo(3 / 9);
  });

  it("carries the per-sentence flooding penalty into the passage score", () => {
    const flooded = scorePassage([{ reference: "a b", userText: "a b c d e f" }]);
    expect(flooded.accuracy).toBe(0);
  });

  it("returns one result per input sentence, including unanswered ones", () => {
    const result = scorePassage([
      { reference: "One two.", userText: "one two" },
      { reference: "Three four.", userText: "" }
    ]);
    expect(result.sentences).toHaveLength(2);
    expect(result.sentences[1]!.accuracy).toBe(0);
  });

  it("returns 0 rather than NaN for an empty passage", () => {
    expect(scorePassage([]).accuracy).toBe(0);
  });
});

describe("storableOps", () => {
  it("drops matches, since they are recoverable from the reference text", () => {
    const { ops } = scoreSentence("a b c", "a x c");
    expect(ops).toHaveLength(3);
    expect(storableOps(ops)).toEqual([{ op: "substitute", ref: "b", got: "x" }]);
  });

  it("keeps the stored shape minimal — no positions or interpretations", () => {
    const { ops } = scoreSentence("their house", "there house");
    // This shape is the v2 aggregation contract; adding keys means migrating rows.
    expect(Object.keys(storableOps(ops)[0]!).sort()).toEqual(["got", "op", "ref"]);
  });
});
