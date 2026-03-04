# ESL Tool

ESL is an authenticated English-learning coach that groups multiple sub-tools under one product surface (`/esl`) while sharing a single learner profile and learning history.

**Initial rollout order**
1. Reading / Recitation (朗读 / 背诵)
2. Dictionary (AI 词典)
3. Writing (写作助手)

The default UI language is **Chinese**. A per-user setting can later allow switching the explanation language.

## Product Principles
- **Audio-first**: store and evaluate the **raw audio** (do not rely on transcript-only evaluation).
- **Versioned practice**: each passage/draft supports multiple attempts/versions for progress tracking.
- **Structured feedback**: all Gemini outputs must be validated against a JSON schema.
- **Learner profile, not long memory**: keep a short derived profile summary + retrieve only a few relevant prior items per request (avoid unbounded “memory.md” growth).
- **Private by default**: all ESL artifacts (audio, drafts) are private to the user; public sharing is out of scope.

## Sub-Tool 1: Reading / Recitation (MVP)

### User Stories
- As a learner, I can paste a passage and practice reading it aloud.
- As a learner, I can switch to **Recitation mode** where the text is hidden (with an explicit “Reveal” control).
- As a learner, I can record and submit multiple attempts for the same passage and see improvement over time.
- As a learner, I can delete an attempt (with a confirmation prompt).

### UX & Behaviour
- Passage creation: paste text (optional title/source).
- Practice page:
  - Mode toggle: **Reading** (text visible) / **Recitation** (text hidden by default).
  - Recording controls: start / stop / redo.
  - Submit attempt: uploads audio, then requests evaluation, then shows results.
  - Attempt list: shows timestamp + overall score + key notes; clicking an attempt opens details and playback.
  - Compare: default compares latest attempt vs previous attempt (delta on key metrics).
- Destructive actions:
  - Attempt deletion must use `confirm()` (consistent with other tools).

### Evaluation Requirements (Gemini Flash Latest)
- Inputs:
  - The original passage text (ground truth).
  - The raw audio attempt.
  - The user’s UI language preference (default Chinese).
  - A small set of retrieved prior issues for personalization (3–5 max).
- Outputs (must be JSON, schema-validated):
  - Rubric scores (overall + a few sub-scores).
  - 2–3 highest-impact improvement actions (Chinese).
  - Passage-linked issues (by `text_span`) so UI can highlight specific words/phrases.
  - Optional `cefr_guess` and `cefr_confidence` (profile remains unset until enough evidence).

### Suggested JSON Shape (MVP)
This is a contract for validation + storage; exact fields can evolve but should stay backward compatible.

```json
{
  "rubric_version": "2026-03-03",
  "ui_language": "zh",
  "scores": {
    "overall": 0,
    "pronunciation": 0,
    "stress_rhythm": 0,
    "fluency": 0,
    "clarity": 0
  },
  "cefr_guess": null,
  "cefr_confidence": 0,
  "top_actions_zh": ["...", "..."],
  "highlights": [
    {
      "kind": "mispronunciation",
      "severity": 1,
      "text_span": { "start": 0, "end": 0 },
      "note_zh": "..."
    }
  ],
  "next_drills": [
    {
      "drill_type": "repeat_sentence",
      "target_text": "...",
      "repeat": 3,
      "prompt_zh": "..."
    }
  ]
}
```

### Routes (Proposed)
| Page | Route | Key behaviour |
|------|-------|---------------|
| ESL home | `/esl` | Auth required. Links to sub-tools. |
| Reading home | `/esl/reading` | Create/list passages. |
| Practice | `/esl/reading/:id` | Record + submit + view attempts. |
| Audio stream/download | `/esl/audio/:attemptId` | Auth required. Owner-only playback/download endpoint. |

### Data & Storage (Proposed)
- D1 tables (minimal for Reading MVP):
  - `esl_passages`: user-authored passages.
  - `esl_reading_attempts`: one row per audio attempt.
  - `esl_reading_evaluations`: one row per model evaluation (JSON) linked to an attempt.
