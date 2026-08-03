# Spike 1 — Chinese IME inside canvas text editing

**Date:** 2026-08-02 · **Phase:** 0 · **Status:** logic settled, **awaiting a real-IME session**
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

## Finding 3 — the grace window is the one number that must be measured

`COMPOSITION_GRACE_MS = 50` is currently a **placeholder**. Too short and Safari leaks; too long
and a genuine Enter pressed immediately after confirming a word gets swallowed, which is a
common way to type — confirm a word, then press Enter to end the node.

The guard therefore reports the observed `compositionend → keydown` delta on every decision, and
the spike page logs it. **The constant should be set from a real-IME session, not from this
number.** A microtask- or frame-based flag may prove better than a wall-clock window; the
measurement decides.

## Verification performed

| Check | Result |
|---|---|
| Self-test: Chrome ordering — Enter during composition | IME-owned ✓ |
| Self-test: Safari ordering — Enter right after `compositionend` | IME-owned ✓ |
| Self-test: genuine Enter after the window | reaches command layer ✓ |
| Self-test: Enter with no composition history | reaches command layer ✓ |
| Live: typed text, pressed Enter | `COMMAND`, sibling count 1 ✓ |
| Live: pressed Tab | `COMMAND`, child count 1, focus did **not** leave the field ✓ |
| TypeScript 7 typecheck | clean ✓ |

The self-test replays both browser orderings against the guard directly, so the logic is proven
without needing two browsers.

## What is NOT verified — read before trusting this

**No real IME was exercised.** Browser automation types characters directly and does **not** fire
`compositionstart` / `compositionupdate` / `compositionend`. Everything above tests the guard's
*logic* against orderings taken from documented browser behaviour; it does not prove how macOS
拼音, Windows Microsoft Pinyin, or a mobile IME actually behave in this page.

**This must be done by a human before Phase 1 begins.** Open the page, switch to Chinese input,
and for each of the three surfaces:

1. Type 拼音 and confirm a candidate with **Enter** → every row must read `IME`, never `COMMAND`.
2. Confirm with **space**, then press Enter → the Enter must read `COMMAND`.
3. Confirm a candidate with **Tab** where the IME uses it → must read `IME`.
4. Note the reported `+Xms` deltas → these set `COMPOSITION_GRACE_MS`.
5. Repeat in Safari, which is where the failure mode lives.

Also unverified: mobile/touch IMEs, `compositionupdate` mid-word cursor behaviour, and paste
during composition.

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

- Set `COMPOSITION_GRACE_MS` from measured data; consider a frame-based flag instead.
- `spec/product-specification.md` §5.4 should gain the ordering hazard and the
  do-not-`preventDefault` rule — right now it states the requirement without the trap.
- The self-test should become a real unit test when Phase 1 adopts the guard; the spike page is
  disposable, the guard is not.
