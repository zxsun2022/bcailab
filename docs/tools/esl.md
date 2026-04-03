# ESL Tool

ESL Reading now uses the canonical route `/reading`. Legacy `/esl`, `/esl/reading`, `/esl/reading/`, and `/esl/reading/*` URLs redirect to the same experience with HTTP `308` so old non-GET requests still preserve their method.

Checkpoint status (March 5, 2026): **Reading / Recitation v2 redesign complete**, while Dictionary and Writing are still planned.

## Live Routes
| Page | Route | Key behaviour |
|------|-------|---------------|
| ESL home (legacy) | `/esl` | Auth required. Redirects to `/reading`. |
| Reading layout | `/reading` | Layout route with left sidebar (passage list). |
| Reading index | `/reading` (index) | Create a new passage and submit the first attempt in one page. |
| Reading settings | `/reading/settings` | Reading-specific settings page inside the center canvas. |
| Reading practice | `/reading/:id` | Desktop workspace shell: center stage switches between new-attempt composer and attempt detail; right rail is history/navigation only. |
| Reading status resource | `/reading/:id/status` | Auth required. Lightweight JSON status endpoint used for non-crashing pending-state polling. |
| Attempt audio stream/download | `/esl/audio/:attemptId` | Auth required. Owner-only playback/download endpoint. |
| Passage reference audio stream | `/esl/passage-audio/:id` | Auth required. Owner-only playback endpoint for the auto-generated reference TTS. |

## Reading / Recitation (v2)

### Layout
- **Left sidebar** (desktop 1024px+): Passage list with titles only. "New passage" button. Passage deletion lives in the hover menu on each list item.
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
- Table: `esl_learner_profiles` (one per user)
- Tracks: persistent_issues, strengths, CEFR estimate, total practice seconds, total attempts
- Counters incremented after each evaluation
- Profile data included in evaluation prompt for cross-passage continuity

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
- R2 key pattern:
  - `esl/reading/{userId}/{yyyy}/{mm}/{attemptId}.{ext}`
  - `esl/reference/{userId}/{passageId}.mp3`

### Provisioned for Future ESL Modules
- `esl_learning_items`
- `esl_item_observations`

These are created in migration `0003_esl.sql` but not yet surfaced in current Reading UI workflows.

## Configuration
- `GEMINI_API_KEY` (required for Gemini path)
- `GEMINI_MODEL` (optional, defaults to `gemini-flash-latest`)

## Planned (Not Yet Implemented)
- Dictionary (`/esl/dictionary`)
- Writing coach (`/esl/writing`, `/esl/writing/:id`)
- Attempt-to-attempt delta comparison UI
- Passage edit UX
- Learner profile update via Gemini (every N evaluations)
