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
| Assignment library | `/writing` (index) | Lists owner-published General English and IELTS assignments plus the user's six most recent pieces. CEFR labels guide discovery and do not gate access. |
| Freeform writing | `/writing/new` | Create a piece from a user-supplied topic and coach. |
| Assignment preview | `/writing/prompt/:slug` | Preview one published assignment and its accessible material without creating an article. The first draft submission creates the durable work. |
| Writing progress | `/writing/progress` | Progress dashboard opened inside the center canvas. |
| Legacy progress redirect | `/writing/dashboard` | Redirects to `/writing/progress` for backward compatibility. |
| Writing settings | `/writing/settings` | Writing-specific settings page opened inside the center canvas. |
| Article detail | `/writing/:id` | Fixed article context + draft body + feedback aside with round navigation. |
| Status resource | `/writing/:id/status` | Auth required. JSON endpoint for feedback status polling. |
| Anonymous trial | `/writing/trial` | **Public.** One-shot feedback with nothing persisted — see below. |

## Anonymous Trial

`/writing/trial` lets a signed-out visitor get one round of real coach feedback before
creating an account. It escapes the `/writing` layout (which calls `requireUser`) via the
`writing_.trial.tsx` route-name prefix, so it renders standalone under the site header.

- **Nothing is persisted.** No `writing_articles` row, no `writing_revisions` row, no
  history. The essay is evaluated by the same `evaluateWriting` call the real tool uses,
  and the feedback is rendered straight from the action's JSON response. The only write is
  the daily quota counter.
- **No revision rounds.** The trial is always round 1 with no previous-round context —
  iterating across rounds is precisely what signing in buys.
- **Reviewed starter when available.** The trial offers the published
  `general-a2-study-invitation` assignment when that exact slug is available; otherwise it
  safely falls back to the freeform experience. The action rechecks the content hash before
  evaluation. Task 1 is never offered without canonical source material.
- **Quota**: feature `writing_trial` in `feature_usage`, 5/day for anonymous visitors,
  counted against both the `bcailab_anon` cookie and the client IP. Charged only after a
  successful evaluation, so a provider failure costs the visitor nothing. Exceeding it
  renders a sign-in gate.
- **Signed-in users are redirected** to `/writing`; they have the real tool.
- Entry is the `/english` Writing module card, which points signed-out visitors here
  instead of opening the login popup.

## Layout

Three-column collapsible shell following the **Canvas-centered** pattern (see `docs/css-layout-conventions.md`). Writing is the current reference implementation for the shared shell/detail model described in `docs/tool-shell-pattern.md`.

### Shell Structure

```
.writing-shell (flex row, full viewport height)
├── <WritingNavRail />          ← left panel (aside)
└── .writing-main (flex: 1, overflow-y: auto)
    └── .writing-canvas (max-width: 1020px, margin: 0 auto)
        └── <Outlet />          ← route content
```

### Columns

- **Left panel — Navigation rail (`ToolNavRail` / `WritingNavRail`)**: Collapsible sidebar (260px expanded → 52px collapsed). All user articles sorted by `updated_at` DESC. Each entry shows title only (single line, no coach badge) for higher density. Pinned top: "Writing home", "+ New Article", "Progress". Pinned bottom: user avatar → settings. Article deletion uses the shared accessible confirmation dialog. Collapse state is persisted in `localStorage` key `"writing-nav-rail-collapsed"`. On mobile, the rail is an inert, focus-trapped drawer (280px) with Escape/close focus restoration and a backdrop.
- **Center — Main canvas**: All route content renders inside `.writing-canvas` (max-width `1020px`, auto-centered). Sub-pages apply their own inner max-width for readability:
  - Assignment library (`writing._index`): wide catalogue
  - New freeform article (`writing.new`): `720px`
  - Assignment preview (`writing.prompt.$slug`): assignment material followed by the editor
  - Article detail (`writing.$id`): `center stage` containing a narrower `article column`, plus a separate right rail shell
  - Progress (`writing.progress`): `760px`
  - Settings (`writing.settings`): `600px`
