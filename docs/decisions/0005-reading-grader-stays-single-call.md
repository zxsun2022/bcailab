# 0005 — Reading grader stays a single LLM call

**Status:** Accepted · **Date:** 2026-07-23 · **Origin:** `docs/roadmap.md` (Later)

## Context

A v1 diagnosis proposed rebuilding reading evaluation as a deterministic measurement — ASR diff
plus a calibrated pronunciation API — on the assumption that a single LLM call was too variable
to trust. That assumption was tested rather than accepted.

## Decision

Keep the single-call reading evaluator. Do not build the deterministic split.

The evidence: `scripts/grader-variance.ts` calls the evaluator 5× against the same
(audio, passage) pair and reports per-dimension standard deviation plus CEFR-guess agreement.
Three real recordings were tested (`docs/spikes/grader-variance-*-20260723.md`):

| Sample | Overall stddev | CEFR agreement |
|---|---:|---:|
| ~80-word plain passage | 0.00 | 100% |
| ~30-word jargon-dense sentence | 2.79 | 80% (one flip) |
| ~30-word plain sentence, length-matched | 1.20 | 100% |

All three stayed under the 4-point threshold. The length-matched third sample ruled out
sentence length as the driver and pointed at vocabulary/register density instead.

## Alternatives considered

The deterministic-measurement rebuild (ASR diff + calibrated pronunciation API). Not adopted:
the evaluator looks trustworthy enough as-is for most material, so the rebuild is not currently
justified.

## Consequences

- The learner model's down-weighting of reading observations (`docs/learner-model-design.md`
  §5.2) moves from an untested assumption to a data-backed one.
- Reading remains the down-weighted LLM-judged signal beside dictation's deterministic one.
- The deterministic split stays parked in `docs/roadmap.md` (Later) with its trigger attached.

## Revisit when

A further spike run on more jargon-dense or unfamiliar-register material reproduces variance
that **actually crosses** the 4-point threshold. Until then this stays parked. More samples
across registers and speakers would also sharpen the down-weight itself.
