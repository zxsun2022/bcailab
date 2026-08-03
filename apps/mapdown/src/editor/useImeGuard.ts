import { useCallback, useRef } from "react";

/**
 * Is a given keydown owned by the IME?
 *
 * Promoted from the Phase 0 spike (spikes/01-ime-canvas-editing-20260802.md) unchanged. The
 * spike page under src/spikes/ is disposable; this is not.
 *
 * The problem this exists for: in Mapdown, Enter creates a sibling and Tab creates a child.
 * Both are also how a Chinese IME confirms a candidate. Firing the command while the user is
 * only confirming 拼音 would create a spurious node on nearly every word typed.
 *
 * `KeyboardEvent.isComposing` looks like the whole answer and is not:
 *
 *   Chrome / Firefox   keydown(isComposing=true) -> compositionend
 *   Safari             compositionend -> keydown(isComposing=false)   <-- looks like a command
 *
 * So the confirming Enter is indistinguishable from a real Enter on Safari if you trust the
 * flag alone. Hence three signals, in order of reliability:
 *
 *   1. our own composing flag, set by compositionstart/compositionend
 *   2. event.isComposing
 *   3. legacy keyCode 229, which some IMEs still report while composing
 *   4. a short window after compositionend, for the Safari ordering above
 *
 * The window in (4) is the one number that cannot be reasoned into existence — too short and
 * Safari leaks a spurious node, too long and a genuine Enter right after confirming gets
 * swallowed. This hook therefore *measures* the gap rather than assuming it: every decision is
 * reported with the observed delta so a real-IME session can set the constant from data.
 */

/**
 * Bounded by measurement, not chosen by taste. Real macOS 拼音 session, 2026-08-02
 * (docs/mapdown/spikes/01-ime-canvas-editing-20260802.md):
 *
 *   upper bound  the fastest *genuine* Enter after a commit was +721ms; anything at or above
 *                that would swallow a keypress the user meant as a command
 *   lower bound  Safari emits compositionend and the confirming keydown in the same task,
 *                so single-digit ms
 *
 * 50ms sits roughly 14x clear of both. Note the macOS session never produced a keydown for the
 * confirming key at all — the IME consumed it — so this window is currently insurance against
 * the Safari ordering and against Windows IMEs, not something that fires on macOS.
 */
export const COMPOSITION_GRACE_MS = 50;

export type GuardDecision = {
  imeOwned: boolean;
  /** Which signal fired first. Useful for telling browsers apart in the log. */
  reason: "composing-flag" | "isComposing" | "keycode-229" | "post-composition-window" | "none";
  /** ms since the last compositionend, or null if there has not been one. */
  sinceCompositionEnd: number | null;
};

type KeyLike = Pick<KeyboardEvent, "isComposing" | "keyCode">;

export function useImeGuard(graceMs: number = COMPOSITION_GRACE_MS) {
  const composing = useRef(false);
  const endedAt = useRef<number | null>(null);

  const onCompositionStart = useCallback(() => {
    composing.current = true;
  }, []);

  const onCompositionEnd = useCallback(() => {
    composing.current = false;
    endedAt.current = performance.now();
  }, []);

  const inspect = useCallback(
    (event: KeyLike): GuardDecision => {
      const since = endedAt.current === null ? null : performance.now() - endedAt.current;

      if (composing.current) {
        return { imeOwned: true, reason: "composing-flag", sinceCompositionEnd: since };
      }
      if (event.isComposing) {
        return { imeOwned: true, reason: "isComposing", sinceCompositionEnd: since };
      }
      if (event.keyCode === 229) {
        return { imeOwned: true, reason: "keycode-229", sinceCompositionEnd: since };
      }
      if (since !== null && since < graceMs) {
        return { imeOwned: true, reason: "post-composition-window", sinceCompositionEnd: since };
      }
      return { imeOwned: false, reason: "none", sinceCompositionEnd: since };
    },
    [graceMs]
  );

  const reset = useCallback(() => {
    composing.current = false;
    endedAt.current = null;
  }, []);

  return { onCompositionStart, onCompositionEnd, inspect, reset };
}