- **Right panel — Feedback aside (`WritingDetailAside`)**: Part of the article detail page (`writing.$id`), rendered inside a dedicated right rail shell that stays docked to the far right edge of the main area. Collapsible (persisted in `localStorage` key `"writing-aside-collapsed"`). When expanded: a wrapped navigation strip with `New Revision` first, then the latest round, then older rounds from left to right. The active state reflects either the selected historical round or compose mode. Feedback content below is scrollable. When collapsed: shrinks to the same `52px` width used by the left collapsed nav rail, with a collapse toggle and new-revision icon button. The rail shell owns the divider line so it spans the full desktop workspace height. On mobile (<1024px): hidden; feedback renders inline in the center panel instead.
- Desktop feedback-aside collapse/expand animates the rail-shell width and fades the expanded rail body instead of replacing the panel contents in one frame.
- **Detail workspace behaviour**: On desktop, the article detail page uses a full-width two-track shell. The right rail stays pinned to the main area's right edge; the left side is the `center stage`, and inside it the actual `article column` keeps its own max width and padding. The desktop detail page scrolls at the `center stage` level, so the vertical scrollbar sits at the boundary between the content area and the right rail. Collapsing the right aside changes the available width of the center stage, then the article column recenters inside that remaining space.

### Responsive Behaviour

| Breakpoint | Nav rail (left) | Canvas (center) | Feedback aside (right) |
|------------|----------------|-----------------|----------------------|
| < 1024px (mobile) | Hidden; drawer overlay (280px) via top-left hamburger | Full width, feedback inline below text | Hidden |
| 1024–1279px (tablet) | Persistent, 260px (collapsible → 52px) | Centered, max-width 1020px | 300px (collapsible → 52px) |
| ≥ 1280px (desktop) | Persistent, 260px (collapsible → 52px) | Centered, max-width 1020px | 300–340px (collapsible → 52px) |

Nav rail collapse state is persisted in `localStorage`.

### Mobile-specific UI

- Hamburger toggle button fixed at top-left (`nav-rail-mobile-toggle`), matching Claude.ai's pattern
- Backdrop overlay when nav rail is open
- "← Articles" back link shown in article detail header
- All content stacked vertically (single column)

## Data Model

### Migrations: `0007_writing.sql`, `0008_writing_essay_prompt.sql`, `0016_writing_prompts.sql`

`0016_writing_prompts.sql` adds the reviewed-content and reliable-start contracts:

- `writing_prompts` stores the canonical source JSON, content hash, review evidence,
  publication state, level/task metadata, and optional Task 1 asset manifest.
- `writing_articles.prompt_id` links a submitted piece to the source prompt.
- `writing_articles.assignment_snapshot_json` freezes the exact learner-visible assignment
  and canonical Task 1 facts for every later revision and retry.
- `(user_id, start_key)` is unique, so a repeated first-submit transport returns the same
  article and Round 1 instead of duplicating work.
- `writing_revisions.feedback_generation` and `feedback_started_at` isolate retries and
  provide a server-authoritative stale-pending threshold.
- `(article_id, round_number)` is unique.

- `essay_prompt` belongs to `writing_articles`, not `writing_revisions`. An article represents repeated work on one prompt.
- Round 1 may leave `essay_prompt` blank. In later states, the prompt field remains blank and read-only rather than showing placeholder helper copy; when empty, it collapses to a compact blank slot instead of reserving a large text box.

### Storage

- D1 stores prompt metadata and learner work. Reviewed Task 1 SVGs are immutable,
  content-addressed public assets generated from the same canonical prompt source.

## Coaches

Each coach embeds a writing evaluation standard. Coach = Writing Purpose + Evaluation Criteria + Feedback Tone. Coaches are defined in code (`utils/writing-agents.ts`), not in the database.

### Coach Roster

