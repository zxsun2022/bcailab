/**
 * The sentence navigator's rules (roadmap: *Now — Dictation sentence navigator*).
 *
 * A session moves forward one sentence at a time. The **frontier** is the first sentence not yet
 * checked; everything before it is checked and can be revisited, everything after it is locked
 * (owner decision D2). Revisiting is review only (D1): a checked sentence is never answered again.
 * Pure, so the page renders what these return and the rules are tested here.
 */

export type StepState = "checked" | "current" | "locked";

export type Step = {
  index: number;
  state: StepState;
  /** The sentence on screen, which may be a checked one being reviewed. */
  viewing: boolean;
};

/** First unchecked sentence, or `total` once every sentence is checked. */
export const frontierOf = (total: number, isChecked: (index: number) => boolean): number => {
  for (let index = 0; index < total; index += 1) {
    if (!isChecked(index)) return index;
  }
  return total;
};

export const stepsFor = (total: number, frontier: number, viewing: number): Step[] =>
  Array.from({ length: total }, (_, index) => ({
    index,
    state: index < frontier ? "checked" : index === frontier ? "current" : "locked",
    viewing: index === viewing
  }));

/** Only checked sentences and the frontier itself can be opened. */
export const canOpen = (index: number, total: number, frontier: number): boolean =>
  index >= 0 && index < total && index <= frontier;

/**
 * What the page is doing with the sentence on screen:
 * - `answer`: the frontier, waiting for a check;
 * - `advance`: the sentence just checked, whose next step is the next sentence (or finishing);
 * - `review`: an earlier checked sentence, whose way on is back to the frontier.
 */
export type ViewMode = "answer" | "advance" | "review";

export const viewModeOf = (viewing: number, frontier: number): ViewMode =>
  viewing >= frontier ? "answer" : viewing === frontier - 1 ? "advance" : "review";

/** Where "back to the current sentence" goes: the frontier, or the last sentence once all are checked. */
export const returnTargetOf = (total: number, frontier: number): number =>
  Math.min(frontier, Math.max(0, total - 1));

/**
 * A sentence clip's length as m:ss, at the chosen playback speed, for the label beside Play.
 * Null until the browser has read the clip's metadata: the page never guesses a duration.
 */
export const clipDurationLabel = (seconds: number | null, speed: number): string | null => {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0 || speed <= 0) return null;
  const total = Math.max(1, Math.round(seconds / speed));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};
