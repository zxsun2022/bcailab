import type { AlternativeAction, ContinueAction, RecommendedAction } from "./starter-practice";

/**
 * Home v3's layout decision, as data (`docs/home-v3-design.md` §4).
 *
 * Every state has one protagonist — the hero — and exactly one primary action. The page
 * renders what this returns, so the "one primary" rule is tested here rather than trusted to
 * markup. Pure: no clock, no I/O.
 */

export type HomeState = "cold" | "continue" | "recommend" | "choose";

export type HomeActionId =
  | "continue"
  | "recommendation"
  | "alternatives"
  | "coldDictation"
  | "levelPicker"
  | "chooseDictation"
  | "chooseReading";

export type HomeEmphasis = "primary" | "ghost" | "link";

export type HomeLayout = {
  state: HomeState;
  /** The recommendation sits under Continue as a quieter strip (S1 only). */
  strip: boolean;
  /** Every action on the page, with the weight it is drawn at. */
  actions: Array<{ id: HomeActionId; emphasis: HomeEmphasis }>;
};

export const homeLayout = (input: {
  isCold: boolean;
  continueAction: ContinueAction | null;
  recommendation: RecommendedAction | undefined;
  alternatives: AlternativeAction[];
}): HomeLayout => {
  const { isCold, continueAction, recommendation, alternatives } = input;
  const alternativeLinks = alternatives.length > 0
    ? [{ id: "alternatives" as const, emphasis: "link" as const }]
    : [];

  if (isCold) {
    return {
      state: "cold",
      strip: false,
      actions: [
        { id: "coldDictation", emphasis: "primary" },
        { id: "levelPicker", emphasis: "ghost" }
      ]
    };
  }
  if (continueAction) {
    return {
      state: "continue",
      strip: Boolean(recommendation),
      actions: [
        { id: "continue", emphasis: "primary" },
        ...(recommendation
          ? [{ id: "recommendation" as const, emphasis: "ghost" as const }, ...alternativeLinks]
          : [])
      ]
    };
  }
  if (recommendation) {
    return {
      state: "recommend",
      strip: false,
      actions: [{ id: "recommendation", emphasis: "primary" }, ...alternativeLinks]
    };
  }
  return {
    state: "choose",
    strip: false,
    actions: [
      { id: "chooseDictation", emphasis: "primary" },
      { id: "chooseReading", emphasis: "ghost" }
    ]
  };
};

/** The button class an action is drawn with. */
export const emphasisOf = (layout: HomeLayout, id: HomeActionId): HomeEmphasis | null =>
  layout.actions.find((action) => action.id === id)?.emphasis ?? null;

/**
 * Recent practice without the passage Continue already shows (design §6.3), still `limit`
 * rows long when enough history exists. `items` must be newest first and uncut.
 */
export const recentWithoutContinue = <T extends { id: string }>(
  items: T[],
  continueAction: ContinueAction | null,
  limit: number
): T[] => {
  const skip = continueAction?.kind === "dictation" ? `dictation:${continueAction.passageId}` : null;
  return items.filter((item) => item.id !== skip).slice(0, limit);
};

/** The latest Writing round's state, as the Writing hero words it (design §6.2). */
export type WritingRoundState = {
  round: number;
  feedback: "pending" | "completed" | "failed";
};
