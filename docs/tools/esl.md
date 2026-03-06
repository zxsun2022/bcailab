# ESL Tool

ESL is an authenticated English-learning workspace under `/esl`.

Checkpoint status (March 5, 2026): **Reading / Recitation v2 redesign complete**, while Dictionary and Writing are still planned.

## Live Routes
| Page | Route | Key behaviour |
|------|-------|---------------|
| ESL home | `/esl` | Auth required. Shows sub-tool cards and current availability. |
| Reading layout | `/esl/reading` | Layout route with left sidebar (passage list). |
| Reading index | `/esl/reading` (index) | Create a new passage and submit the first attempt in one page. |
| Reading practice | `/esl/reading/:id` | Two-column: center switches between new-attempt composer and attempt detail; right rail is history only. |
| Attempt audio stream/download | `/esl/audio/:attemptId` | Auth required. Owner-only playback/download endpoint. |

## Reading / Recitation (v2)

### Layout
- **Left sidebar** (desktop 1024px+): Passage list with titles only. "New passage" button. Passage deletion lives in the hover menu on each list item.
- **Index center column**: New passage composer with editable text area and sticky recording controls at the bottom.
- **Passage center column**: Either a new-attempt composer (read-only passage text) or a selected attempt detail view.
- **Right column**: History rail only, with a persistent `New Attempt` button at the top.

### Passage Management
- Create passage with content text plus the first recording in a single submit; title auto-generated via `gemini-2.0-flash-lite`.
- Passage content is normalized to LF line endings before storage.
- Max passage length: `8,000` characters (`MAX_ESL_PASSAGE_CHARS`).
- Passage deletion is available from the passage list item menu and removes the passage plus all stored attempts for that passage.

### Practice Workflow
- New passage flow: paste passage text, record once, submit, then redirect into that first history entry.
- Existing passage flow: click `New Attempt` in the history rail to open the read-only recording composer for that passage.
- Mode toggle: Reading / Recitation. In recitation mode, existing-passage composers hide the passage text.
- Recording composer uses a compact bottom control bar: mode toggle, recorder state, preview playback, re-record, and submit.
- Timer tracks elapsed time during recording.
- After submit, the page first shows an upload/saving status, then navigates into the saved attempt page where AI pending/completed state is shown.
- Duration tracked client-side (`durationMs`) and stored in database.
- Max audio size: `20 MB` (`MAX_ESL_READING_AUDIO_BYTES`).

### Evaluation Pipeline
- Attempt is stored first (R2 + D1), then evaluated asynchronously in a background `waitUntil` task.
- New attempts redirect immediately to their detail page with a pending state while evaluation is running.
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
  - `top_actions_zh` (2-3 actionable Chinese feedback items)
  - `highlights` with `text_span` (word-level pronunciation notes)
  - `next_drills` (practice exercises)
  - `commentary_zh` (freeform coach feedback in Chinese, can reference history)
  - `progress_vs_last` (delta observations vs previous attempt)
  - optional `cefr_guess` + `cefr_confidence`

### Learner Profile
- Table: `esl_learner_profiles` (one per user)
- Tracks: persistent_issues, strengths, CEFR estimate, total practice seconds, total attempts
- Counters incremented after each evaluation
- Profile data included in evaluation prompt for cross-passage continuity

### Right Panel Behaviour
- History rail always shows `New Attempt` at the top.
- History list: click any entry to switch the center column to that attempt's detail view.
- Pending and failed attempts stay in the rail with status labels until opened.

### Delete Behaviour
- Attempt deletion uses native `confirm()`.
- Attempt deletion removes the R2 object, hard-deletes that attempt's AI evaluations, then soft-deletes the attempt row (`deleted_at`).
- Passage deletion uses native `confirm()`.
- Server deletes every attempt audio object in R2 for that passage, hard-deletes all linked AI evaluations, soft-deletes all attempt rows, then soft-deletes the passage row.

## Data Model & Storage

### Actively Used in Reading
- D1:
  - `esl_passages`
  - `esl_reading_attempts` (includes `duration_ms`, `evaluation_status`)
  - `esl_reading_evaluations`
  - `esl_learner_profiles`
- R2 key pattern:
  - `esl/reading/{userId}/{yyyy}/{mm}/{attemptId}.{ext}`

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
