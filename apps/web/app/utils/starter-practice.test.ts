import { describe, expect, it } from "vitest";
import {
  selectStarterPractice,
  type CandidatePassage,
  type PracticeRecord,
  type StarterPracticeInput
} from "./starter-practice";

const passage = (
  id: string,
  band: string,
  topic = "daily",
  hasSentenceAudio = true
): CandidatePassage => ({
  id,
  title: `Passage ${id}`,
  band,
  topic,
  sentenceCount: 10,
  hasSentenceAudio
});

const done = (passageId: string, accuracy = 0.8): PracticeRecord => ({
  passageId,
  mode: "dictation",
  status: "completed",
  accuracy,
  sentencesDone: 10,
  createdAt: "2026-07-01T00:00:00Z"
});

const base = (over: Partial<StarterPracticeInput> = {}): StarterPracticeInput => ({
  level: "B1",
  candidates: [passage("b1a", "B1"), passage("b1b", "B1")],
  records: [],
  draft: null,
  attemptCount: 0,
  ...over
});

describe("selectStarterPractice — recommendation", () => {
  it("returns a list shape even with a single recommendation (the matching seam)", () => {
    const out = selectStarterPractice(base());
    expect(Array.isArray(out.recommendations)).toBe(true);
    expect(out.recommendations).toHaveLength(1);
  });

  it("prefers unpractised material at the learner's level", () => {
    const out = selectStarterPractice(base({ records: [done("b1a")] }));
    expect(out.recommendations[0]).toMatchObject({
      passageId: "b1b",
      rationale: "level_fit",
      mode: "dictation"
    });
  });

  it("never claims personalisation in the learner-facing reason", () => {
    const out = selectStarterPractice(base());
    expect(out.recommendations[0]!.reason.toLowerCase()).not.toMatch(/personalis|personaliz|weakness/);
  });

  it("falls back to the same passage in the other mode once the band is dictated", () => {
    const out = selectStarterPractice(
      base({ records: [done("b1a"), done("b1b")] })
    );
    expect(out.recommendations[0]).toMatchObject({ rationale: "cross_mode", mode: "reading" });
  });

  it("falls back to an adjacent band when the level has nothing left in either mode", () => {
    const out = selectStarterPractice(
      base({
        candidates: [passage("b1a", "B1"), passage("b2a", "B2")],
        records: [
          done("b1a"),
          { ...done("b1a"), mode: "reading" }
        ]
      })
    );
    expect(out.recommendations[0]).toMatchObject({ band: "B2", rationale: "adjacent_band" });
  });

  it("falls back to revisiting the weakest score when nothing is unpractised", () => {
    const out = selectStarterPractice(
      base({
        candidates: [passage("b1a", "B1"), passage("b1b", "B1")],
        records: [
          done("b1a", 0.9),
          { ...done("b1a", 0.9), mode: "reading" },
          done("b1b", 0.4),
          { ...done("b1b", 0.4), mode: "reading" }
        ]
      })
    );
    expect(out.recommendations[0]).toMatchObject({ passageId: "b1b", rationale: "revisit" });
  });

  it("returns no recommendation rather than inventing one when the library is empty", () => {
    const out = selectStarterPractice(base({ candidates: [] }));
    expect(out.recommendations).toEqual([]);
    expect(out.alternatives).toEqual([]);
  });

  it("only offers dictation for passages that actually have sentence audio", () => {
    const out = selectStarterPractice(
      base({ candidates: [passage("noaudio", "B1", "daily", false)] })
    );
    // No dictatable material, nothing dictated to read back, no adjacent band → nothing.
    expect(out.recommendations).toEqual([]);
  });
});

describe("selectStarterPractice — null level", () => {
  it("still recommends, using B1 internally without surfacing it as the learner's level", () => {
    const out = selectStarterPractice(base({ level: null }));
    expect(out.recommendations[0]!.passageId).toBe("b1a");
    // The reason must not assert a level the system has not established.
    expect(out.recommendations[0]!.reason).not.toMatch(/B1/);
  });
});

