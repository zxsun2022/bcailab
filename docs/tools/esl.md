# ESL Tool

ESL is an authenticated English-learning workspace under `/esl`.

Checkpoint status (March 5, 2026): **Reading / Recitation v2 redesign complete**, while Dictionary and Writing are still planned.

## Live Routes
| Page | Route | Key behaviour |
|------|-------|---------------|
| ESL home | `/esl` | Auth required. Shows sub-tool cards and current availability. |
| Reading layout | `/esl/reading` | Layout route with left sidebar (passage list). |
| Reading index | `/esl/reading` (index) | Create passage form (auto-generated title via Gemini Flash Lite). |
| Reading practice | `/esl/reading/:id` | Two-column: center (passage text + recording) and right (evaluation panel). |
| Attempt audio stream/download | `/esl/audio/:attemptId` | Auth required. Owner-only playback/download endpoint. |

## Reading / Recitation (v2)

### Layout
- **Left sidebar** (desktop 1024px+): Passage list with titles, content preview, dates. "New passage" button.
- **Center column**: Passage text (auto-hidden in recitation mode), mode toggle (Reading/Recitation), recording controls with large circular record button, timer, preview/submit flow.
- **Right column**: Evaluation panel with overall score, score bars, commentary, progress trend, highlights, history list.

### Passage Management
- Create passage with only content text; title auto-generated via `gemini-2.0-flash-lite`.
- Passage content is normalized to LF line endings before storage.
- Max passage length: `8,000` characters (`MAX_ESL_PASSAGE_CHARS`).

### Practice Workflow
- Mode toggle: Reading (text visible) / Recitation (text auto-hidden).
- Recording only (no file upload): large circular record button with pulsing animation.
- Timer tracks elapsed time during recording.
- After recording: preview playback, re-record, or submit.
- Duration tracked client-side (`durationMs`) and stored in database.
- Max audio size: `20 MB` (`MAX_ESL_READING_AUDIO_BYTES`).

### Evaluation Pipeline
- Attempt is stored first (R2 + D1), then evaluated synchronously in the action.
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
- Default: shows latest attempt's evaluation
- History list: click to switch evaluation display to any past attempt
- Score trend: mini bar chart showing overall scores across all attempts
- Audio playback: each attempt's audio plays within the right panel

### Delete Behaviour
- Attempt deletion uses native `confirm()`.
- Server deletes R2 object first, then soft-deletes attempt row (`deleted_at`).

## Data Model & Storage

### Actively Used in Reading
- D1:
  - `esl_passages`
  - `esl_reading_attempts` (includes `duration_ms`)
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
- Passage edit/delete UX
- Learner profile update via Gemini (every N evaluations)
