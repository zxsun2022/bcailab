# Spike 1 — Chinese IME inside canvas text editing

**Date:** 2026-08-02 · **Phase:** 0 · **Status:** real-IME session done on macOS/Chromium;
**Safari still untested**
**Code:** `apps/mapdown/src/spikes/ime/` — disposable, delete once Phase 1 adopts the guard
**Run it:** `pnpm --filter mapdown dev` → <http://localhost:5174/#ime>

## Why this spike exists first

In Mapdown, `Enter` creates a sibling and `Tab` creates a child. Both are also how a Chinese
IME confirms a candidate. Get this wrong and the editor creates a spurious empty node on
roughly every word a Chinese user types — not an edge case, a broken product.

`spec/product-specification.md` §5.4 requires that "IME composition MUST be supported without
premature command execution" but does not say how. This spike answers how, and it runs before
the other two because its outcome decides the editing architecture that Phase 1 builds on.

## Finding 1 — `KeyboardEvent.isComposing` alone is not sufficient

This is the whole substance of the spike. Browsers disagree on event *ordering*:

| Browser | Sequence when confirming a candidate with Enter |
|---|---|
| Chrome, Firefox | `keydown` (`isComposing === true`) → `compositionend` |
| Safari | `compositionend` → `keydown` (`isComposing === false`) |

So on Safari the confirming Enter arrives **after** composition has officially ended and is
indistinguishable from a genuine Enter. The obvious implementation — `if (e.isComposing) return`
— passes every test written on Chrome and leaks a spurious node on Safari.

Demonstrated in the running page rather than asserted:

```js
const naive = (e) => e.isComposing;
naive({ isComposing: true,  keyCode: 229 })  // true  — Chrome confirm blocked
naive({ isComposing: false, keyCode: 13  })  // false — Safari confirm LEAKS
```

## Finding 2 — four signals, checked in order

`useImeGuard.ts` treats a keydown as IME-owned if **any** of these hold:

1. an internal `composing` flag, set by `compositionstart` / `compositionend`
2. `event.isComposing`
3. legacy `event.keyCode === 229`, which some IMEs still report while composing
4. `compositionend` fired within the last `COMPOSITION_GRACE_MS` — the Safari case

(1) and (2) overlap deliberately: (1) survives browsers whose `isComposing` is unreliable, (2)
catches a composition that began before the guard was mounted.

**Do not `preventDefault()` on an IME-owned key.** The IME needs it. The guard returns early
without touching the event; only a key that reaches the command layer is prevented.

## Finding 3 — on macOS the confirming key never reaches the page at all

**Real 拼音 session, macOS, Chromium, 2026-08-02.** Three commits of 测试, chronological:

```
compositionstart → compositionend "测试" → keydown[Enter] COMMAND +1754.5ms
compositionstart → compositionend "测试" → keydown[Enter] COMMAND  +838.6ms
compositionstart → compositionend "测试" → keydown[Enter] COMMAND  +721.4ms
```

Between `compositionstart` and `compositionend` there is **no keydown of any kind**. The macOS
IME consumes the confirming key outright; the page never sees it. The three `COMMAND` rows are
separate, deliberate Enter presses made after the commit, and classifying them as commands is
correct — that is a user ending a node, not confirming a candidate.

So on this platform the guard was never actually stressed: signals (1)–(3) had nothing to fire
on, and (4) never engaged because the gap was three orders of magnitude past the window.
**No spurious node was produced.** That is the result the spike wanted, reached by a different
route than expected.

The consequence for the design: the grace window is **insurance against the Safari ordering and
against Windows IMEs**, not a mechanism that does anything on macOS. It stays, because the cost
is one comparison and the failure it prevents is severe.

## Finding 4 — the grace window now has measured bounds

`COMPOSITION_GRACE_MS = 50` was a placeholder; the session gives it real bounds.

| Bound | Value | Source |
|---|---|---|
| Upper — swallowing a genuine Enter | **721 ms** | fastest genuine post-commit Enter observed |
| Lower — catching the Safari confirm | **single-digit ms** | Safari emits `compositionend` and the confirming keydown in the same task |

