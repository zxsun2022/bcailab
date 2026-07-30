# English Studio UX follow-ups — 2026-07-30

Status: recorded for product review; not scheduled for implementation.

This note captures a set of learner-facing observations made on 2026-07-30. It separates
the desired experience from an implementation choice so the work can be planned without
silently expanding the current iteration. It does not reprioritise `docs/roadmap.md`.

## Product intent

English Studio should make practice material, a learner's progress, and the next action easy
to find. Catalogue tools should start from material rather than an empty form; focused
sessions should keep the learner oriented; and shared page chrome should place equivalent
controls consistently.

## 1. Writing: material-led entry and progress

### Problem

`/writing` currently opens directly into a blank new-piece editor. Unlike Reading and
Dictation, it has no platform material catalogue. This makes Writing feel like a generic
editor rather than a practice tool, and provides no clear starting point when a learner does
not bring their own topic.

### Required experience

- Make `/writing` a Writing home/catalogue, with a visible path to the existing Writing
  progress view and a separate action to start a personal/freeform piece.
- Add a platform prompt bank organised first by writing task type, not only by CEFR band.
  The first release should explicitly support IELTS Task 1 and IELTS Task 2; later prompt
  families (for example academic, business, or general writing) can use the same model.
- Each task-type section shows its available prompts and enough metadata to choose one
  confidently (at minimum task type and prompt title/brief). Selecting a prompt starts a
  Writing article with that prompt fixed as its assignment.
- Keep a clearly separated **Your pieces** area for user-created work, mirroring Reading's
  distinction between platform material and a learner's own content.
- Preserve the current iterative coach workflow after a prompt is selected: submit, receive
  feedback, revise, and compare rounds.

### Product/data decisions to make before implementation

- Prompt-bank schema and editorial workflow (including prompt ID, task family, body, source,
  status, and optional difficulty/tags).
- Whether a prompt can be attempted multiple times and how those attempts are grouped in the
  catalogue and progress views.
- Writing measurement vocabulary. A prompt bank supplies material, but does not by itself let
  Writing contribute to the shared ability profile; that remains the roadmap's separate
  writing-to-profile item.

### Acceptance criteria

- A signed-in learner can start an IELTS Task 1 or Task 2 prompt without copying text into a
  blank form.
- A learner can still begin a freeform personal piece.
- The home makes both progress and previously created pieces discoverable without relying on
  the product rail.
- Anonymous trial behaviour stays intentionally scoped; a prompt-bank entry must not
  accidentally persist anonymous work or bypass the trial quota.

## 2. Translate: grow the source editor for long input

### Problem

For long source text, the input textarea stays at a fixed height and scrolls internally. Once
the translation is present, the input should remain readable alongside it rather than hiding
most of the source in a small nested scroller.

### Required experience

- The source textarea grows with its content after a translation has completed (and may grow
  while the learner is entering long text), up to a documented sensible maximum for the
  viewport.
- Beyond that maximum, the page's main scroll owns vertical movement; avoid trapping ordinary
  reading in a nested textarea scroller.
- The two panes remain aligned and usable at desktop, tablet, and mobile widths. Streaming
  output, copy, clear, keyboard submission, quotas, and the no-JS form fallback retain their
  present behaviour.

### Acceptance criteria

- A long source and its completed translation can be read by scrolling the page, without
  needing to scroll the source textarea to compare paragraphs.
- Focus, text selection, and `Cmd/Ctrl+Enter` continue to work normally.
- The change introduces no viewport-height lock or blank space below the tool.

## 3. Dictation: catalogue rhythm, session orientation, and keyboard cues

### A. CEFR section spacing

**Problem:** the divider under headings such as `A2` and `B2` visually touches the first card.

**Requirement:** give the section divider and card grid a deliberate vertical gap consistent
with the shared catalogue rhythm, while retaining a compact grouped appearance at all
breakpoints.

### B. Step navigation

**Problem:** a multi-sentence passage presents one sentence at a time, but the learner cannot
directly revisit a previous step or see the session's shape beyond the current `n / total`
counter.

**Required experience:**

- Show a compact sentence-step navigator in a session (for example numbered chips or a
  progress strip) that makes current, completed, and not-yet-completed steps distinct.
- A learner can jump back to any checked sentence to replay it and inspect its result.
- A learner can return from a reviewed sentence to the current unfinished sentence without
  losing typed answers, checks, replay counts, or session progress.
