import { describe, expect, it } from "vitest";
import {
  aggregateTagMastery,
  attributeDictationErrors,
  attributeReadingErrors,
  cefrOrdinal,
  estimateCefrFromDictation,
  resolveCefr,
  type TagObservation
} from "./learner-model";
import type { DiffOp } from "./dictation-diff";

describe("attributeDictationErrors", () => {
  it("counts exposure from the reference and misses from delete/substitute ops", () => {
    // "the cats walked" — article(the) + final_s(cats) + past_ed(walked).
    const result = attributeDictationErrors([
      { reference: "the cats walked", ops: [{ op: "delete", ref: "cats" }] as DiffOp[] }
    ]);
    expect(result.get("article")).toEqual({ exposure: 1, hits: 1 });
    // "cats" carries both final_s and... consonant? no. It is a single miss.
    expect(result.get("final_s")).toEqual({ exposure: 1, hits: 0 });
    expect(result.get("past_ed")).toEqual({ exposure: 1, hits: 1 });
  });

  it("treats a substitution as a miss and ignores inserts", () => {
    const result = attributeDictationErrors([
      {
        reference: "they walked home",
        ops: [
          { op: "substitute", ref: "walked", got: "walk" },
          { op: "insert", got: "quickly" }
        ] as DiffOp[]
      }
    ]);
    expect(result.get("past_ed")).toEqual({ exposure: 1, hits: 0 });
  });

  it("gives full marks on a flawless attempt", () => {
    const result = attributeDictationErrors([{ reference: "the dogs", ops: [] }]);
    expect(result.get("article")).toEqual({ exposure: 1, hits: 1 });
    expect(result.get("final_s")).toEqual({ exposure: 1, hits: 1 });
  });
});

describe("attributeReadingErrors", () => {
  const tags = [
    { tag: "th_sound", count: 4 },
    { tag: "question", count: 1 },
    { tag: "final_s", count: 3 } // a word-form tag reading must NOT touch
  ];

  it("only reports prosodic/phonetic tags and never word-form tags", () => {
    const result = attributeReadingErrors(tags, []);
    expect(result.has("th_sound")).toBe(true);
    expect(result.has("question")).toBe(true);
    expect(result.has("final_s")).toBe(false);
  });

  it("maps an intonation highlight to a question miss", () => {
    const result = attributeReadingErrors(tags, [{ kind: "intonation" }]);
    expect(result.get("question")).toEqual({ exposure: 1, hits: 0 });
  });

  it("maps a mispronunciation quote to the phonetic tags of its words", () => {
    const result = attributeReadingErrors(tags, [
      { kind: "mispronunciation", text_quote: "think" } // contains 'th'
    ]);
    expect(result.get("th_sound")).toEqual({ exposure: 4, hits: 3 });
  });
});

describe("aggregateTagMastery", () => {
  it("weights by exposure and yields mastery in 0..1", () => {
    const obs: TagObservation[] = [
      { tag: "final_s", exposure: 10, hits: 5, source: "deterministic" },
      { tag: "final_s", exposure: 2, hits: 2, source: "deterministic" }
    ];
    const out = aggregateTagMastery(obs);
    expect(out.final_s.mastery).toBeGreaterThan(0);
    expect(out.final_s.mastery).toBeLessThan(1);
    expect(out.final_s.exposure).toBe(12);
  });

  it("down-weights llm-sourced observations relative to deterministic ones", () => {
    // A perfect deterministic record and a terrible llm record. The deterministic one should
    // dominate, keeping mastery well above the midpoint.
    const out = aggregateTagMastery([
      { tag: "th_sound", exposure: 10, hits: 10, source: "deterministic" },
      { tag: "th_sound", exposure: 10, hits: 0, source: "llm" }
    ]);
    expect(out.th_sound.mastery).toBeGreaterThan(0.6);
  });
});

describe("estimateCefrFromDictation", () => {
  it("returns null with no usable attempts", () => {
    expect(estimateCefrFromDictation([]).level).toBeNull();
    expect(estimateCefrFromDictation([{ band: null, accuracy: 0.9 }]).level).toBeNull();
  });

  it("estimates around the band when accuracy is near target", () => {
    const est = estimateCefrFromDictation([
      { band: "B1", accuracy: 0.75 },
      { band: "B1", accuracy: 0.74 }
    ]);
    expect(est.level).toBe("B1");
  });

  it("grows confidence with more attempts and wider band spread", () => {
    const narrow = estimateCefrFromDictation([{ band: "B1", accuracy: 0.8 }]);
    const wide = estimateCefrFromDictation([
      { band: "A2", accuracy: 0.9 },
      { band: "B1", accuracy: 0.8 },
      { band: "B2", accuracy: 0.7 },
      { band: "C1", accuracy: 0.6 }
    ]);
    expect(wide.confidence).toBeGreaterThan(narrow.confidence);
  });
});

describe("resolveCefr", () => {
  it("uses the declared level until the measurement is confident", () => {
    expect(
      resolveCefr({ declared: "B1", measured: "B2", measuredConfidence: 0.2 })
    ).toEqual({ level: "B1", basis: "declared" });
  });

  it("lets a confident measurement override the declaration", () => {
    expect(
      resolveCefr({ declared: "B1", measured: "B2", measuredConfidence: 0.8 })
    ).toEqual({ level: "B2", basis: "measured" });
  });

  it("falls back to default when nothing is known", () => {
    expect(resolveCefr({ declared: null, measured: null, measuredConfidence: 0 })).toEqual({
      level: null,
      basis: "default"
    });
  });
});

describe("cefrOrdinal", () => {
  it("orders levels and rejects junk", () => {
    expect(cefrOrdinal("A1")).toBe(1);
    expect(cefrOrdinal("C2")).toBe(6);
    expect(cefrOrdinal("nonsense")).toBe(0);
    expect(cefrOrdinal(null)).toBe(0);
  });
});
