/**
 * Active practice time for modes that have no natural recording length (Dictation).
 *
 * The rule, documented in `docs/tools/dictation.md`: time counts between consecutive learner
 * interactions (typing, clicking, audio playing), but a single gap contributes at most
 * `IDLE_AFTER_MS`. Walking away mid-sentence therefore adds at most one minute, not the whole
 * absence. A hidden tab closes the current gap at the moment it hides and restarts counting
 * only at the next interaction after it returns. Time before the first interaction is not
 * counted.
 *
 * Pure functions over a small value, so the rule is unit-tested without a DOM.
 */

/** Longest single gap between interactions that still counts as practice. */
export const IDLE_AFTER_MS = 60_000;

/**
 * Server-side ceiling per sentence. The client is not trusted to report an unbounded total;
 * five minutes on one sentence is already far beyond real use.
 */
export const MAX_PRACTICE_SECONDS_PER_SENTENCE = 300;

export type ActiveClock = {
  activeMs: number;
  /** Time of the last counted interaction; `null` before the first one or while hidden. */
  lastActivityAt: number | null;
};

export const startActiveClock = (): ActiveClock => ({ activeMs: 0, lastActivityAt: null });

const accrue = (clock: ActiveClock, now: number): number => {
  if (clock.lastActivityAt === null) return clock.activeMs;
  const gap = Math.max(0, now - clock.lastActivityAt);
  return clock.activeMs + Math.min(gap, IDLE_AFTER_MS);
};

/** An interaction happened at `now`: count the gap since the previous one, capped. */
export const recordActivity = (clock: ActiveClock, now: number): ActiveClock => ({
  activeMs: accrue(clock, now),
  lastActivityAt: now
});

/** The page was hidden at `now`: close the open gap and stop counting until the next interaction. */
export const suspendActiveClock = (clock: ActiveClock, now: number): ActiveClock => ({
  activeMs: accrue(clock, now),
  lastActivityAt: null
});

export const activeSeconds = (clock: ActiveClock): number => Math.floor(clock.activeMs / 1000);

/**
 * Sanitise a client-reported attempt total: a non-negative integer, capped by the passage
 * length. Anything unparseable counts as 0 rather than failing the practice request.
 */
export const clampAttemptPracticeSeconds = (value: unknown, sentenceCount: number): number => {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.min(parsed, Math.max(0, sentenceCount) * MAX_PRACTICE_SECONDS_PER_SENTENCE);
};