- Do not silently permit skipping unchecked sentences in a way that marks them complete or
  makes the persisted attempt inaccurate. Whether forward skipping is allowed as an explicit
  "leave unanswered" action is a separate product decision.

### C. Audio duration

**Requirement:** show the duration of the current sentence audio near playback controls once
metadata is available, formatted consistently (for example `0:04`). It should not imply a
duration before the browser has loaded it, and it must work with the existing speed controls
and replay counter.

### D. Check shortcut discoverability

**Requirement:** next to the Check control (or in the input hint), disclose that `Enter`
checks the answer and `Shift+Enter` inserts a line break. Current keyboard behaviour should be
verified and retained: after a checked answer, `Enter` advances to the next sentence.

### Acceptance criteria

- A learner can identify how many sentences a passage contains, where they are, and which
  ones they have checked.
- Reviewing earlier sentences cannot corrupt deterministic scoring or stored partial-attempt
  state.
- The session remains usable with keyboard-only input.

## 4. Return controls: shared, left-aligned placement

### Problem

Detail and focused-workspace return links (for example `Back to Reading` and `Back to
Dictation`) appear inconsistently, including in a top-right position that competes with page
actions.

### Requirement

- Place a focused workspace's return control at the top-left of its content/header, before the
  workspace title and aligned with the shared page-frame origin.
- Use this rule for Reading, Dictation, Writing, and comparable future detail workspaces.
- Keep page-level primary actions in the header action area; a return link is navigation, not
  an action. The control should stay visible and reachable on narrow screens.

### Scope boundary

This applies to detail/session workspaces, not catalogue roots such as `/reading` or
`/dictation`, which already are the owning destinations.

## 5. Reading: move “Add text” into “Your texts”

### Problem

`Add text` is currently the global Reading catalogue header action, even though it creates a
learner-owned passage rather than a library item.

### Requirement

- Move `Add text` into the **Your texts** section header, next to that section's title or
  description.
- Do not show it as a page-wide action above the graded material library.
- Keep the action prominent for both an empty and populated **Your texts** state.

This makes the ownership distinction explicit: the main catalogue is curated practice
material; adding text is an operation on the learner's personal collection.

## 6. Speech: compose workspace height and scroll ownership

### Problem

On the Speech compose page, the Generate button can fall below the initially reachable area,
and a lower invisible layer appears to consume space or obscure content. This is likely a page
height/overflow interaction, not desired intentional whitespace.

### Required investigation and outcome

- Reproduce at supported desktop and mobile viewport sizes, including a fresh page load and
  long input.
- Identify the exact element owning height and overflow in the Studio main inset, Speech center
  stage, compose card, and controls; verify no transparent overlay intercepts pointer or scroll
  events.
- Make the primary Generate action visible or naturally reachable in the compose state without
  scrolling past an unexplained blank region.
- Preserve the current design intent that the textarea is the dominant compose surface, but do
  not use a rigid viewport-height constraint that hides the action.

### Acceptance criteria

- On a normal desktop viewport, the Generate button is reachable without an artificial blank
  region or hidden content.
- At smaller heights and on mobile, scrolling is owned by the page/main inset rather than an
  invisible overlay or a dead region.
- No regression to the selected-record playback workspace or Speech history tab.

## Cross-cutting implementation notes

- These requests touch the existing Studio page-frame and scroll contract in
  `docs/studio-app-shell.md`; changes must preserve its single-scroll-owner rule for ordinary
  pages.
- The Writing catalogue is a material-layer/product-model feature, not merely a navigation
  rearrangement. It should be scoped with the roadmap's existing **Writing prompt bank** item.
- The remaining items are discrete UX fixes or enhancements and can be independently sized.
- Before shipping, test desktop/tablet/mobile layout plus keyboard paths. Route-level server
  behaviour, quotas, persistence, and anonymous-trial boundaries must remain backward
  compatible.

## Suggested planning split (not a priority order)

1. **Writing prompt-bank discovery:** schema, editorial workflow, catalogue, progress entry,
   and personal-work area.
2. **Session usability:** Dictation step navigator, duration cue, and shortcut hint.
3. **Shared page polish:** back-link placement, Reading ownership affordance, Dictation
   catalogue spacing, and Translate autosizing.
4. **Speech layout diagnosis/fix:** reproduce first, then make the smallest layout correction
   supported by the evidence.
