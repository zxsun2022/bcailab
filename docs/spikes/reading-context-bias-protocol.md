# Reading context bias experiment

Status: **tooling accepted 2026-09-21; experiment not run**. Updated 2026-09-25.
The roadmap's Stage 1 criterion (d) owns the thresholds and rollout decision. This document
explains the tools; it does not change those decisions or enable Reading's new brief.

## What is ready

- `scripts/grader-variance.ts --brief <file>` runs the single-recording preliminary screen.
- `scripts/grader-bias.ts` checks a registered corpus, runs five evaluations per recording under
  **baseline / brief / legacy persistent issues**, and reports both comparisons against baseline.
- Both use the application's full prompt and normalized highlights. Older variance reports used
  a reduced score-only prompt; do not use them as the baseline for these comparisons.
- Attribution calls the real `attributeReadingErrors` with tags from `analyzePassage`. No copied
  tag rules, heuristic fallback, stored observations, profile writes, or production switch.

## Prepare the recording set

The ready-made slate, passages, recording scripts, annotation rules and manifest builder are in
the [corpus kit](reading-bias-corpus/README.md). This section states the requirements it meets.

Each recording has one tested tag. To cover two present and two absent recordings for **each**
of `th_sound` and `linking`, this format needs at least eight distinct recordings (exceeding the
roadmap minimum of six). Use at least two speakers and at least two recordings with known errors
outside the tested tag. Do not duplicate one audio file under multiple labels.

Fix the ground truth before calling the grader. Describe a scripted construction or a human
annotation in `groundTruth`; never use the grader's own output. Review even constructed/TTS
samples to ensure that the supposed absent weakness is actually absent. The tool validates the
annotation structure and coverage, not the truth of a listener's judgement.

For each recording, provide:

```json
{
  "id": "speaker-a-th-negative-1",
  "speaker": "speaker-a",
  "audio": "audio/speaker-a-th-negative-1.mp3",
  "audioSha256": "<64 lowercase hexadecimal characters from sha256sum/shasum>",
  "passage": "Three thin students wait at a bus stop.",
  "durationSeconds": 4.2,
  "testedTag": "th_sound",
  "weaknessPresent": false,
  "groundTruth": "<human annotation or construction, fixed before running>",
  "brief": "<full rendered candidate context, at most 1800 characters, asserting this weakness>",
  "persistentIssues": ["<the same weakness expressed as a legacy profile phrase>"],
  "otherErrors": [
    {"kind": "mispronunciation", "quote": "students", "start": 11, "end": 19}
  ]
}
```

Wrap the records in `{"version": 1, "model": "<pinned model>", "recordings": [...]}`. The example
is a shape illustration, **not labelled audio or ground truth**. Audio paths are relative to the
manifest. Offsets are JavaScript string offsets, matching Reading's stored highlights. `otherErrors`
may be empty on most recordings; each listed error must have an exact quote and must not be
attributed to the recording's tested tag. Fix both the candidate brief and legacy phrases before
running, with equivalent weakness claims; the tool cannot verify their semantic equivalence.

Use synthetic learner assertions, not private profiles. The candidate brief must use the shared
context contract and the exact projection intended for rollout. A pass on a hand-written weak
assertion does not authorize a stronger or differently shaped production brief. A change to the
model, prompt or candidate projection requires a new registered experiment.

Commit the completed manifest before the first run. Audio may remain local: its bytes are pinned
by SHA-256 in the committed manifest. This records what was tested without publishing recordings.
The CLI refuses a live run if the manifest or experiment implementation differs from HEAD, or an
audio hash differs.

## Run

Validate first; this does **not** call a model or read a key:

```bash
pnpm exec tsx scripts/grader-bias.ts --manifest docs/spikes/my-reading-corpus.json
```

Preliminary screen (repeat with no `--brief`, a false brief, and a true brief, using different labels):

```bash
pnpm exec tsx scripts/grader-variance.ts --audio /path/sample.mp3 --passage /path/passage.txt --brief /path/false-brief.txt --label false-brief --runs 5
```

A stable preliminary result cannot enable Reading. Full experiment, after the manifest commit:

```bash
pnpm exec tsx scripts/grader-bias.ts --manifest docs/spikes/my-reading-corpus.json --run
```

Eight recordings take **120 model calls**: 8 × 5 × 3. The model is pinned in the manifest;
`GEMINI_API_KEY` and optional `GEMINI_BASE_URL` come from the environment or `.dev.vars`. The
conditions rotate across recordings and repeats. There is no adaptive stopping on an unfavorable
result. API/parsing failures stop the run, preserve an incomplete record, and cannot yield a pass.
Do not cherry-pick a successful subset or discard failed complete experiments.

Reports go to a new timestamped directory under `docs/spikes/`, or a new `--out-dir`. Outputs:

- `runs.json`: completion status, manifest/production-module/prompt hashes, scores and normalized
  highlight locations. No brief text, API key, or raw model commentary.
- `summary.json` and `report.md`: both comparisons and per-recording shifts. Missing or duplicate
  calls prevent a summary. Exit 0 means both pass, 2 means at least one fails, 1 is an incomplete
  or invalid run. No exit code automatically enables anything.

## Metrics and limits

Thresholds match the roadmap: absolute pooled mean overall-score shift ≤ 2, absolute per-recording
mean shift ≤ 4, pooled absent-tag accuracy decline ≤ 0.05, and pooled other-error recall decline
≤ 0.10. Accuracy pools hits/exposure from production attribution. Recall counts a known error once
per run when a highlight of the correct kind has a passage-valid quoted span overlapping that
error. Normalization uses Reading's existing eight-highlight cap.

Scores pool equally because every recording has five runs. Tag accuracy pools by exposure; recall
pools by annotated errors. The report includes baseline accuracy/recall so an insensitive baseline
is visible. These are pre-registered working gates, not a significance test, proof of grader quality,
or evidence for changing measurement weights. A baseline that misses all known errors can be stable
but uninformative; report that limitation to the owner rather than claiming robust quality.

Record both comparisons even if the brief fails. Report any failure to the owner; changing limits
or choosing the proposal's fallback is the owner's decision. Existing `persistent_issues` injection
continues until that decision; the **new** Reading brief remains unconnected.

## Tool verification, not a bias result

Pure tests cover balanced-corpus validation, false-positive attribution, stable eight-point bias,
cancelling pooled shifts, crowded-out errors, missing/duplicate runs, strict parsing and parity
with production prompts. CLI dry runs can verify manifests without model calls. No qualifying
recording corpus has been supplied, so no Reading bias result is claimed.
