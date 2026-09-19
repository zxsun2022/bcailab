# Material batch `034b84f4` — independent model review (post-hoc, 2026-09-18)

**Role.** The material pipeline's review policy asks for a second, independent LLM pass over a
generated batch. The published batch carried a human second-party review instead (`kaixi` as
independent reader, `Z.Sun` as owner, both on 2026-09-18 — see
[the approval](../approvals/writing-prompts-034b84f4.json)). The owner then asked a second model
(different from the one that generated the material) to review the batch after it had already
been published. This document is that pass. It is a **review, not an approval**: the items it
flags need the owner's decision, and it does not change the batch's recorded approval.

**What that means for authority.** This review is input, not authorization, and it is not a
substitute for the human review that already happened. Nothing here was acted on without being
written down, and nothing in the batch was edited as a result of it.

## Scope

Everything published to production on 2026-09-18:

- **40 graded passages** — A2/B1/B2/C1 ten each, added on top of the existing forty.
- **24 IELTS writing prompts** — 12 Academic Task 1 (with 12 new content-addressed SVGs) and
  12 Academic Task 2, added on top of the existing forty-eight.

## Method

Read and checked, in this order:

1. **Content read in full** — all 40 passages sentence by sentence, all 24 prompts including
   their canonical facts, key features, comparisons, alt text and accessible descriptions.
2. **Mechanical constraints re-derived** rather than trusted: 8–12 sentences, ≤110 characters
   per sentence, no digits, 2–6 word titles, band/topic present, no duplicate title across the
   whole eighty. `scripts/material-seed/intake.ts` was not re-run; the same rules were checked
   directly against the committed drafts.
3. **Task 1 facts recomputed from the canonical JSON** — every `keyFeatures` and `comparisons`
   line was checked against the series/rows it describes: differences, multiples, extrema,
   "overtook", "nearly doubled", pie and table sums, axis maxima.
4. **Derived SVGs compared with their canonical facts** — every series value, table cell, pie
   slice label, axis maximum, legend entry, stage label and map place name was located in the
   asset the prompt actually serves.
5. **Production compared with what was reviewed** — all 80 passage rows (`content_text`, `title`,
   `band`) and all 72 prompt rows (`prompt_text`, `content_hash`, targets, `asset_path`,
   `status`, `review_manifest_json`) against the committed drafts and generated artifact.
6. **Source history** — whether the batch was purely additive and whether the earlier register
   corrections changed the property they were aiming at.

The tagger's own metrics were used for difficulty claims, through a throwaway harness that
imports `analyzePassage` from `apps/web/app/utils/passage-tags.ts`. It reproduced the stored
`rare_word_ratio` and `mean_sentence_words` for all 80 published passages exactly, so the numbers
below are the repository's own, not a re-implementation.

## Results — no defect found

- **Mechanical constraints:** 0 violations across the 40 new drafts; no duplicate title anywhere
  in the eighty.
- **Task 1 factual consistency:** all 12 items' key features and comparisons are arithmetically
  correct against their own data, including the two line graphs' axis maxima, both pie charts
  summing to 100 in both years, both tables summing to 100 per row, and the two process
  diagrams' stage counts and ordering.
- **Asset consistency:** every value, label and place name in the 12 new SVGs matches the
  canonical material; no stale or orphaned asset was referenced.
- **Production equals review:** 0 mismatches for all 80 passages and all 72 prompts. No
  unreviewed row exists in production, and no reviewed row is missing.
- **Distribution:** Task 1 is 4 per material kind across all six kinds; Task 2 is 6 per family
  across all four; general stays at 24. All 72 `contentHash` values are distinct, no prompt text
  is duplicated, and every IELTS prompt keeps `cefrBand` null, so the "never render null as B1"
  invariant holds in data.
- **Purely additive:** `prompts.source.json` gained 24 entries with 0 modified and 0 removed, so
  the first batch's prompts were not rewritten. (Their stored review manifest did change — that
  is recorded in the changelog as a deliberate consequence of a whole-bank upsert, not found
  here.)

## Flagged set

Ordered by how much the flag is worth acting on. Nothing here is a factual error; all four are
wording or arithmetic choices.

