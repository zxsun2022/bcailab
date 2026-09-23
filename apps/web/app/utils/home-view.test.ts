import { describe, expect, it } from "vitest";
import { homeLayout, recentWithoutContinue, type HomeLayout } from "./home-view";
import type { AlternativeAction, ContinueAction, RecommendedAction } from "./starter-practice";

const dictationContinue: ContinueAction = {
  kind: "dictation",
  passageId: "p1",
  title: "A Normal Day",
  band: "A2",
  topic: "daily",
  done: 4,
  total: 11,
  href: "/dictation/p1"
};

const writingContinue: ContinueAction = {
  kind: "writing",
  articleId: "w1",
  title: "Ask about a lost item",
  untitled: false,
  updatedAt: "2026-09-20T00:00:00Z",
  href: "/writing/w1"
};

const recommendation: RecommendedAction = {
  mode: "dictation",
  passageId: "p2",
  title: "A Call to Family",
  band: "A2",
  topic: "family",
  sentenceCount: 11,
  rationale: "level_fit",
  reason: "Fits your current level.",
  reasonKey: "practice.reason.levelFit",
  href: "/dictation/p2"
};

const harder: AlternativeAction = {
  direction: "harder",
  label: "Harder",
  passageId: "p3",
  mode: "dictation",
  href: "/dictation/p3"
};

const primaries = (layout: HomeLayout) =>
  layout.actions.filter((action) => action.emphasis === "primary");

describe("homeLayout — one protagonist per state", () => {
  const cases = [
    { name: "cold", input: { isCold: true, continueAction: null, recommendation: undefined, alternatives: [] } },
    { name: "continue + recommendation", input: { isCold: false, continueAction: dictationContinue, recommendation, alternatives: [harder] } },
    { name: "continue only", input: { isCold: false, continueAction: writingContinue, recommendation: undefined, alternatives: [] } },
    { name: "recommendation only", input: { isCold: false, continueAction: null, recommendation, alternatives: [harder] } },
    { name: "neither", input: { isCold: false, continueAction: null, recommendation: undefined, alternatives: [] } }
  ];

  for (const { name, input } of cases) {
    it(`has exactly one primary action: ${name}`, () => {
      expect(primaries(homeLayout(input))).toHaveLength(1);
    });
  }

  it("makes Continue the hero and turns the recommendation into a row link", () => {
    const layout = homeLayout({ isCold: false, continueAction: dictationContinue, recommendation, alternatives: [harder] });
    expect(layout.state).toBe("continue");
    expect(layout.strip).toBe(true);
    expect(primaries(layout)[0]!.id).toBe("continue");
    expect(layout.actions).toContainEqual({ id: "recommendation", emphasis: "link" });
    expect(layout.actions).toContainEqual({ id: "alternatives", emphasis: "link" });
  });

  it("makes the recommendation the hero when there is nothing to continue", () => {
    const layout = homeLayout({ isCold: false, continueAction: null, recommendation, alternatives: [] });
    expect(layout.state).toBe("recommend");
    expect(layout.strip).toBe(false);
    expect(primaries(layout)[0]!.id).toBe("recommendation");
    expect(layout.actions.some((action) => action.id === "alternatives")).toBe(false);
  });

  it("keeps cold start ahead of everything else", () => {
    const layout = homeLayout({ isCold: true, continueAction: dictationContinue, recommendation, alternatives: [] });
    expect(layout.state).toBe("cold");
  });
});

describe("recentWithoutContinue", () => {
  const rows = ["dictation:p1", "reading:p9", "dictation:p5", "reading:p7"].map((id) => ({ id }));

  it("drops the passage Continue already shows and refills to the limit", () => {
    expect(recentWithoutContinue(rows, dictationContinue, 3).map((row) => row.id)).toEqual([
      "reading:p9",
      "dictation:p5",
      "reading:p7"
    ]);
  });

  it("keeps a reading row for the same passage — only the dictation is being continued", () => {
    const withReading = [{ id: "reading:p1" }, ...rows];
    expect(recentWithoutContinue(withReading, dictationContinue, 3)[0]!.id).toBe("reading:p1");
  });

  it("changes nothing for a Writing Continue", () => {
    expect(recentWithoutContinue(rows, writingContinue, 3).map((row) => row.id)).toEqual([
      "dictation:p1",
      "reading:p9",
      "dictation:p5"
    ]);
  });
});
