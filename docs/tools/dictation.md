# Dictation Tool

Listening practice: the learner hears a passage one sentence at a time, types what they hear, and
gets deterministic per-sentence scoring plus (signed-in only) LLM feedback on their error
patterns. Fills the "listen" slot of English Studio. Like Translate, it is anonymous-friendly and
acts as an acquisition funnel.

Technical design: `docs/dictation-v1-design.md`.

## Live Routes
| Page | Route | Key behaviour |
|------|-------|---------------|
| Library | `/dictation` | Public. Passages grouped by CEFR band; signed-in users see their best accuracy per passage. |
| Session | `/dictation/:passageId` | Public, quota-gated. Sentence stepper, then summary. |
| Audio | `/dictation/audio/:sentenceId` | **Public** MP3 stream. No auth check — see "Audio" below. |
| Feedback status | `/dictation/attempt/:attemptId/status` | Authenticated. Poll target for the summary's feedback panel. |

The tool uses the shell pattern with a left rail (library nav + attempt history) and no right
rail. The shell is public, so `ToolNavRail` accepts a null user and renders a sign-in button.

## Content Model

Passages live in the shared material layer (`passages` / `passage_sentences`), not in
dictation-specific tables — see `docs/material-layer-design.md`. Library content is marked by
`user_id IS NULL`; one row serves every learner and can also be practised aloud in Reading.

Dictation only ever serves **library** material, for signed-in and anonymous learners alike,
so its lookups go through `getLibraryPassageById` rather than the ownership-aware
`getPassageForUser`. Dictation on user-supplied text remains out of scope.

Because a passage row is shared, it accumulates per-passage accuracy statistics in
`passage_stats` for future difficulty calibration (see the Dictation v2 roadmap entry).
Anonymous attempts count toward those statistics: the row carries no identity, and it is a
fact about the passage rather than the learner.

The library is seeded offline by `scripts/material-seed/` (generate → human review → publish →
tag); there is no admin UI and no runtime generation. See that directory's README for the
workflow and the review policy. Initial library: 20 passages, 5 each at A2/B1/B2/C1,
211 sentences.

`tag.ts` derives difficulty metrics and feature tags from passage text **deterministically** —
by code, never by a model — so tagging is reproducible, free to recompute, and cannot drift
between batches. Re-running it after a vocabulary change is the intended workflow.

## Audio

Per-sentence MP3s are synthesized offline via Google TTS (Chirp3 en-US, gender alternating per
passage) and stored in R2 under `dictation/{passageId}/{idx}.mp3`.

`/dictation/audio/:sentenceId` serves them with **no auth check** and
`Cache-Control: public, max-age=31536000, immutable`. This is deliberately different from
`/speech/audio/:id` and `/esl/audio/:id`, which serve private user recordings. Dictation audio is
global content, id-addressed, and never rewritten — a regenerated passage gets a new id. The
sentence lookup joins the passage, so unpublished or soft-deleted material stops being served.

Range requests are not supported in v1 (clips are a few seconds); it stays on the Later
engineering list. Playback speed is client-side `playbackRate` (0.75× / 1×), not a second
synthesis.

**Playback never starts on its own when the page loads.** Landing on a session is not
consent to hear audio, and browser autoplay policy would make it inconsistent anyway
(blocked before any user gesture, allowed after). The first listen is always a click.
Once the learner has played something, advancing to the next sentence autoplays, which
keeps the practice rhythm going without a click per sentence.

The play button carries the state: `Play` → `Loading…` → `Playing…` → `Replay`, with a
progress bar filling underneath and a listen count once a sentence has been heard more
than once.

`replays` in the stored result means listens **beyond the first**, so a sentence heard
once reports 0. The UI tracks total listens and subtracts one on submit — that way the
field means the same thing whether playback started by click or by advancing.

## Progress and resume

An attempt row exists from the **first checked sentence**, not only on completion, so
stopping partway keeps the work. Reopening a passage restores the answers already given
and returns the learner to where they stopped; finishing sets `status = 'completed'`,
which is what makes the next visit start fresh rather than resuming a finished passage.

Partial attempts are deliberately excluded from `passage_stats`: a running score over the
sentences checked so far is not comparable with a finished attempt's, so counting it would
distort measured difficulty. For the same reason the rail shows an unfinished attempt as
`3/11 · resume` rather than a percentage.

Anonymous practice remains session-only.

## Learner model

On completion, a signed-in attempt also feeds the shared learner model: its diff ops are
attributed to the `passage_tags` vocabulary (reusing the tagger's own per-word predicates, so
"a word carries tag T" means one thing everywhere) and written to `learner_tag_observations`
as `deterministic` signal — dictation is the precise instrument. These aggregate into the
`/english/progress` profile and drive the measured CEFR estimate. Attribution and aggregation
fail soft: the attempt is already committed, so a learner-model failure never fails practice.
See `docs/learner-model-design.md`.

