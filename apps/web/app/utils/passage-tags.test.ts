import { describe, expect, it } from "vitest";
import {
  analyzePassage,
  splitSentences,
  tagDensity,
  PASSAGE_TAGS,
  type PassageTagName
} from "./passage-tags";

/**
 * The tagger's output drives material matching, and a wrong tag is invisible: nobody
 * reports "this passage was labelled as having more linking than it does". So these
 * tests pin the derivations themselves, and especially the exclusion lists — the places
 * where a naive regex would quietly over-count.
 */

const countOf = (text: string, tag: PassageTagName): number =>
  analyzePassage(text).tags.find((entry) => entry.tag === tag)?.count ?? 0;

describe("splitSentences", () => {
  it("splits on sentence-final punctuation", () => {
    expect(splitSentences("One. Two! Three?")).toEqual(["One.", "Two!", "Three?"]);
  });

  it("ignores trailing whitespace and empty pieces", () => {
    expect(splitSentences("  Only one.   ")).toEqual(["Only one."]);
    expect(splitSentences("")).toEqual([]);
  });
});

describe("metrics", () => {
  it("counts words and sentences and derives the mean", () => {
    // "I walk home" (3) + "She reads a book today" (5)
    const { metrics } = analyzePassage("I walk home. She reads a book today.");
    expect(metrics.wordCount).toBe(8);
    expect(metrics.sentenceCount).toBe(2);
    expect(metrics.meanSentenceWords).toBeCloseTo(4);
  });

  it("returns zeros rather than NaN for empty text", () => {
    const { metrics } = analyzePassage("");
    expect(metrics).toEqual({
      wordCount: 0,
      sentenceCount: 0,
      meanSentenceWords: 0,
      rareWordRatio: 0
    });
  });

  it("rates unusual vocabulary as rarer than everyday vocabulary", () => {
    const easy = analyzePassage("I go to work every day and see my friends at home.");
    const hard = analyzePassage(
      "The unprecedented bureaucratic entanglement precipitated widespread disillusionment."
    );
    expect(hard.metrics.rareWordRatio).toBeGreaterThan(easy.metrics.rareWordRatio);
  });
});

describe("contraction", () => {
  it("counts the common contraction endings", () => {
    expect(countOf("I don't think we'll go, and she's here, they're late.", "contraction")).toBe(4);
  });

  it("does not count a plain possessive-free word", () => {
    expect(countOf("The dog ran home.", "contraction")).toBe(0);
  });
});

describe("final_s", () => {
  it("counts plural and third-person endings alike", () => {
    // "walks", "books" -> 2
    expect(countOf("She walks past the books.", "final_s")).toBe(2);
  });

  it("excludes words that merely end in s", () => {
    // is / was / has / this / his / us / across / always are all exceptions.
    expect(countOf("This is his bus and it was always across from us.", "final_s")).toBe(0);
  });

  it("excludes double-s endings", () => {
    expect(countOf("The glass class was a mess.", "final_s")).toBe(0);
  });
});

describe("past_ed", () => {
  it("counts past-tense endings", () => {
    expect(countOf("She walked and talked and finished.", "past_ed")).toBe(3);
  });

  it("excludes words that merely end in ed", () => {
    expect(countOf("The red bed was indeed what we need at speed.", "past_ed")).toBe(0);
  });
});

describe("homophone", () => {
  it("counts words a listener can confuse", () => {
    // their, there, two, too
    expect(countOf("Their car is there, and two of them went too.", "homophone")).toBeGreaterThanOrEqual(4);
  });

  it("counts nothing in text without homophones", () => {
    expect(countOf("Elephants sleep quietly.", "homophone")).toBe(0);
  });
});

describe("th_sound and consonant_cluster", () => {
  it("counts words containing th", () => {
    expect(countOf("The three brothers thought about this.", "th_sound")).toBe(5);
  });

  it("counts words with a run of three consonants", () => {
    // strengths, twelfths
    const count = countOf("His strengths were twelfths of the whole.", "consonant_cluster");
    expect(count).toBeGreaterThanOrEqual(2);
  });

  it("does not flag ordinary alternating words", () => {
    expect(countOf("I like a banana.", "consonant_cluster")).toBe(0);
  });
});

describe("linking", () => {
  it("counts consonant-to-vowel word boundaries", () => {
    // "pick up" and "up early" both link.
    expect(countOf("Pick up early.", "linking")).toBe(2);
  });

  it("does not link across a comma, which interrupts connected speech", () => {
    expect(countOf("Stop, and go.", "linking")).toBe(0);
    // Same words without the comma do link ("stop and").
    expect(countOf("Stop and go.", "linking")).toBe(1);
  });
});

describe("sentence-level tags", () => {
  it("counts sentences past the long-sentence threshold", () => {
    const long =
      "Although the weather had been unusually cold for several weeks, we decided to walk all the way to the old harbour.";
    expect(countOf(long, "long_sentence")).toBe(1);
    expect(countOf("It was cold.", "long_sentence")).toBe(0);
  });

  it("counts questions", () => {
    expect(countOf("Where did you go? I stayed home. Are you sure?", "question")).toBe(2);
  });
});

describe("output shape", () => {
  it("omits zero-count tags and sorts by count", () => {
    const { tags } = analyzePassage("She walks and talks. Where are the books?");
    expect(tags.every((entry) => entry.count > 0)).toBe(true);
    for (let i = 1; i < tags.length; i += 1) {
      expect(tags[i - 1]!.count).toBeGreaterThanOrEqual(tags[i]!.count);
    }
  });

  it("only ever emits tags from the declared vocabulary", () => {
    const { tags } = analyzePassage(
      "Their three brothers didn't finish the twelfths, and she walked across two hours."
    );
    for (const entry of tags) {
      expect(PASSAGE_TAGS).toContain(entry.tag);
    }
  });

  it("is deterministic — the same text always yields the same tags", () => {
    const text = "She walks to the shop and buys three books. Isn't that far?";
    expect(analyzePassage(text)).toEqual(analyzePassage(text));
  });
});

describe("tagDensity", () => {
  it("normalizes by passage length so long passages are not favoured", () => {
    const short = analyzePassage("She walks.");
    const padded = analyzePassage(`She walks. ${"I go home. ".repeat(20)}`);
    expect(tagDensity(short, "final_s")).toBeGreaterThan(tagDensity(padded, "final_s"));
  });

  it("returns 0 for an absent tag and for empty text", () => {
    expect(tagDensity(analyzePassage("I go home."), "question")).toBe(0);
    expect(tagDensity(analyzePassage(""), "final_s")).toBe(0);
  });
});
