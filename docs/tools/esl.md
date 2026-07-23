# ESL Tool

ESL Reading now uses the canonical route `/reading`. Legacy `/esl`, `/esl/reading`, `/esl/reading/`, and `/esl/reading/*` URLs redirect to the same experience with HTTP `308` so old non-GET requests still preserve their method.

Checkpoint status (March 5, 2026): **Reading / Recitation v2 redesign complete**, while Dictionary and Writing are still planned.

## Live Routes
| Page | Route | Key behaviour |
|------|-------|---------------|
| ESL home (legacy) | `/esl` | Auth required. Redirects to `/reading`. |
| Reading layout | `/reading` | Layout route with left sidebar (own passages + library). |
| Reading catalogue | `/reading` (index) | Your passages, then the graded library by band. |
| New passage | `/reading/new` | Paste your own text and submit the first attempt in one page. |
| Reading progress | `/reading/progress` | Progress dashboard inside the center canvas with score trends, averages, and recent notes. |
| Reading settings | `/reading/settings` | Reading-specific settings page inside the center canvas. |
| Reading practice | `/reading/:id` | Desktop workspace shell: center stage switches between new-attempt composer and attempt detail; right rail is history/navigation only. |
| Reading status resource | `/reading/:id/status` | Auth required. Lightweight JSON status endpoint used for non-crashing pending-state polling. |
| Attempt audio stream/download | `/esl/audio/:attemptId` | Auth required. Owner-only playback/download endpoint. |
| Passage reference audio stream | `/esl/passage-audio/:id` | Auth required. Owner-only playback endpoint for the auto-generated reference TTS. |
| Anonymous trial | `/reading/trial` | **Public.** One-shot evaluation on a fixed sample passage, nothing persisted — see below. |

## Routes note (2026-07-21)

`/reading` used to *be* the new-passage composer. Creating moved to `/reading/new` and the
index is now a catalogue: the learner's own passages first, then the graded library by
band. Each library card states whether the passage also supports dictation, derived from
whether it has sentence audio.

Library passages carry a link into dictation for the same text — see
`docs/tools/dictation.md` for why the handoff lives on the practice screens rather than in
a browse surface.

## Material Library

Reading reads from the shared material layer (`passages`), not from reading-specific
tables — see `docs/material-layer-design.md`. The nav rail has two sections:

- **Your passages** — text the learner pasted in. Deletable, never tagged or banded
  (design §5.4), and never matched, since the learner chose it.
- **Library** — graded global material, `user_id IS NULL`, shared with Dictation. A
  passage can therefore be taken as dictation *and* read aloud. Read-only: there is no
  per-item menu, and delete requires ownership at the query level.

**Authorization is one predicate**, `getPassageForUser`: a passage is readable when it is
library content **or** owned by the caller. Every read path goes through that helper
rather than re-spelling the rule, because getting it wrong exposes one learner's passage
to another. Mutation is stricter — `softDeleteUserPassage` requires ownership, so library
material cannot be deleted by a learner who can see it.

The library is **signed-in only** (owner decision 2026-07-21); anonymous visitors get the
trial below rather than a browsable catalogue.

Completed evaluations record into `passage_stats` for library passages, which is how the
material layer accumulates measured difficulty. User passages are excluded — a passage only
one person practises cannot be calibrated.

## Anonymous Trial

`/reading/trial` lets a signed-out visitor record one attempt and get a real evaluation
before creating an account. It escapes the `/reading` layout (which calls `requireUser`)
via the `reading_.trial.tsx` route-name prefix.

- **Fixed sample passage, taken from the library.** `getTrialPassage` returns the row
  flagged `is_trial`, falling back to the oldest B1 library passage — a flag rather than a
  hardcoded id, so the choice changes with one UPDATE instead of a deploy, and a fallback
  because a freshly-seeded database has nothing flagged. The page renders that row and the
  action passes the same row's text to the evaluator, so the scored text always matches
  what was shown.
- **Nothing is persisted, including the audio.** The signed-in flow writes the recording to
  R2 and creates an attempt row *before* evaluating. The trial passes the audio bytes
  straight to `evaluateEslReadingAttempt` and lets them fall out of scope — there is no
  `trial/` R2 prefix to clean up and no deletion task that could fail and leave a recording
  behind. No attempt row, no evaluation row, and the learner profile is never read or
  written. The only write is the daily quota counter.
- **Evaluation runs inline**, not in a `waitUntil` background task, because there is no
  attempt row to poll — the result comes back in the action response and is rendered by the
  shared `EslEvaluation` component (extracted from `reading.$id.tsx` for this purpose).
- **Quota**: feature `reading_trial` in `feature_usage`, 5/day for anonymous visitors,
  counted against both the `bcailab_anon` cookie and the client IP. Charged only after a
  successful evaluation. Exceeding it renders a sign-in gate.