describe("selectStarterPractice — adjacent-band exploration", () => {
  const singleBandHistory = [done("b1a"), done("b1b")];

  it("explores an adjacent band on the cadence while coverage is one band", () => {
    const out = selectStarterPractice(
      base({
        candidates: [passage("b1a", "B1"), passage("b1b", "B1"), passage("b2a", "B2")],
        records: singleBandHistory,
        attemptCount: 4
      })
    );
    expect(out.recommendations[0]).toMatchObject({ band: "B2", rationale: "adjacent_band" });
  });

  it("does not explore off-cadence", () => {
    const out = selectStarterPractice(
      base({
        candidates: [passage("b1a", "B1"), passage("b1b", "B1"), passage("b2a", "B2")],
        records: [done("b1a")],
        attemptCount: 3
      })
    );
    expect(out.recommendations[0]).toMatchObject({ passageId: "b1b", rationale: "level_fit" });
  });

  it("stops exploring once the learner has covered more than one band", () => {
    const out = selectStarterPractice(
      base({
        candidates: [passage("b1a", "B1"), passage("b1b", "B1"), passage("b2a", "B2")],
        records: [done("b1a"), done("b2a")],
        attemptCount: 4
      })
    );
    expect(out.recommendations[0]).toMatchObject({ passageId: "b1b", rationale: "level_fit" });
  });

  it("is deterministic — identical input yields an identical pick", () => {
    const input = base({
      candidates: [passage("b1a", "B1"), passage("b1b", "B1"), passage("b2a", "B2")],
      records: singleBandHistory,
      attemptCount: 4
    });
    expect(selectStarterPractice(input)).toEqual(selectStarterPractice(input));
  });
});

describe("selectStarterPractice — directional alternatives", () => {
  it("offers easier / harder / other-topic when such material exists", () => {
    const out = selectStarterPractice(
      base({
        candidates: [
          passage("b1a", "B1", "daily"),
          passage("b1other", "B1", "travel"),
          passage("a2a", "A2"),
          passage("b2a", "B2")
        ]
      })
    );
    expect(out.alternatives.map((a) => a.direction).sort()).toEqual([
      "easier",
      "harder",
      "other_topic"
    ]);
  });

  it("omits a direction rather than offering a dead end", () => {
    const out = selectStarterPractice(base({ level: "A2", candidates: [passage("a2a", "A2")] }));
    expect(out.alternatives.map((a) => a.direction)).not.toContain("easier");
  });

  it("never offers the primary recommendation as its own alternative", () => {
    const out = selectStarterPractice(
      base({ candidates: [passage("b1a", "B1", "daily"), passage("b1b", "B1", "travel")] })
    );
    const primary = out.recommendations[0]!.passageId;
    expect(out.alternatives.some((a) => a.passageId === primary)).toBe(false);
  });
});

describe("selectStarterPractice — continue", () => {
  const inProgress: PracticeRecord = {
    passageId: "b1a",
    mode: "dictation",
    status: "in_progress",
    accuracy: 0.5,
    sentencesDone: 4,
    createdAt: "2026-07-05T00:00:00Z"
  };

  it("surfaces a resumable dictation with its progress", () => {
    const out = selectStarterPractice(base({ records: [inProgress] }));
    expect(out.continueAction).toMatchObject({
      kind: "dictation",
      passageId: "b1a",
      done: 4,
      total: 10
    });
  });

  it("drops a resumable attempt whose passage is no longer published", () => {
    const out = selectStarterPractice(
      base({ candidates: [passage("b1b", "B1")], records: [inProgress] })
    );
    expect(out.continueAction).toBeNull();
  });

  it("prefers whichever of dictation or writing was touched most recently", () => {
    const withOlderDraft = selectStarterPractice(
      base({
        records: [inProgress],
        draft: { articleId: "w1", title: "Essay", updatedAt: "2026-07-01T00:00:00Z" }
      })
    );
    expect(withOlderDraft.continueAction).toMatchObject({ kind: "dictation" });

    const withNewerDraft = selectStarterPractice(
      base({
        records: [inProgress],
        draft: { articleId: "w1", title: "Essay", updatedAt: "2026-07-09T00:00:00Z" }
      })
    );
    expect(withNewerDraft.continueAction).toMatchObject({ kind: "writing", articleId: "w1" });
  });

  it("names an untitled draft rather than rendering an empty title", () => {
    const out = selectStarterPractice(
      base({ draft: { articleId: "w1", title: "  ", updatedAt: "2026-07-09T00:00:00Z" } })
    );
    expect(out.continueAction).toMatchObject({ kind: "writing", title: "Untitled draft" });
  });

  it("returns null when there is nothing to resume", () => {
    expect(selectStarterPractice(base()).continueAction).toBeNull();
  });
});