1. **`Tools That Reshape Their Users` (C1, `2b3936f1…`), sentence 4 — the batch's clearest
   content flag.** *"Writing by hand and writing at a keyboard reliably produce recognisably
   different prose."* Every other claim in this passage is hedged ("we tend to", "only
   intermittently true", "the interesting question is never whether"); this one asserts a
   contested empirical result flatly, with no attribution. It is the same category as the flag a
   previous pass already corrected elsewhere ("an appeal to unnamed research for a contested
   empirical claim"). Recommend hedging ("tend to produce") if the passage is ever revised.
2. **`Saving for a Bicycle` (A2, `5c9450a5…`), sentences 2–9 — loose arithmetic.** The narrator
   saves twenty dollars a week and ten more by skipping coffee (thirty in total) and reports
   having "saved half of the money now" against a three-hundred-dollar target, then expects to
   have "enough" in two months — eight weeks, or roughly two hundred and forty dollars, against
   a hundred and fifty still needed. Nothing is false, but a learner who does the sum finds the
   timeline slack. Low severity, and the fix would cost a re-record.
3. **`Why We Watch at All` (B2, `7976618a…`), sentence 1 — register mismatch on first read.**
   *"…watching other people run."* reads as athletics until "any single match" and "the town they
   represent" resolve it to a team sport. Purely stylistic; it costs the opening sentence its
   clarity for a listening learner.
4. **`Walking Someone Else's Dog` (B1, `a11d084c…`), sentence 9 — antecedent by inference.**
   *"I still look for him whenever I pass her window."* requires the learner to resolve *him* to
   the dog and *her* to the neighbour. Resolvable, and arguably good practice for the band.

Also noted, not flagged: **`What an Animal Owes You` (B2)** has a title that inverts its own
conclusion. It reads as deliberate irony and the passage supports it, but a title is also a
navigation label, so it is worth knowing that it is doing that.

## The one finding worth a decision: lexical level at A2/B1/B2

Sentence length was measured and corrected before publication. Lexical difficulty was never
measured. It does not match the existing shelf at three of the four bands.

`rare_word_ratio` is the tagger's share of tokens outside a 226-entry high-frequency list. The
code itself calls it *"a coarse proxy for lexical difficulty, not a real frequency model"*. It is
nevertheless the band metadata the library stores, and the metric Dictation v2 matching is
planned to consume.

Per band, the new ten against the existing ten (same band, already published):

| Band | Existing ten | New ten | New below existing minimum |
| --- | --- | --- | --- |
| A2 | `[0.266, 0.442]`, mean 0.383 | `[0.287, 0.385]`, mean 0.334 | 0/10 |
| B1 | `[0.336, 0.487]`, mean 0.418 | `[0.300, 0.458]`, mean 0.374 | 2/10 |
| B2 | `[0.496, 0.604]`, mean 0.526 | `[0.381, 0.492]`, mean 0.455 | **10/10** |
| C1 | `[0.451, 0.571]`, mean 0.507 | `[0.448, 0.527]`, mean 0.494 | 2/10 |

At **B2 the two ranges do not overlap at all**: every one of the ten new passages is below every
one of the ten existing passages (permutation test on the means, p < 0.001, 20 000 draws). A2
(p = 0.030) and B1 (p = 0.068) show the same direction more weakly; C1 (p = 0.359) shows no
difference. Proper nouns do not explain it: by a simple capitalisation heuristic the two groups
carry the same number of names at B2 (2.5 per passage each), and recomputing the ratio with
those tokens removed moves neither mean.

**The rewrite was not the cause.** Reconstructing each draft's metrics from git history shows the
gap was there when the passages were first generated and the corrections only partly closed it:

| Stage | A2 | B1 | B2 | C1 |
| --- | --- | --- | --- | --- |
| initial drafts (`a4557a4`) | 0.334 | 0.379 | 0.432 | 0.513 |
| after B2/C1 register raise (`d1a1875`) | 0.334 | 0.379 | 0.452 | 0.498 |
| after B2/C1 variance restore (`5c1b2b6`) | 0.334 | 0.379 | 0.455 | 0.494 |
| after B1 rewrite, published (`7355eea`) | 0.334 | 0.374 | 0.455 | 0.494 |
| existing shelf | 0.383 | 0.418 | 0.526 | 0.507 |

Those passes targeted character length and variance, and hit them — words per sentence now track
the shelf at every band (A2 9.00 vs 8.08, B1 12.51 vs 11.96, B2 13.41 vs 12.75, C1 14.14 vs
14.62). Lexical difficulty simply was not part of the measurement, at any stage.

**Two readings fit the same numbers, and the second is not a rescue.** Either the new A2/B1/B2
passages sit a little below their shelf, or **the existing B2 shelf is the anomaly**: its mean
(0.526) is *above* the existing C1 mean (0.507), so the library's own band ordering was
non-monotonic before this batch. The new ten are monotonic across bands (0.334 < 0.374 < 0.455 <
0.494), and the combined library is now monotonic too (0.358 < 0.396 < 0.490 < 0.501). A
226-word proxy that already fails to order the existing B2 and C1 shelves is not strong enough
evidence on its own to call a published passage misbanded.

**Recommendation (owner's call, in this order).** (a) Record this as a property of the batch and
change nothing now — the band label is discovery metadata and no learner has been harmed by a
slightly easier B2. (b) Before lexical difficulty drives any matching, validate the proxy against
a real frequency model, because it currently cannot separate existing B2 from existing C1. (c) If
a correction is wanted anyway, B2 is the only band with a clear, quantified gap; A2/B1 rest on a
borderline difference and C1 shows none.

**A correction is not currently cheap or supported.** `scripts/material-seed/publish.ts` skips
any passage id already present in D1, and `tag.ts` rewrites only metrics and tags. So there is no
supported way to change a published passage's text: it would need the row and its R2 objects
removed first, a new update path, and a fresh TTS pass for every changed sentence.

## What this review did not do

- **It did not listen to anything.** TTS pronunciation, pacing and voice quality are unverified;
  audio was checked only for presence and byte size.
- **It did not exercise the product.** No browser or app flow was run with the new material.
- **Band judgements are impressions.** Only the length and rare-word metrics are reproducible;
  "reads at B2" is my reading, on the same kind of system that generated the text, so shared
  blind spots are possible and expected.
- **It is one pass, not a protocol.** No fixed sample, no second reader, no inter-rater
  agreement. The one protocol in this repository with thresholds fixed in advance
  ([the Reading bias protocol](reading-context-bias-protocol.md)) is the shape a repeatable
  version of this would take.
- **It says nothing about learner outcomes.** Whether easier lexis at B2 helps or hurts practice
  is not answerable from this repository's current data, which has no learners in it.
