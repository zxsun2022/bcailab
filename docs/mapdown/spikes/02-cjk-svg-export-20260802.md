# Spike 2 — CJK-safe SVG and PNG export

**Date:** 2026-08-02 · **Phase:** 0 · **Status:** complete on macOS; **cross-machine rendering
is an accepted, documented limitation, not a solved problem**
**Code:** `apps/mapdown/src/spikes/svg-export/` — disposable; `measure.ts` is the part worth keeping
**Run it:** `pnpm --filter mapdown dev` → <http://localhost:5174/#svg-export>

## What the risk actually is

Not "can we draw Chinese in an SVG" — that was never in doubt. The risk is that an exported
file must stay correct **on someone else's machine**, and `storage-export.md` §12.3/§12.6 forbid
any external dependency: no web font, no `<image>`, no network reference. That leaves a system
font stack, and a system font stack resolves to whatever the *recipient* has installed.

Labels come from the 科判 fixture (`src/fixtures/kepan.md`, decision D-12), mixed with the Latin,
punctuation and emoji cases that break naive serialisers.

## Finding 1 — canvas measurement and SVG layout agree exactly

The single most useful result, because it decides whether layout can size node boxes at all.

Layout measures a label with the canvas 2D API to decide how wide its node box is; the exporter
paints that label into an SVG `<text>`. If the two disagree, **every node in every export is the
wrong width**, and the error is invisible until someone compares.

Measured against the browser's own `getComputedTextLength()` on the identical string and font:

```
丁六 思维死缘无定而修无常  @16px
  canvas 196.19px   svg 196.19px   Δ 0.000px
```

Exact agreement, so one measurement path can serve both layout and export. `measure.ts` therefore
exports a single `FONT_STACK` constant used by measurement, on-screen rendering and
serialisation — the divergence is prevented structurally rather than by discipline.

## Finding 2 — Han renders full-width, and there is a cheap check for when it does not

```
4 Han glyphs (汉汉汉汉)   64.0px   →  exactly 16px each at font-size 16
4 narrow Latin (iiii)     14.6px
```

Han is full-width; Latin is proportional. That 4.4× ratio is a **fallback detector**: if a
machine lacks a Han-capable face, the glyphs degrade to tofu boxes or a Latin metric and the
ratio collapses. The check costs two `measureText` calls and catches silently-wrong output.

On this machine the stack resolved to `-apple-system`, which covers Han.

## Finding 3 — rasterisation is self-proving

PNG export loads the SVG into an `<img>` and draws it to a canvas. That is not merely a
conversion — it is the strongest available proof of self-containment, because an SVG loaded this
way renders in an **isolated context**: the page's CSS does not apply and external references are
refused. A file that rasterises correctly here would also render correctly opened standalone.

```
714 × 764 px drawn at 2×, non-blank, glyphs intact
```

This is the practical reason the no-external-dependency rule is not merely a policy preference:
a web font would silently vanish at exactly this step.

**Blank detection.** `storage-export.md` §13.2 forbids quietly producing an empty or clipped
image, so the rasteriser scans the alpha channel and reports blankness rather than trusting that
`drawImage` worked. Verified against a false positive: with **transparent background** enabled —
where most pixels legitimately have zero alpha — the check still passes, because it looks for any
non-zero pixel and the glyphs supply them.

## Finding 4 — serialisation is safe against label content

Node labels are user text and must not be able to inject markup.

| Check | Result |
|---|---|
| `<&>`, quotes and apostrophes in a label | escaped to entities; no raw `<&>` in output |
| `<script>` / `<foreignObject>` | absent (§12.6) |
| `<image>`, `xlink:href`, `@import`, `url(http…)` | absent (§12.3) |
| Transparent mode | emits no background `<rect>` |

Serialised output at 16px: 3,098 bytes, 9 `<text>` elements, 9 `font-family` attributes.

## Verification performed

All checks run in-page against real 科判 labels, and were **7/7 passing in both opaque and
transparent modes**. Glyphs were confirmed visually in the inline SVG *and* in the rasterised
PNG — the automated checks alone could not distinguish correct Han from tofu.

TypeScript 7 typecheck clean.

## What is NOT verified — the real limitation

**Only this machine's font stack was exercised.** macOS resolved `-apple-system`, which has full
Han coverage. Nothing here establishes what a recipient sees on:

- **Windows**, where the stack falls through to `Microsoft YaHei` — different metrics, so a node
  box sized on macOS may not match the text drawn on Windows
- **Linux**, where none of the named families may exist and the generic `sans-serif` decides
- a machine with **no CJK font at all**, which produces tofu boxes

This is inherent to the constraint, not a gap in the work: the spec forbids embedding a font, so
the exported SVG *must* delegate to the recipient's system. **Text-as-vector-text is the tradeoff
being made** — it keeps the file small, selectable, accessible and diff-able, at the cost of
exact cross-machine fidelity.

The escape hatch exists and is already anticipated by `theme.md` §17.1, which allows "an optional
outline mode" converting text to paths. That would be pixel-identical everywhere at the cost of
file size, selectability and accessibility. **Not needed for MVP**; recorded here so the option is
not rediscovered under pressure.

PNG export sidesteps the issue entirely — it is rasterised on the author's machine, so it looks
the same everywhere. That is worth saying in the export dialog.

**Also unverified:** very large exports near canvas size limits (§13.2 fallback path), 3× scale,
long-label wrapping into `<tspan>` lines — MVP labels are single-line, but wrapping is required
by §5 and will need its own measurement pass.

## Recommendation

**No architectural blocker. Phase 0 exit for this risk: cleared.**

Keep from the spike:

- `FONT_STACK` as a single exported constant shared by measurement, rendering and export
- the canvas-vs-SVG agreement assertion, as a real unit test in Phase 1
- the Han-vs-Latin width ratio as a runtime fallback detector
- alpha-channel blank detection in the real exporter

For the spec:

- `storage-export.md` §12.3 should state plainly that **cross-machine fidelity is delegated to
  the recipient's fonts**, and that PNG does not share this property. Users deciding between
  formats need that sentence.
- `theme.md` §19.6 ("Chinese glyph availability") should name the width-ratio check as the
  mechanism, since it is cheap and now proven.

## Follow-ups

- Run once on Windows and once on Linux; record the resolved family and the width delta for the
  same label. That quantifies the fidelity gap instead of leaving it qualitative.
- Wrapping into `<tspan>` needs its own measurement pass before Phase 2's SVG export.
- Decide where the export dialog says "PNG looks identical everywhere; SVG uses the reader's
  fonts" — `spec/storage-export.md` §14.4 already requires explanatory text.