| Coach | Evaluation Standard | Feedback Focus |
|-------|-------------------|----------------|
| General | General writing rubric | Clarity, structure, style, grammar |
| IELTS Academic Task 1 | IELTS Task 1 descriptors grounded in canonical source facts | Overview, key-feature selection, factual accuracy, cohesion, lexis, grammar |
| IELTS Academic Task 2 | IELTS Task 2 descriptors (TR, CC, LR, GRA) | Argument coherence, lexical range, grammatical accuracy |

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
- On article detail pages, `Writing guide` and `Essay prompt` are always shown above the draft body in `Latest`, `History`, and `Compose` states so the page structure stays stable while switching modes.
- In article detail compose mode, the prompt is always read-only. It is locked from Round 1 onward.

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
- User selects the shared feedback language (Chinese / English) from either tool's settings.
- Preference is stored under `bcailab-feedback-language`, defaults to English, and deterministically
  migrates the old Writing key before the old Reading key.
- Controls the language of `diagnosis`, `guiding_question`, `overall_comment`, and `delta` strings.
- The user's writing text language is not affected.

## Evaluation Pipeline

Follows the same async pattern as Reading:

1. User submits text → creates a `writing_revision` with `feedback_status: 'pending'`.
2. Gemini evaluation fires in a `waitUntil` background task.
3. Frontend polls `/writing/:id/status` for feedback completion.
4. On completion, `feedback_json` and `model_name` are written; `feedback_status` set to `'completed'`.
5. If Gemini fails, `feedback_status` is set to `'failed'`; the saved-draft state exposes Retry.
6. Pending feedback says the draft is saved, adds a longer-than-usual message after 15 seconds,
   and never claims a fabricated model stage or percentage.
7. A retry increments `feedback_generation`. Completion writes compare both user and
   generation, so a late response from an older attempt cannot overwrite newer feedback.
   A still-pending job becomes retryable only after the server timestamp is at least 60
   seconds old.

### Prompt Structure

- System context: coach rubric, feedback tone, JSON schema, rules ("never rewrite, only diagnose and question").
- User content: Current text, word count, previous round's feedback (if any), revision history summary (scores from older rounds).
- Feedback language directive (Chinese or English).
- Prompt-backed work includes the immutable assignment snapshot. Task 1 evaluation receives
  canonical values, units, labels, and key facts from that snapshot; it hard-fails if those
  facts are absent. Scores are presented as coach estimates, not official IELTS results.
- Model: `gemini-flash-latest` (same env var `GEMINI_MODEL` as Reading).
- Generation config: `responseMimeType: "application/json"`, `temperature: 0.3`.

## Interaction Flows

### Flow A — Start from an assignment

1. User navigates to `/writing` and browses every published General English and IELTS
   assignment. A2/B1/B2/C1 labels are discovery aids, not prerequisites.
2. Opening `/writing/prompt/:slug` renders the reviewed prompt and, for Task 1, the visual
   plus an accessible data/table/process/map representation. Previewing writes nothing.
3. The draft is kept locally under the prompt ID and content hash. On submit, the server
   rechecks that the prompt is still published with the same hash.
4. Article, immutable assignment snapshot, and Round 1 are created in one D1 batch. The
   per-page start key makes repeat transport safe.
5. The user is redirected to `/writing/:id`; the fixed assignment remains visible across
   latest, history, compose, and retry states.

### Flow A2 — Start freeform

1. User opens `/writing/new`, chooses a supported freeform coach, and optionally supplies a
   topic and title.
2. First submission uses the same atomic article + Round 1 start contract. A title is
   generated in the background only when no title was supplied.

### Flow B — Revision

1. User reads feedback in the right aside panel. Clicks annotation cards to review diagnosis and guiding question.
2. Clicks `New Revision` in the right aside navigation strip. The strip order is `New Revision`, latest round, older rounds.
3. Compose mode reuses the same center layout as viewing mode: `Writing guide`, `Essay prompt`, then the draft body.
4. The essay prompt is locked (read-only, set in Round 1). If it was never filled, the field stays blank.
5. Previous round's feedback is shown in the right aside for reference.
6. Edits text in the editor.
7. Clicks "Submit revision".
8. Saved as Round N+1. AI receives previous round's feedback for delta computation.
9. New feedback appears with delta section: "2 critical issues resolved, 1 new improvement identified".
10. Right panel updates with the new latest round and keeps `New Revision` highlighted only while compose mode is active.

### Flow C — View Past Round

1. Clicks a past round in the right aside.
2. Center panel switches to `History` state with a banner: `Viewing Round n of N`.
3. The page still shows `Writing guide` and `Essay prompt` above the historical draft text.
4. Right aside loads that round's feedback and highlights the selected round.
5. Clicking `Back to latest` returns to the newest round.