50 ms sits roughly 14× clear of both, so it is kept. A frame-based flag would also satisfy both
bounds and is more principled; it is not worth the change given this margin.

One caveat on the upper bound: 721 ms is an unhurried pace. A fast typist confirming a word and
immediately ending the node might reach 150–300 ms — still 3× the window, so the margin holds.

## Verification performed

| Check | Result |
|---|---|
| Self-test: Chrome ordering — Enter during composition | IME-owned ✓ |
| Self-test: Safari ordering — Enter right after `compositionend` | IME-owned ✓ |
| Self-test: genuine Enter after the window | reaches command layer ✓ |
| Self-test: Enter with no composition history | reaches command layer ✓ |
| Live: typed text, pressed Enter | `COMMAND`, sibling count 1 ✓ |
| Live: pressed Tab | `COMMAND`, child count 1, focus did **not** leave the field ✓ |
| **Real macOS 拼音, 3 commits of 测试** | **no spurious node; no keydown during composition** ✓ |
| TypeScript 7 typecheck | clean ✓ |

The self-test replays both browser orderings against the guard directly, so the logic is proven
without needing two browsers.

## What is still NOT verified

**Safari — and that is where the whole hazard lives.** The session above ran in Chromium, where
the confirming key never surfaces. Safari is the browser documented to emit `compositionend`
*before* the confirming keydown, which is the one ordering the guard exists for, and it remains
unobserved. Until someone runs the page in Safari with 拼音, Finding 1 rests on documented
behaviour rather than on this repository's own measurement.

**Which surface produced which rows.** The session was reported as covering all three surfaces,
but the log did not render the surface name at the time, so that cannot be read back from the
data. Fixed on 2026-08-02 — each row now carries its surface — so a re-run is self-describing.

**Windows IMEs** (Microsoft Pinyin), where `keyCode === 229` and the `isComposing` flag are the
signals that matter and macOS's consume-the-key behaviour does not apply.

**Also open:** mobile/touch IMEs, `compositionupdate` mid-word caret behaviour, and paste during
composition.

### Safari check, for whoever runs it

Open <http://localhost:5174/#ime> in Safari, switch to Chinese input, and for each surface:

1. Type 拼音 and confirm with **Enter** → every row must read `IME`, never `COMMAND`. A single
   `COMMAND` row during confirmation is the bug.
2. Confirm with **space**, then press Enter → that Enter must read `COMMAND`.
3. Note any `+Xms` on a row that reads `post-composition-window` — that is the Safari gap, and
   it is the number that would justify changing `COMPOSITION_GRACE_MS`.

## Surface comparison — provisional

No surface has been eliminated, because that judgement needs the real-IME session. Standing
trade-offs:

**Overlaid textarea** — a real form control, so IME behaviour is the browser's well-trodden
path. Cost: the textarea must track the node box exactly as the map pans, zooms and reflows.
*Currently the front-runner, on the principle that the IME path should be the boring one.*

**contentEditable** — caret and selection come free. Cost: it is a rich-text surface pretending
to be plain text; paste sanitisation and suppressing browser formatting commands are permanent
obligations, and `spec/product-specification.md` §4.3 requires plain Unicode text only.

**Hidden input** — full control of rendering, which suits an SVG canvas. Cost: the caret must be
drawn and positioned by hand, including inside a composition, which is where CJK text
measurement is hardest.

## Recommendation

Adopt `useImeGuard` regardless of surface — the four-signal check is surface-independent and is
the actual finding here. Defer the surface choice until the real-IME session, and record it as a
decision in `../decisions.md` at that point, since it binds the whole editing layer.

## Follow-ups

- **Run the Safari check above.** It is the last open question on this spike and the only one
  that could still change the design.
- `spec/product-specification.md` §5.4 should gain the ordering hazard and the
  do-not-`preventDefault` rule — right now it states the requirement without the trap.
- The self-test should become a real unit test when Phase 1 adopts the guard; the spike page is
  disposable, the guard is not.
- ~~Set `COMPOSITION_GRACE_MS` from measured data~~ — done, see Finding 4. 50 ms kept, now with
  bounds rather than taste behind it.