- R2 object storage:
  - Key pattern: `esl/reading/{userId}/{yyyy}/{mm}/{attemptId}.{ext}`
  - Store `contentType` (e.g. `audio/webm`, `audio/mp4`) for correct playback.
- Deletion:
  - Deleting an attempt deletes the R2 object then soft-deletes the D1 attempt row (`deleted_at`).

### Constraints (MVP)
- Enforce an upper bound on recording length and file size (to control latency/cost).
- Evaluate synchronously in the action for MVP (future: async job with progress polling).
- Gemini evaluation is primary; if provider call fails, fallback evaluation is used to avoid dropping the attempt feedback.

## Shared Learning Signals (“Mistake DB”)

To support learning curves and cross-tool personalization, ESL should maintain a shared error/skill store rather than only storing per-attempt JSON.

### Minimal Model
- `esl_learning_items`: normalized “learning points” (pronunciation/grammar/collocation/vocab/discourse).
  - `item_type`: `pronunciation | grammar | collocation | vocab | discourse`
  - `key`: stable unique key (e.g. `pronunciation:word:comfortable`, `grammar:article:a_vs_the`)
  - `display_zh`: short label for UI
- `esl_item_observations`: time-series observations for the learning curve.
  - `outcome`: `error | correct`
  - `severity`: small int (1–3) where applicable
  - `evidence`: `text_span` (and optionally audio time span) + short note
  - `created_at`: required for time-based decay / spaced repetition

### Why Track “Correct” Too
Learning curves and spaced repetition require evidence of improvement; only counting mistakes cannot distinguish “not practiced” from “mastered”.

## Sub-Tool 2: Dictionary (Planned)

### User Stories
- As a learner, I can input a word/phrase/sentence/paragraph and get an explanation in Chinese (default) or English (later setting).
- As a learner, I can see collocations, common mistakes, register variants (formal/neutral/spoken), and examples.

### Output Requirements
- Prefer structured sections so UI can render consistently:
  - meaning (context-aware), collocations, examples, common errors, synonyms by register, and a “try it” mini-exercise.

### Route (Proposed)
- `/esl/dictionary`

## Sub-Tool 3: Writing (Planned)

### User Stories
- As a learner, I can write an English draft and submit it for high-quality feedback (Chinese default).
- As a learner, I can submit a revised version and see what improved and what still needs work.

### Key Behaviour
- Versioned drafts: each submission becomes a new version linked to the same writing thread.
- Feedback must be actionable:
  - categorize issues, give examples, provide a short “next revision plan”
  - optionally provide a model rewrite (separate mode/button)

### Routes (Proposed)
| Page | Route | Key behaviour |
|------|-------|---------------|
| Writing home | `/esl/writing` | Create/list writing threads. |
| Writing thread | `/esl/writing/:id` | Submit new version + view feedback history. |

## Provider & Configuration (Gemini)
- Model default: `gemini-flash-latest` (exact model id is configuration, not hard-coded).
- Server-side calls only (no client-exposed keys).
- Environment variables:
  - `GEMINI_API_KEY`
  - `GEMINI_MODEL` (default: `gemini-flash-latest`)

## Milestones (Suggested)
- Phase 1 (Reading MVP):
  - Passage CRUD (create/list; edit optional)
  - Record/upload audio attempt, store in R2
  - Gemini evaluation + schema validation + persist results
  - Attempt history + compare latest vs previous
  - Attempt delete (confirm + R2 + soft-delete)
- Phase 2 (Dictionary MVP):
  - Dictionary page + Gemini explain
  - Save-to-notebook (optional) + create learning items/observations
- Phase 3 (Writing MVP):
  - Writing threads + version submissions
  - Gemini feedback + structured rubric + version compare

## Out of Scope (For Now)
- Public sharing of ESL artifacts
- Fully automated “agentic” planning across tools (keep explicit workflows first)
- Long-running background job system (use synchronous evaluation first; add jobs only if needed)