- **Signed-in users are redirected** to `/reading`; they have the real tool.
- Entry is the `/english` Reading module card, which points signed-out visitors here
  instead of opening the login popup.

## Reading / Recitation (v2)

### Layout
- **Left sidebar** (desktop 1024px+): Passage list with titles only. Pinned top actions: `New passage`, `Progress`. Passage deletion lives in the hover menu on each list item.
- **Left sidebar footer**: A persistent `Settings` entry opens `/reading/settings` in the center canvas.
- **Desktop workspace shell**: Reading now follows the shared tool-shell model used by Writing. The main area is split into `center stage + reading content column + right rail shell`.
- **Index center column**: New passage composer with a single large editable text area, internal character count, and recorder controls anchored at the bottom of the same compose card.
- **Passage center column**: Either a new-attempt composer or a selected attempt detail view, but both now share the same top skeleton.
- **Persistent passage context**: On `/reading/:id`, latest / history keep the read-only `Passage` context block as a separate section. In new-attempt compose mode, the passage lives inside the compose card and the recorder still stays at the bottom.
- **Right rail shell**: History/navigation only, docked to the far right edge of the main area. The shell owns the vertical divider and the rail width.
- **Desktop scroll ownership**: The primary page scroll belongs to the center stage, while the history list inside the right rail scrolls independently when it overflows.

### Passage Management
- Create passage with content text plus the first recording in a single submit; title auto-generated via `gemini-2.5-flash-lite` with `thinkingBudget=0`.
- Passage content is normalized to LF line endings before storage.
- Max passage length: `8,000` characters (`MAX_ESL_PASSAGE_CHARS`).
- Passage deletion is available from the passage list item menu and removes the passage plus all stored attempts for that passage.

### Practice Workflow
- New passage flow: paste passage text, record once, submit, then redirect into that first history entry.
- Existing passage flow: click `New Attempt` in the history rail to open the read-only recording composer for that passage.
- When recording a new attempt for an existing passage, the compose view uses one card: title/briefing, passage block, then recorder at the bottom.
- Mode toggle: Reading / Recitation. On the new-passage page, recitation mode keeps the textarea shell but compresses the hidden-state footprint. On existing passages, recitation mode replaces the passage body with a shorter hidden-state panel inside the compose card.
- Recording composer keeps recorder states inline at the bottom of the compose card: idle, recording with timer, and preview with playback / re-record / submit.
- Timer tracks elapsed time during recording.
- Submit uses an in-page fetcher flow, so the browser does not enter a full-page loading state. The button switches to `Submitting...`, then the app navigates immediately into the saved attempt page.
- While submit/evaluation handoff is in progress, `Re-record` is disabled to avoid changing the captured audio mid-submit.
- Reading settings currently include `Output language` with `English` and `Chinese`. The preference is stored locally in the browser, defaults to English, and affects newly generated feedback plus manual retry-feedback requests.
- After the first successful submit for a passage, the app also synthesizes one background reference TTS in American English and attaches it to the passage.
- Reference synthesis can still complete on environments where passage-level TTS metadata columns are not yet available; the audio is stored under a deterministic R2 key and resolved directly from storage.
- Attempt detail exposes two compact players together: `Reference` (passage TTS) and `Your attempt` (uploaded recording).
- If a passage does not currently have a stored reference audio file, the first attempt detail load auto-queues a new background synthesis attempt. Clicking `Play` on `Reference` also queues/retries generation and shows an in-place preparing state until the file is ready.
- The compact players intentionally omit waveform/progress UI and explanatory subtext; state is communicated through the button label plus a small indicator dot (green pulse while playing, warm pulse while preparing).
- Reading timestamps render in the browser's local timezone instead of the server timezone. There is no separate ESL timezone setting.
- Duration tracked client-side (`durationMs`) and stored in database.
- Max audio size: `20 MB` (`MAX_ESL_READING_AUDIO_BYTES`).

### Evaluation Pipeline
- Attempt is stored first (R2 + D1), then evaluated asynchronously in a background `waitUntil` task.
- If an older environment is missing `evaluation_status`, the app still prefers background evaluation when `waitUntil` is available; pending state is inferred from the absence of feedback on a fresh attempt.
- Passage reference TTS is also generated asynchronously in the background after the first submit.
- New attempts redirect immediately to their detail page with a pending state while evaluation is running.
- If an attempt gets stuck without feedback (for example an interrupted request), the detail page exposes `Retry feedback` to enqueue evaluation again without re-recording, with an in-page requesting/evaluating state.
- Completed feedback shows a compact score summary: desktop uses a left overall-score panel plus right-side dimension grid; mobile stacks them vertically.
- Highlights render the explicit target word or phrase from `text_quote` when available, otherwise they fall back to a validated `text_span`. The UI suppresses obviously broken partial-word spans instead of showing misleading chips.
- Progress dashboard aggregates current non-deleted passages plus evaluated attempts, showing total passages, evaluated attempts, practice time, best score, overall-score trend, average subscores, recent AI progress notes, and recent passages with their latest score.
- Primary evaluator: Gemini (`GEMINI_MODEL`, default `gemini-flash-latest`).
- Hard fallback when Gemini fails: local heuristic evaluator (`model_name = local-heuristic-fallback`).
- Prompt includes:
  - Passage text and current audio
  - Recording duration in seconds
  - Last 3 full evaluations (structured JSON, no audio)
  - Older evaluations: scores + duration only
  - Learner profile (persistent issues and strengths) if available
