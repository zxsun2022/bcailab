import { describe, expect, it } from "vitest";
import {
  activeSeconds,
  clampAttemptPracticeSeconds,
  IDLE_AFTER_MS,
  MAX_PRACTICE_SECONDS_PER_SENTENCE,
  recordActivity,
  startActiveClock,
  suspendActiveClock
} from "./practice-time";

describe("active practice clock", () => {
  it("does not count time before the first interaction", () => {
    const clock = recordActivity(startActiveClock(), 90_000);
    expect(clock.activeMs).toBe(0);
  });

  it("counts gaps between interactions", () => {
    let clock = recordActivity(startActiveClock(), 0);
    clock = recordActivity(clock, 4_000);
    clock = recordActivity(clock, 10_500);
    expect(clock.activeMs).toBe(10_500);
    expect(activeSeconds(clock)).toBe(10);
  });

  it("caps a single idle gap", () => {
    let clock = recordActivity(startActiveClock(), 0);
    clock = recordActivity(clock, 10 * 60_000);
    expect(clock.activeMs).toBe(IDLE_AFTER_MS);
  });

  it("closes the gap when the page hides and restarts only at the next interaction", () => {
    let clock = recordActivity(startActiveClock(), 0);
    clock = suspendActiveClock(clock, 5_000);
    expect(clock.activeMs).toBe(5_000);
    // Hidden for an hour, then back: the absence adds nothing.
    clock = recordActivity(clock, 3_605_000);
    expect(clock.activeMs).toBe(5_000);
    clock = recordActivity(clock, 3_608_000);
    expect(clock.activeMs).toBe(8_000);
  });

  it("ignores a clock that moves backwards", () => {
    let clock = recordActivity(startActiveClock(), 10_000);
    clock = recordActivity(clock, 9_000);
    expect(clock.activeMs).toBe(0);
  });
});

describe("clampAttemptPracticeSeconds", () => {
  it("accepts a plain total", () => {
    expect(clampAttemptPracticeSeconds("125", 10)).toBe(125);
    expect(clampAttemptPracticeSeconds(12.9, 10)).toBe(12);
  });

  it("treats missing, malformed and negative values as 0", () => {
    expect(clampAttemptPracticeSeconds(null, 10)).toBe(0);
    expect(clampAttemptPracticeSeconds("", 10)).toBe(0);
    expect(clampAttemptPracticeSeconds("abc", 10)).toBe(0);
    expect(clampAttemptPracticeSeconds("-40", 10)).toBe(0);
    expect(clampAttemptPracticeSeconds("Infinity", 10)).toBe(0);
  });

  it("caps the total by passage length", () => {
    expect(clampAttemptPracticeSeconds(1e9, 4)).toBe(4 * MAX_PRACTICE_SECONDS_PER_SENTENCE);
    expect(clampAttemptPracticeSeconds(100, 0)).toBe(0);
  });
});
