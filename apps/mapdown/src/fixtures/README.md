# Test fixtures

## `kepan.md`

A 前行 (preliminary practices) 科判 — a traditional Tibetan-Buddhist scholastic outline, nested
seven levels deep using the 甲/乙/丙/丁/戊/己/庚 classification markers.

**Why this file exists.** It is the Phase 0 / Phase 1 test fixture, adopted deliberately
(`docs/mapdown/decisions.md` D-12). It is the only material available that stresses all three
Phase 0 risks at once, which no synthetic English sample does:

- **seven levels of nesting** — variable-size tidy-tree layout, and the collapsed-visibility
  projection
- **long CJK labels** of sharply varying width — text measurement, wrapping, and Chinese IME
  inside canvas editing
- **a diagram meant to be looked at** — so CJK-safe SVG and PNG export is this fixture's own
  pass/fail condition, not a separate concern

Testing the spikes on Latin placeholder text would route around every hazard the spikes were
written to find.

**What it is not.** Adopting this fixture does **not** make Buddhist study a supported vertical
or earn it any feature. `spec/vision.md` §2 lists such outlines among the target use cases;
D-12 draws the line explicitly, and any 科判-specific request goes through the scope rubric in
`spec/phases.md` §11 like any other.

**Provenance.** The structure follows the 科判 published at
<https://bicwny.com/qianxingguangshi/kepan/>. The classification markers and topic names are
traditional categories shared across 前行 commentaries rather than any one author's original
expression, and the owner confirmed on 2026-08-02 that this material is openly published within
the tradition and free to use here.