- Evaluation output includes:
  - `scores` (overall/pronunciation/stress_rhythm/fluency/clarity)
  - `top_actions_zh` (2-3 actionable feedback items in the selected output language; field name remains unchanged for compatibility)
  - `highlights` with `text_span` + `text_quote` (target word/phrase offsets and the copied text itself, plus pronunciation/prosody notes)
  - `next_drills` (practice exercises)
  - `commentary_zh` (freeform coach feedback in the selected output language; field name remains unchanged for compatibility)
  - `progress_vs_last` (delta observations vs previous attempt)
  - optional `cefr_guess` + `cefr_confidence`
- Prompt constrains each highlight to the smallest relevant span, requires `text_quote`, and tells the model to name the exact target word or phrase inside `note_zh`.

### Learner Profile
- Table: `esl_learner_profiles` (one per user) — now the **shared** English-Studio learner
  profile, generalised beyond reading (migration 0014). See `docs/learner-model-design.md`.
- Tracks: persistent_issues, strengths, CEFR estimate, total practice seconds, total attempts,
  plus per-tag mastery (`tag_mastery_json`) and level self-selection
  (`cefr_declared` / `cefr_measured`).
- Counters incremented after each evaluation.
- Profile data included in evaluation prompt for cross-passage continuity. The
  persistent_issues/strengths fields, previously read-but-never-written, are now filled by the
  learner model's background naming pass.
- Reading also writes tag observations after each evaluation: the evaluation's highlights are
  mapped to the prosodic/phonetic subset of `passage_tags` and recorded as **`llm`-sourced**
  (down-weighted) signal in `learner_tag_observations`. User-supplied passages carry no tags,
  so reading on them writes no observations. Fails soft — never blocks an evaluation.

### Right Panel Behaviour
- History rail always shows `New Attempt` at the top.
- On the new-passage page, the desktop history rail starts collapsed when there are no attempts yet, so the empty rail does not dominate the layout.
- Desktop history rail is collapsible. Expanded mode shows the full history list; collapsed mode reduces the rail to the same `52px` width used by Writing.
- Desktop history rail collapse/expand animates the rail-shell width and fades the expanded rail body instead of swapping it instantly.
- History list is ordered newest to oldest.
- History list: click any entry to switch the center column to that attempt's detail view.
- Pending and failed attempts stay in the rail with status labels until opened.
- Collapsing the rail changes the desktop workspace allocation, but the evaluation content remains in the center column.
- When viewing an older attempt, the center column shows a lightweight history banner with a `Back to latest` action.

### Delete Behaviour
- Attempt deletion uses native `confirm()`.
- Attempt deletion removes the R2 object, hard-deletes that attempt's AI evaluations, then soft-deletes the attempt row (`deleted_at`).
- Passage deletion uses native `confirm()`.
- Server deletes the passage reference audio object in R2 (if present), every attempt audio object in R2 for that passage, hard-deletes all linked AI evaluations, soft-deletes all attempt rows, then soft-deletes the passage row.

## Data Model & Storage

### Actively Used in Reading
- D1:
  - `esl_passages`
  - `esl_reading_attempts` (includes `duration_ms`, `evaluation_status`)
  - `esl_reading_evaluations`
  - `esl_learner_profiles`
  - `learner_tag_observations` (written on evaluation; see Learner Profile above)
- R2 key pattern:
  - `esl/reading/{userId}/{yyyy}/{mm}/{attemptId}.{ext}`
  - `esl/reference/{userId}/{passageId}.mp3`

### Removed

`esl_learning_items` and `esl_item_observations` were created in `0003_esl.sql` for a
reading-v2 vision that never shipped and were never wired up. The shared learner model uses
`learner_tag_observations` (keyed on `passage_tags`) instead, and migration
`0015_drop_dormant_esl_tables.sql` drops them. They held no data.

## Configuration
- `GEMINI_API_KEY` (required for Gemini path)
- `GEMINI_MODEL` (optional, defaults to `gemini-flash-latest`)

## Planned (Not Yet Implemented)
- Dictionary (`/esl/dictionary`)
- Writing coach (`/esl/writing`, `/esl/writing/:id`)
- Attempt-to-attempt delta comparison UI
- Passage edit UX
- Learner profile update via Gemini (every N evaluations)