### Flow D — Pending / Retry

1. While the latest round is `pending`, `New Revision` is disabled.
2. If the latest feedback job stalls or fails, the right aside shows retry messaging for that latest round.
3. Retry reuses the immutable assignment snapshot (or stored freeform prompt) and increments
   the revision's generation before evaluation.

### Flow E — Manage Articles

1. Left panel lists all articles sorted by `updated_at` DESC.
2. Pinned actions at the top open `/writing`, `/writing/new`, and `/writing/progress`.
3. Bottom of the rail includes a persistent `Settings` entry that opens `/writing/settings` in the center canvas.
4. Hover reveals three-dot menu → "Delete article" using an accessible portal dialog.
5. A single D1 batch deletes revisions and soft-deletes the owning article.
6. Clicking an article navigates to `/writing/:id`.

### Flow F — Edit Title

1. Article detail header shows the title as plain text with a small pencil icon.
2. Clicking the title text or pencil icon switches to an inline input field.
3. User edits the title. Enter saves (fetcher POST with `_intent=updateTitle`). Escape cancels.
4. On blur, the edit is saved if changed, cancelled if unchanged.

## Delete Behaviour

- Article deletion uses the shared accessible confirmation dialog.
- One D1 batch hard-deletes revision rows and soft-deletes the article row (`deleted_at` timestamp).
- No R2 cleanup needed (text-only storage).

## File Manifest

| File | Type | Purpose |
|------|------|---------|
| `migrations/0007_writing.sql` | Migration | Create `writing_articles` and `writing_revisions` tables |
| `migrations/0008_writing_essay_prompt.sql` | Migration | Add article-level `essay_prompt` persistence |
| `migrations/0016_writing_prompts.sql` | Migration | Add reviewed prompts, immutable assignment starts, and feedback generations |
| `packages/db/src/index.ts` | Package | Add Writing types and CRUD functions |
| `apps/web/app/routes/writing.tsx` | Route | Layout: three-column shell, article list loader |
| `apps/web/app/routes/writing._index.tsx` | Route | Published assignment catalogue and recent pieces |
| `apps/web/app/routes/writing.new.tsx` | Route | Freeform coach selection and first draft |
| `apps/web/app/routes/writing.prompt.$slug.tsx` | Route | Published assignment preview and atomic first submit |
| `apps/web/app/routes/writing.progress.tsx` | Route | Progress dashboard in the center canvas |
| `apps/web/app/routes/writing.dashboard.tsx` | Route | Legacy redirect from `/writing/dashboard` to `/writing/progress` |
| `apps/web/app/routes/writing.settings.tsx` | Route | Writing settings page in the center canvas |
| `apps/web/app/routes/writing.$id.tsx` | Route | Article detail: editor + feedback + actions |
| `apps/web/app/routes/writing.$id_.status.ts` | Route | Feedback status polling endpoint |
| `apps/web/app/utils/writing-eval.server.ts` | Server | Gemini prompt construction, response parsing, fallback |
| `apps/web/app/utils/writing-prompt.server.ts` | Server | Materialize validated prompt rows into immutable snapshots |
| `apps/web/app/utils/writing-agents.ts` | Shared | Coach definitions (rubric, tone, constraints) |
| `apps/web/app/utils/writing-settings.ts` | Shared | Writing feedback-language storage and change events |
| `apps/web/app/utils/use-writing-feedback-language.ts` | Shared | Hook for reading and updating the writing feedback language |
| `apps/web/app/utils/writing-article.server.ts` | Server | Article/revision CRUD, feedback scheduling |
| `apps/web/app/components/WritingEditor.tsx` | Component | Textarea editor with word count |
| `apps/web/app/components/WritingPromptMaterial.tsx` | Component | Task 1 visual and accessible canonical material |
| `apps/web/app/components/WritingFeedback.tsx` | Component | Feedback annotation cards and summary |
| `apps/web/app/components/WritingDetailAside.tsx` | Component | Right panel: round selector + feedback content |
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
- Session completion marking and progress analytics
