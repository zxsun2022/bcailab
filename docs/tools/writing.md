# Writing Coach

AI-powered iterative writing coach. Users submit a piece of writing, receive structured feedback, revise, and resubmit — repeating the cycle until their writing meets the standard they are aiming for. The AI acts as an editor, not a ghostwriter: it identifies what to improve and why, but the user does the rewriting.

## Design Principles

- **Coach, not ghostwriter.** AI identifies issues; user executes revisions. The product never rewrites text on behalf of the user during a session.
- **Coach-grounded feedback.** Every piece of feedback is anchored to a selected coach. There is no single generic "good writing" standard.
- **Deliberate difficulty.** The tool surfaces the user's actual weaknesses, not confirms existing strengths.
- **Minimum viable friction.** Selecting a coach and submitting text should take under 30 seconds. The cognitive load is in the writing, not the interface.

## Routes

| Page | Route | Behaviour |
|------|-------|-----------|
| Writing layout | `/writing` | Auth required. Three-column shell with article list sidebar. |
| Writing index | `/writing` (index) | Create a new article: choose a coach, write the first draft, submit. |
| Writing settings | `/writing/settings` | Writing-specific settings page opened inside the center canvas. |
| Article detail | `/writing/:id` | Editor + feedback panel + revision history rail. |
| Status resource | `/writing/:id/status` | Auth required. JSON endpoint for feedback status polling. |

## Layout

Three-column collapsible shell. The layout is designed to be extracted into a reusable `ToolShell` pattern once validated.

### Columns

- **Left panel — Navigation rail**: All user articles sorted by `updated_at` DESC. Each entry shows title plus coach badge. "+ New article" button at the top. A persistent `Settings` entry sits at the bottom. Article deletion via hover three-dot menu with `confirm()`.
- **Center — Main workspace**: Editor (textarea) at top with word count footer. Feedback panel below showing structured annotation cards and round summary. The new-article composer places the `Coach` selector to the left of the submit button.
- **Right panel — Revision timeline**: All rounds for the current article. Each entry shows round number, timestamp, score summary. Clickable to view past rounds. Active round highlighted.

### Responsive Behaviour

| Breakpoint | Left panel | Right panel |
|------------|-----------|-------------|
| < 1024px (mobile) | Hidden; overlay via toggle button | Hidden; overlay via toggle button |
| 1024–1280px | Visible, 220px | Hidden; expandable via toggle button |
| > 1280px | Visible, 240px | Visible, 240px |

Both panels have a collapse/expand toggle button. Collapse state is persisted in `localStorage`.

## Data Model

### Migration: `0007_writing.sql`

```sql
CREATE TABLE writing_articles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  title TEXT,
  agent_type TEXT NOT NULL DEFAULT 'ielts_task2',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE writing_revisions (
  id TEXT PRIMARY KEY,
  article_id TEXT NOT NULL REFERENCES writing_articles(id),
  user_id TEXT NOT NULL,
  round_number INTEGER NOT NULL,
  user_text TEXT NOT NULL,
  word_count INTEGER NOT NULL DEFAULT 0,
  feedback_json TEXT,
  feedback_status TEXT NOT NULL DEFAULT 'pending',
  model_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_writing_articles_user ON writing_articles(user_id, created_at DESC);
CREATE INDEX idx_writing_revisions_article ON writing_revisions(article_id, round_number);
```

### Storage

- D1 only. No R2 needed for V0 (text-only, no binary assets).

## Coaches

Each coach embeds a writing evaluation standard. Coach = Writing Purpose + Evaluation Criteria + Feedback Tone. Coaches are defined in code (`utils/writing-agents.ts`), not in the database.

### V0 Coach Roster

| Coach | Evaluation Standard | Feedback Focus |
|-------|-------------------|----------------|
| General | General writing rubric | Clarity, structure, style, grammar |
| IELTS Tutor | IELTS Task 2 Band 7–9 descriptors (TR, CC, LR, GRA) | Argument coherence, lexical range, grammatical accuracy |

### Coach Definition Schema

```typescript
type WritingAgent = {
  id: string;            // e.g. "ielts_task2"
  label: string;         // e.g. "IELTS Tutor"
  description: string;
  dimensions: string[];  // evaluation dimensions
  rubric: string;        // full rubric text injected into prompt
  tone: string;          // feedback tone description
  minWords: number;      // minimum word count for submission
  maxWords: number;      // maximum word count for submission
};
```

### Future Coaches (V1+)