## Shell and cross-mode handoff

`/dictation` is a catalogue and keeps the nav rail. `/dictation/:passageId` drops it:
while a learner is listening and typing, a column of other passages competes for attention
rather than providing context.

After finishing, the summary offers the same passage as **reading practice**. The learner
knows the words at that point, which is when reading it aloud is the natural next step —
a real pedagogical sequence rather than a cross-sell. Reading offers the reverse handoff
for any library passage with sentence audio, which is what determines whether a passage
can be dictated at all.

## Quotas

Defined in `apps/web/app/utils/feature-quota.server.ts` under feature `dictation`; counters live
in the D1 `feature_usage` table (one row per feature per subject per UTC day).

| Tier | Identified by | Passages/day |
|------|---------------|--------------|
| Anonymous | `bcailab_anon` cookie **and** client IP (both counted; the higher count wins) | 30 |
| Signed-in | user id | 100 (invisible abuse cap) |

- Quota is charged **once per session, on the first sentence check** — not on page view, so
  browsing the library is free.
- Limits are generous because a v1 session costs nothing at runtime: audio is pre-generated and
  LLM feedback is signed-in only. They only bound scripted abuse.
- Exceeding the limit renders a friendly gate with a sign-in CTA (anonymous) rather than an error.
- Audio endpoints are **not** quota-gated.

`feature_usage` is the generic table for new features; `translate_usage` stays on its own table
(consolidating them is a Later engineering item).

## Scoring

`apps/web/app/utils/dictation-diff.ts` — a pure module with no server or DOM dependencies.

- **Normalize**: lowercase, collapse whitespace, drop punctuation except intra-word apostrophes
  and hyphens (so "don't" and "twenty-five" stay single tokens).
- **Align**: token-level Levenshtein with backtrace, producing `match | substitute | delete |
  insert` ops (delete = a word the learner missed, insert = an extra word they typed).
- **Score**: `accuracy = matches / referenceTokenCount` per sentence; passage accuracy is
  reference-token-weighted across sentences.
- **Spelling equivalence**: British and American spellings both count as correct (a dictionary of
  common variant pairs plus `-our-`→`-or-` and `-ise`→`-ize` suffix rules). Comparison only —
  displayed tokens keep their original spelling.
- **Flooding guard**: extra words cost nothing while the answer stays under 2× the reference
  length; beyond that each overflow token cancels a match, so pasting a wall of text cannot score.

**Scoring is server-side.** Reference text is never sent to the client — it would let the learner
read the answer from page source — so each "check" round-trips to the route action. This deviates
from the original design §5/§7 (which specified a client-side instant diff) and was confirmed by
the owner 2026-07-20. The module stays pure so it can move client-side if that trade-off changes.

## Attempts & Feedback

Attempts are stored **for signed-in users only**. Anonymous results are session-only: nothing is
written to D1, and the summary shows a sign-in CTA instead.

`dictation_attempts.sentence_results` holds JSON per sentence:

```json
[{ "idx": 0, "userText": "...", "accuracy": 0.9, "replays": 2,
   "ops": [{ "op": "substitute", "ref": "their", "got": "there" }] }]
```

Only non-`match` ops are stored. **This shape is a stable contract** — it is the observation
format Dictation v2 aggregates, so changing it means migrating attempt rows. Keep it minimal and
factual: raw ops, no interpretations.

LLM feedback (`apps/web/app/utils/dictation-feedback.server.ts`, task `dictation_feedback`) runs
in a background `waitUntil` task after the attempt is committed, filling the `feedback_json`
null slot that the summary polls. Input is the non-match ops plus the CEFR band — never audio.
Output is 2–4 error patterns, each `{ pattern, evidence, tip }`.

- The deterministic diff **measures**; the model only **names the patterns**.
- A flawless attempt skips the call entirely.
- Failure never fails the attempt: the row is already stored, the error is logged for
  `wrangler tail`, and the panel is simply absent. The client stops polling after ~30s.

## Data & Deletion
- `dictation_passages` / `dictation_sentences`: global content, soft-deletable via `deleted_at`
  on the passage. Seeded offline; not user-deletable.
- `dictation_attempts`: per-user, soft delete via `deleted_at`. No delete UI in v1.
- `feature_usage`: daily counters keyed by `(feature, subject, day)`; no personal content.
- Anonymous sessions persist nothing at all beyond the quota counter.
- R2 `dictation/` objects are content, not user data, and are not deleted with any user.

## Constraints (v1)
- No dynamic per-user material generation — that is v2, and v2 does *matching* against a larger
  pre-generated library rather than runtime generation.
- No word-level audio/text sync highlighting (Chirp3 provides no word timepoints).
- Dictation does **not** read or write `esl_learner_profiles` (a v2 concern).
- No admin UI for content management.
- Single synthesized speed, en-US only.
