# Spike 1 — Chinese IME inside canvas text editing

**Date:** 2026-08-02 · **Phase:** 0 · **Status:** complete — real IME tested on macOS in both
Chromium and Safari
**Code:** `apps/mapdown/src/spikes/ime/` — disposable, delete once Phase 1 adopts the guard
**Run it:** `pnpm --filter mapdown dev` → <http://localhost:5174/#ime>

## Why this spike exists first

In Mapdown, `Enter` creates a sibling and `Tab` creates a child. Both are also how a Chinese
IME confirms a candidate. Get this wrong and the editor creates a spurious empty node on
roughly every word a Chinese user types — not an edge case, a broken product.

`spec/product-specification.md` §5.4 requires that "IME composition MUST be supported without
premature command execution" but does not say how. This spike answers how, and it runs before
the other two because its outcome decides the editing architecture that Phase 1 builds on.

## Finding 1 — `KeyboardEvent.isComposing` alone is not sufficient *(documented, not reproduced)*

> **Superseded in part by Finding 3b.** The ordering below is documented browser behaviour and
> is why the guard was written. It did **not** reproduce on macOS in either browser, because the
> system IME consumes the confirming key before the page sees it. Read this section as the
> rationale for the guard's design, not as an observed failure in this repository.

Browsers are documented to disagree on event *ordering*:

| Browser | Documented sequence when confirming a candidate with Enter |
|---|---|
| Chrome, Firefox | `keydown` (`isComposing === true`) → `compositionend` |
| Safari | `compositionend` → `keydown` (`isComposing === false`) |

Where that ordering holds, the confirming Enter arrives **after** composition has officially
ended and is indistinguishable from a genuine Enter, so the obvious implementation —
`if (e.isComposing) return` — passes every test written on Chrome and leaks a spurious node.

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

## Finding 3b — Safari did not reproduce the documented hazard

**Real 拼音 session, macOS Safari, 2026-08-02**, all three surfaces:

```
contenteditable  compositionstart → compositionend "测试" → keydown[Enter] COMMAND +4294.0ms
textarea         compositionstart → compositionend "测试" → keydown[Enter] COMMAND +2090.0ms
hidden-input     compositionstart → compositionend "带"
                 compositionstart → compositionend "测试" → keydown[Enter] COMMAND +1536.0ms
```

Safari behaved exactly like Chromium: **no keydown between `compositionstart` and
`compositionend` on any surface.** The confirming key is consumed by the macOS IME. No row ever
reported `post-composition-window`, so signal (4) has now failed to fire in two real sessions
across both browsers.

**This weakens Finding 1's evidence and the report should say so.** The Chrome/Safari ordering
difference is documented browser behaviour and is why the guard was written, but on macOS with
the system Pinyin IME it does not surface — the OS-level IME swallows the key before either
browser reports it. Where the hazard is still plausible: **Windows** IMEs, where `keyCode === 229`
is the documented signal and the consume-the-key behaviour does not apply; older Safari; and
non-Pinyin IMEs.

**One thing these sessions do not settle.** The logs cannot tell whether the candidate was
confirmed with **Enter** or with **space** — only the separate, deliberate Enter that followed
is visible, 1.5–4.3 s later. If space was used throughout, the specific "Enter confirms a
candidate" path remains untested even now. It is worth one more deliberate pass, but it no
longer blocks anything: on macOS no key reaches the page during composition either way.

**Recommendation: keep the guard unchanged.** Its cost is a few comparisons on Enter and Tab
only, and the failure it prevents — a spurious node on every word a Chinese user types — is
severe enough that insurance against untested platforms is cheap. But it is now documented as
*insurance*, not as a mechanism observed to do work.

## Finding 3c — IME behaviour does not discriminate between the three surfaces

All three surfaces behaved identically under a real IME, in both browsers. **The surface choice
therefore cannot be made on IME grounds** — which is worth knowing, because IME risk was the
stated reason this spike ran first.

It must be decided on the remaining criteria instead: caret rendering control, paste
sanitisation burden, and how hard the surface is to keep in visual sync with a node box as the
map pans, zooms and reflows. Those belong to the layout and editing work in Phase 1, not here.

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

**Windows IMEs** (Microsoft Pinyin), where `keyCode === 229` and the `isComposing` flag are the
signals that matter and macOS's consume-the-key behaviour does not apply.

**Also open:** mobile/touch IMEs, `compositionupdate` mid-word caret behaviour, and paste during
composition.

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

**Adopt `useImeGuard`, unchanged.** The four-signal check is surface-independent, costs a few
comparisons on Enter and Tab only, and guards a failure severe enough to justify insurance
against platforms this session could not cover.

**Do not choose the editing surface from this spike.** Finding 3c is that IME behaviour does not
discriminate between the three, which is the opposite of what this spike was expected to
establish. The choice now rests on caret control, paste sanitisation and node-box sync, so it
belongs with the Phase 1 editing work and should be recorded in `../decisions.md` then.

**Phase 0 exit for this risk: cleared.** There is no architectural blocker for WYSIWYG text
editing with a Chinese IME.

## Follow-ups

- ~~Run the Safari check~~ — done, see Finding 3b. The documented hazard did not reproduce.
- If a Windows machine is ever available, re-run there: that is where the guard's `keyCode === 229`
  signal is documented to matter and where the macOS consume-the-key behaviour does not apply.
- One deliberate pass confirming a candidate with **Enter specifically** rather than space,
  to close the ambiguity noted in Finding 3b. Not blocking.
- `spec/product-specification.md` §5.4 should gain the ordering hazard and the
  do-not-`preventDefault` rule — right now it states the requirement without the trap.
- The self-test should become a real unit test when Phase 1 adopts the guard; the spike page is
  disposable, the guard is not.
- ~~Set `COMPOSITION_GRACE_MS` from measured data~~ — done, see Finding 4. 50 ms kept, now with
  bounds rather than taste behind it.