Academic Writing, Business Writing, Fiction (Short Story), Diagnosis Mode.

## Article Title

- Title is optional on creation. If the user leaves it blank, a title is auto-generated via `gemini-flash-lite-latest` (same pattern as passage title generation in Reading) after the first round submission.
- Generated title: 2–8 words, max 60 characters, plain text.
- Title is displayed as an inline-editable field in the article detail page header. The default state shows the title as plain text; clicking it (or clicking a small pencil icon beside it) switches to an input field. Pressing Enter or blurring the input saves via fetcher. Pressing Escape cancels the edit.
- Title updates use a fetcher POST to the article detail route with `_intent=updateTitle`.

## Editor

### V0: Plain Textarea

- Uses the project's `Source Serif 4` body font for a clean writing experience.
- Word count displayed in a footer bar below the editor, updated on every keystroke.
- IELTS Task 2: minimum 250 words, maximum 400 words. Word count indicator turns amber below minimum, red above maximum. Submit is allowed regardless (the AI feedback will address length issues).

### V1+: Rich Text Editor

When coaches requiring formatting (Business Writing, Academic) are added, migrate to Tiptap with markdown serialization. The AI always receives plain text or markdown for evaluation.

## Feedback Structure

### AI Response Schema

```json
{
  "annotations": [
    {
      "severity": "critical | improvement | strength",
      "dimension": "grammar | argument | lexis | cohesion | register",
      "quoted_text": "the specific text being referenced",
      "diagnosis": "what the issue is",
      "guiding_question": "a question to guide revision, not a rewrite"
    }
  ],
  "round_summary": {
    "critical_count": 2,
    "improvement_count": 3,
    "strengths_count": 2,
    "overall_comment": "coaching summary for this round",
    "band_estimate": "6.5"
  },
  "delta": {
    "resolved": ["issues resolved since last round"],
    "new_issues": ["newly identified issues"],
    "improvement_note": "overall progress observation"
  }
}
```

### Design Decisions

- `quoted_text` instead of character offsets: more reliable from Gemini, tolerant of whitespace normalization. Frontend uses text search to highlight matches.
- `delta` is only populated from Round 2 onward. The AI receives the previous round's feedback in the prompt to compute delta.
- Each annotation includes a `guiding_question` — never a rewrite. This enforces the "coach, not ghostwriter" principle.

### Feedback Display

- Annotations grouped by severity: Critical (red accent), Improvement (amber), Strength (green).
- Each card shows: quoted text (highlighted), diagnosis, guiding question.
- Round summary at the bottom with overall comment and band estimate.
- Delta section (from Round 2): "Resolved" items with strikethrough styling, "New issues" highlighted.

### Feedback Language

Same as Reading tool:
- User selects feedback language (Chinese / English) from `/writing/settings`.
- Preference stored in `localStorage`, defaults to English.
- Controls the language of `diagnosis`, `guiding_question`, `overall_comment`, and `delta` strings.
- The user's writing text language is not affected.

## Evaluation Pipeline

Follows the same async pattern as Reading:

1. User submits text → creates a `writing_revision` with `feedback_status: 'pending'`.
2. Gemini evaluation fires in a `waitUntil` background task.
3. Frontend polls `/writing/:id/status` for feedback completion.
4. On completion, `feedback_json` and `model_name` are written; `feedback_status` set to `'completed'`.
5. If Gemini fails, `feedback_status` set to `'failed'`; user sees a "Retry feedback" button.

### Prompt Structure

- System context: coach rubric, feedback tone, JSON schema, rules ("never rewrite, only diagnose and question").
- User content: Current text, word count, previous round's feedback (if any), revision history summary (scores from older rounds).
- Feedback language directive (Chinese or English).
- Model: `gemini-flash-latest` (same env var `GEMINI_MODEL` as Reading).
- Generation config: `responseMimeType: "application/json"`, `temperature: 0.3`.

## Interaction Flows

### Flow A — New Article

1. User navigates to `/writing`. Empty state shows "Start your first writing session".
2. Clicks "+ New article" in left panel.
3. Writes in the textarea and chooses a `Coach` in the action row beside the submit button.
4. Redirected to `/writing/:id` with the newly created article.
5. Text saved as Round 1 (`feedback_status: 'pending'`). Title auto-generated in background if not provided.
6. Button shows "Analyzing..." state. Frontend polls status endpoint.
7. Feedback appears in the panel below the editor.
8. Round 1 appears in the right revision timeline.

### Flow B — Revision

1. User reads feedback. Clicks annotation cards to review diagnosis and guiding question.
2. Edits text in the editor.
3. Clicks "Submit revision".
4. Saved as Round N+1. AI receives previous round's feedback for delta computation.
5. New feedback appears with delta section: "2 critical issues resolved, 1 new improvement identified".
6. Right panel updates with new round entry.

### Flow C — View Past Round

1. Clicks a past round in the right revision timeline.
2. Editor switches to **read-only**, showing that round's text.
3. Feedback panel shows that round's feedback.
4. Header shows "Viewing Round 1 of 3" with a "Back to latest" button.
5. Clicking "Back to latest" returns to the current editable state.

### Flow D — Manage Articles

1. Left panel lists all articles sorted by `updated_at` DESC.
2. Each entry: title plus coach badge.
3. Bottom of the rail includes a persistent `Settings` entry that opens `/writing/settings` in the center canvas.
4. Hover reveals three-dot menu → "Delete article" (native `confirm()` dialog).
5. Deletion soft-deletes the article and all its revisions.
6. Clicking an article navigates to `/writing/:id`.

### Flow E — Edit Title

1. Article detail header shows the title as plain text with a small pencil icon.
2. Clicking the title text or pencil icon switches to an inline input field.
3. User edits the title. Enter saves (fetcher POST with `_intent=updateTitle`). Escape cancels.
4. On blur, the edit is saved if changed, cancelled if unchanged.

## Delete Behaviour

- Article deletion uses native `confirm()`.
- Server soft-deletes all revision rows for the article, then soft-deletes the article row (`deleted_at` timestamp).
- No R2 cleanup needed (text-only storage).

## File Manifest

| File | Type | Purpose |
|------|------|---------|
| `migrations/0007_writing.sql` | Migration | Create `writing_articles` and `writing_revisions` tables |
| `packages/db/src/index.ts` | Package | Add Writing types and CRUD functions |
| `apps/web/app/routes/writing.tsx` | Route | Layout: three-column shell, article list loader |
| `apps/web/app/routes/writing._index.tsx` | Route | New article: coach selection + first draft |
| `apps/web/app/routes/writing.settings.tsx` | Route | Writing settings page in the center canvas |
| `apps/web/app/routes/writing.$id.tsx` | Route | Article detail: editor + feedback + actions |
| `apps/web/app/routes/writing.$id_.status.ts` | Route | Feedback status polling endpoint |
| `apps/web/app/utils/writing-eval.server.ts` | Server | Gemini prompt construction, response parsing, fallback |
| `apps/web/app/utils/writing-agents.ts` | Shared | Coach definitions (rubric, tone, constraints) |
| `apps/web/app/utils/writing-settings.ts` | Shared | Writing feedback-language storage and change events |
| `apps/web/app/utils/use-writing-feedback-language.ts` | Shared | Hook for reading and updating the writing feedback language |
| `apps/web/app/utils/writing-article.server.ts` | Server | Article/revision CRUD, feedback scheduling |
| `apps/web/app/components/WritingEditor.tsx` | Component | Textarea editor with word count |
| `apps/web/app/components/WritingFeedback.tsx` | Component | Feedback annotation cards and summary |
| `apps/web/app/components/WritingRevisionRail.tsx` | Component | Right panel revision timeline |
| `apps/web/app/styles/global.css` | CSS | Three-column layout styles, writing-specific styles |
| `apps/web/app/routes/_index.tsx` | Route | Update homepage: slug `esl/writing` → `writing` |
| `docs/tools/writing.md` | Doc | This document |

## Configuration

- `GEMINI_API_KEY` (required; shared with Reading tool)
- `GEMINI_MODEL` (optional; shared with Reading tool, defaults to `gemini-flash-latest`)

## Homepage Entry

```typescript
{
  slug: "writing",
  title: "Writing Coach",
  description: "Iterative feedback loop for draft revisions.",
  tags: ["Writing", "AI"],
  planned: true  // remove when feature is live
}
```

## Future Roadmap (V1+)

- Additional coaches: Academic Writing, Business Writing, Fiction, Diagnosis Mode
- Tiptap rich text editor with markdown serialization
- Inline text annotation (highlight spans in editor, mapped from `quoted_text`)
- Extract three-column collapsible shell into reusable `ToolShell` component
- Apply `ToolShell` to Reading and Speech tools
- Writing prompts per coach (optional starter prompts)
- Session completion marking and progress analytics
