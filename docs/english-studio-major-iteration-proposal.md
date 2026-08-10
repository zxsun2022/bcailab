# English Studio major iteration plan

Status: **authorized and active**. The owner approved decisions D1-D5 on 2026-08-09; the
authorized scope and acceptance criteria are recorded in `docs/roadmap.md`. This document is
the implementation plan and review artifact, while the roadmap remains the source of truth.

Branch: `codex/english-studio-major-iteration`
Baseline: `main` at `8570d63`
Prepared: 2026-08-09

## 1. Outcome

Make English Studio feel like one learning product rather than a set of tools with uneven
starting points:

1. Writing starts from reviewed practice material across learner levels and IELTS tasks,
   while preserving freeform writing and the existing revision coach.
2. Translate gains a privacy-safe way for signed-in learners to keep useful work and return
   to it.
3. The highest-impact mobile and keyboard failures found in the planning QA pass are closed.
4. A small set of already-planned cross-tool inconsistencies is removed when the work is in
   the direct blast radius.

This is deliberately one English Studio release. It is not a repository-wide roadmap sweep.

## 2. Evidence and current seams

### Writing

- `/writing` currently opens `writing._index.tsx`, a blank editor with an optional topic field.
- `/writing/trial` defaults to the IELTS Task 2 coach but renders no topic field at all.
- `writing_articles.essay_prompt` already stores an assignment snapshot and all revision
  rounds reuse it. That is the correct seam for prompt-backed articles.
- The current coach roster contains `general` and `ielts_task2`; IELTS Task 1 needs a separate
  evaluation contract and visual/table material support.
- Writing articles and revisions already provide ownership, persistence, async evaluation,
  retry, history, and soft deletion. The prompt bank should reuse them, not create a parallel
  practice system.
- `docs/ux-follow-ups-2026-07-30.md` already specifies the catalogue shape, but explicitly says
  it is not scheduled. `docs/roadmap.md` records the prompt bank in Later without complete
  acceptance criteria.

### Translate

- Translate persists daily quota counters only. No translation text is stored anywhere.
- The streaming and no-JavaScript paths share request validation and quota policy; saving must
  not fork or weaken either path.
- The page already revalidates after popup authentication without discarding its in-memory
  translation, so an anonymous learner can sign in and then explicitly save the current result.
- `docs/roadmap.md` records signed-in Translate history as opt-in and prefers framing it as
  learning material rather than an automatic activity log.

### Interaction QA baseline

The report-only run at `.gstack/qa-reports/qa-report-localhost-2026-08-09.md` scored 93/100.
That path is gitignored; the reproducible findings are summarized here so the plan remains
portable:

1. At 375x812, Translate's primary action begins about 234px below the viewport for a short
   input; after completion, the target result remains entirely below the viewport.
2. The shared mobile navigation drawer does not make the covered page inert or contain focus.
3. The Reading trial's primary record button has no accessible name.
4. Writing trial offers an IELTS coach but no question or level-guided starting point.

## 3. Confirmed premises

1. **Release focus:** this branch should deliver one coherent English Studio iteration.
   Mapdown's authorized external-AI flow remains a separate branch/release even though it is
   currently in Roadmap Next.
2. **Translate privacy:** “history” means user-chosen saved translations. Raw translation text
   is never automatically persisted, including for signed-in users.
3. **Writing material:** prompt level is discovery metadata, not a measured ability claim.
   Null level is never rendered as B1 and prompts outside the learner's current band remain
   available.
4. **Release boundary:** material, saving, and directly related usability are enough for this
   iteration. Writing-to-profile measurement remains separate unless the owner explicitly adds
   the vocabulary and observation work.
5. **Content review:** generated prompts may be prepared by the agent, but no prompt is marked
   published until it passes automated validation, an independent content review, and owner
   review of the generated artifacts or every flagged item plus an agreed sample.

## 4. Recommended scope

### Workstream A: Writing prompt bank and material-led home

#### A1. Data and editorial contract

Add `writing_prompts` in a dedicated migration. Keep the shape explicit and small:

| Field | Purpose |
|-------|---------|
| `id`, `slug` | Stable identity and reviewable URLs/artifacts |
| `family` | `general` or `ielts` |
| `task_type` | Writing-native task type, including IELTS Task 1/2 variants |
| `title`, `prompt_text` | Learner-facing assignment |
| `cefr_band` | Optional A2/B1/B2/C1 discovery band; null for exam material when not asserted |
| `topic` | One editorial topic for browsing and future matching |
| `target_words` | Assignment-specific target, separate from coach defaults |
| `asset_path` | Optional reviewed Task 1 chart/table/process/map asset |
| `source_label` | Provenance or `bcailab original` |
| `status` | `draft`, `published`, or `retired` |
| timestamps | Review and operational traceability |

Add nullable `prompt_id` to `writing_articles`, while keeping `essay_prompt` as an immutable
snapshot. A retired or edited catalogue prompt must not rewrite an existing learner's
assignment or history.

Create `scripts/writing-prompt-seed/` with reviewable JSON artifacts and deterministic
validation. Validate IDs, enum values, lengths, target word counts, required Task 1 assets,
duplicate titles, and accidental answer/explanation leakage. Publishing is idempotent and
supports local and remote targets, following the existing material seed workflow without TTS.

#### A2. First content batch

Recommended complete batch: **48 prompts**.

- 24 general prompts: six each for A2, B1, B2, and C1.
- 12 IELTS Academic Task 1 prompts covering line/bar/pie/table/process/map material with
  reviewed assets and the correct minimum word target.
- 12 IELTS Task 2 prompts covering opinion, discussion, problem/solution, and
  advantages/disadvantages tasks.

The batch is content for review, not automatically accepted content. Every JSON artifact and
Task 1 asset is committed so review happens before publication.

#### A3. Runtime experience

- Change `/writing` from blank editor to Writing home/catalogue.
- Move the existing freeform editor to `/writing/new` and keep it a first-class action.
- Group catalogue material by task family/type; use CEFR as a secondary band for general
  prompts, never as a lock.
- Keep a separate **Your pieces** section with recent articles, current feedback state, prompt
  identity, and an explicit route to Writing progress.
- Selecting a published prompt creates an article with `prompt_id` plus an assignment snapshot,
  then enters the existing iterative coach flow.
- The same prompt may be attempted more than once. Each article is a separate attempt; the
  catalogue shows attempt count and the most recent article without merging revision histories.
- Anonymous `/writing/trial` receives one reviewed featured prompt without catalogue browsing,
  persistence, history, or quota changes. Freeform trial remains available through a clear
  choice if it can be presented without adding a second cold-start decision.
- Add a dedicated `ielts_task1` coach and rubric if Task 1 is included. Do not send Task 1 work
  through the Task 2 rubric.

#### A4. Acceptance criteria

1. A signed-in learner can browse and start general A2-C1, IELTS Task 1, and IELTS Task 2
   material without copying a question into a blank form.
2. No band is locked; null band is never presented as B1.
3. A learner can still start a personal freeform piece and find existing pieces and progress.
4. A prompt-backed article retains its original assignment after the catalogue row is edited,
   retired, or unpublished.
5. Reattempting a prompt creates a distinct article while preserving prior attempts.
6. Anonymous work remains non-persistent and quota-limited; a featured prompt cannot bypass
   the existing trial boundary.
7. Task 1 and Task 2 evaluations use their own rubrics and word targets.
8. Draft/invalid prompt artifacts cannot appear in the catalogue.

### Workstream B: Privacy-safe saved translations

#### B1. Product contract

Call the feature **Saved translations**, not automatic History.

- Nothing is saved merely because translation completed.
- A signed-in learner explicitly chooses Save after a completed result.
- An anonymous learner may translate as today. Choosing Save opens the existing login popup;
  after successful authentication the in-memory result remains available to save.
- Saved items are private to one user. List/detail/delete queries always include `user_id`.
- Delete is a confirmed hard delete because saved source text may be sensitive. The UI must say
  that deletion cannot be undone.
- Saved items are future inputs to vocabulary/dictionary work, but this iteration does not
  invent those features or claim learner-profile effects.

#### B2. Data and routes

Add `saved_translations` in its own migration:

- `id`, `user_id`
- source and translated text
- requested source language, detected source language, and target language
- `created_at`

Enforce bounded text lengths on the server. A Save action is idempotent for the current client
request so double-click/retry does not create duplicates.

Add an authenticated `/translate/saved` content surface with a paginated list, language pair,
timestamp, source preview, full selected source/result, Copy, and Delete. Keep this history in
the main workspace, not the universal product rail, matching the settled IA rule.

#### B3. Acceptance criteria

1. Completing a translation does not write source or output text to D1.
2. A signed-in learner can explicitly save, revisit, copy, and permanently delete an item.
3. One user's IDs never disclose another user's text; not-found and not-owned responses are
   indistinguishable.
4. Anonymous users cannot call the save/list/delete operations, but authentication from the
   current Translate page does not lose the completed in-memory result.
5. Streaming, no-JavaScript translation, quotas, language detection, swap, copy, and error
   handling remain backward compatible.
6. List queries are bounded and paginated; long saved text does not create an unbounded list
   payload.

### Workstream C: Interaction and accessibility lake

These are included because they affect the same English Studio surfaces or shared shell and
are small enough to finish and verify in the same release.

#### C1. Translate mobile and long-input scroll ownership

- Keep the primary action naturally reachable after entering short text at supported mobile
  heights.
- On completion, reveal the output without unexpected motion; respect reduced-motion.
- Let long source text grow to a documented viewport-relative maximum, then give ordinary
  vertical movement to the page/main scroll owner rather than trapping reading inside a short
  textarea.
- Preserve side-by-side desktop comparison and the mobile language controls.

#### C2. Shared mobile navigation drawer

- Move focus to the drawer on open, contain Tab/Shift+Tab, close on Escape/backdrop, and restore
  focus to the opener.
- Make the covered workspace inert to keyboard and assistive technology and lock background
  scroll only while the mobile drawer is open.
- Preserve the persistent desktop rail and current route-closes-drawer behavior.

#### C3. Reading trial record control

- Give the record/stop control an accurate state-dependent accessible name.
- Verify name, focus, permission/error state, and mobile touch target without changing quota or
  recording behavior.

#### C4. Unified feedback language

- Replace per-tool local-storage keys with one English Studio feedback-language preference.
- Read old Reading/Writing keys once as migration fallbacks, write the shared key thereafter,
  and dispatch one shared same-tab update event.
- Keep output language separate from source/practice language.

#### C5. Branded destructive confirmation

- Add one accessible shared confirmation dialog with focus containment, Escape/cancel, return
  focus, pending state, and explicit destructive copy.
- Replace the five native `confirm()` calls in the web app. Do not include Mapdown in this
  English Studio branch unless the owner explicitly broadens the product boundary.

#### C6. Feedback waiting experience

- Replace Writing's static `Analyzing...` state with a short, honest narrative progression
  driven by elapsed time and actual status, not fake percentages.
- Reuse the pattern only where a tool has the same async evaluation contract; Translate already
  streams real output and should not receive fake narrative states.
- Preserve retry and failure states and announce transitions without excessive live-region
  chatter.

### Workstream D: Dead-output decision

Recommended: remove Reading `next_drills` from the evaluation schema and prompt in this
iteration. It is generated and stored on every attempt but rendered nowhere. A one-tap drill
belongs with the future session/matching layer; keeping dead output now spends tokens without a
learner outcome.

Acceptance: parser remains backward compatible with stored feedback that contains
`next_drills`, new evaluations stop requesting it, and existing feedback continues to render.

## 5. Recommended exclusions

| Roadmap item | Recommendation | Reason |
|--------------|----------------|--------|
| Mapdown Create with AI | Separate branch/release | Authorized but a different product, QA surface, and acceptance matrix |
| Writing-to-profile measurement | Defer unless owner expands scope | Still blocked on a writing tag vocabulary; prompt difficulty is not measurement |
| Dictation v2 matching/session layer | Defer | Separate ranking policy and test lake; no dependency for prompt catalogue or saves |
| Long-document translation (~100k) | Defer | Chunk ordering, parallel failure, cost, and provider limits deserve a focused iteration |
| Faster first token / AI Gateway | Defer | Needs provider/observability evidence, not required for saved translations |
| Model routing hot config | Defer until trigger | No second provider or between-deploy routing need established |
| Promote LLM judgment weight | Defer until evidence | Roadmap explicitly requires broader variance evidence |
| Chinese UI, paid tier, profile settings | Defer | Unrelated to this release outcome |
| More Reading/Dictation passages | Defer | Writing's missing material is the current structural gap |

## 6. Delivery sequence

Each phase ends in a focused commit and proportionate verification. Completed roadmap work is
reported `in_review`; only the owner marks it accepted.

### Phase 0: authorize and baseline

1. Owner confirms the open decisions below.
2. Update `docs/roadmap.md` with the selected scope and explicit acceptance criteria.
3. Regenerate repository context if derived facts change later; do not hand-maintain route or
   schema inventories.
4. Run current unit/type/build baseline and retain the report-only browser baseline.

### Phase 1: small shared correctness fixes

1. Mobile drawer focus/inert behavior.
2. Reading record accessible name.
3. Shared feedback-language preference and compatibility migration.
4. Shared confirmation dialog and web replacements.
5. Remove new `next_drills` generation if approved.

This phase lowers risk before the larger route and data changes.

### Phase 2: Writing data, pipeline, and reviewed batch

1. Migration and DB interfaces.
2. Pure prompt validation with tests.
3. Intake/publish scripts and committed draft artifacts/assets.
4. Generate and independently review the first batch.
5. Owner content review gate before published status/remote publication.

### Phase 3: Writing runtime

1. Catalogue/home and `/writing/new` freeform route.
2. Prompt-backed article creation with immutable snapshot.
3. Your pieces/progress and repeated-attempt presentation.
4. Task 1 coach/rubric and anonymous featured prompt.
5. Async wait experience.

### Phase 4: Saved translations and Translate layout

1. Migration, ownership-safe DB interfaces, and validation.
2. Explicit Save flow and auth handoff.
3. Saved list/detail/delete surface.
4. Mobile action/output reveal and long-input scroll behavior.

### Phase 5: integrated verification and handoff

1. Unit tests for pure validation, language preference migration, and parser compatibility.
2. Typecheck, Vitest, and production build.
3. Local D1 route verification for prompt creation, save/list/delete ownership, and anonymous
   boundaries.
4. Browser QA at desktop, tablet, mobile, keyboard, and reduced-motion settings.
5. Update affected tool/design/access docs and append `docs/changelog.md` as `in_review` with
   evidence.
6. Review final diff, commit all intended changes, and stop before push/deploy unless separately
   authorized.

## 7. Test diagram

| Flow/code path | Required evidence |
|----------------|-------------------|
| Prompt JSON -> intake -> draft row | Deterministic validation tests and dry-run fixture |
| Draft/retired prompt -> catalogue | Never rendered |
| Published prompt -> article | `prompt_id` plus immutable `essay_prompt` snapshot |
| Prompt edited/retired after start | Existing article and revisions unchanged |
| Same prompt started twice | Two articles; attempts grouped only in catalogue summary |
| Anonymous featured prompt | Evaluation allowed within quota; no article/revision row |
| General / IELTS Task 1 / Task 2 | Correct coach, rubric, word target, and asset rules |
| Translation completes | No saved row until explicit Save |
| Save double-click/retry | One row |
| Save/list/detail/delete | User-scoped query on every path; bounded payload |
| Foreign saved ID | Same not-found behavior as absent ID |
| Popup auth after anonymous translation | Current in-memory result remains saveable |
| Mobile short translation | Action reachable; completed output revealed |
| Long translation | Page owns ordinary reading scroll; text selection and shortcut work |
| Mobile nav open/close | Focus enter, trap, Escape/backdrop, restore, inert background |
| Old feedback-language keys | One-time fallback then shared preference/event |
| Old feedback with `next_drills` | Still parses/renders after new generation drops field |
| Destructive dialog | Cancel/confirm/keyboard/pending/return-focus paths |

## 8. Failure modes and rescue behavior

| Failure | User-visible rescue | Data invariant |
|---------|---------------------|----------------|
| Prompt batch contains invalid content | Publish command reports file/field and writes no row | No partial invalid batch publication |
| Prompt retired while catalogue is open | Creation rejects with actionable refresh message | No article points at an unusable live prompt without a snapshot |
| Writing evaluation fails | Existing Retry feedback flow | Article/revision remain recoverable |
| Save request fails | Translation remains on page; Save can retry | No duplicate/partial row |
| Saved item was deleted in another tab | Return to list with not-found notice | No foreign or stale data shown |
| Auth popup closed/fails | Translation remains usable but unsaved | Anonymous text never reaches D1 |
| Stream fails | Existing Translate error/retry path | Failed/partial output cannot be saved as completed |
| Drawer JavaScript fails | Navigation remains semantically an aside and links work | Main content is never permanently left inert |

## 9. Owner decisions — resolved 2026-08-09

The owner approved all five recommended choices below. Alternatives remain recorded as the
decision audit, not as authorized scope.

### D1. Product boundary

Recommended: English Studio only on this branch. Mapdown Create with AI remains authorized but
ships separately.

Alternative: combine Mapdown and English Studio into one long branch. This increases review,
regression, and rollback surface without creating a shared user outcome.

### D2. Writing breadth

Recommended: the full 48-prompt batch with general A2-C1, IELTS Academic Task 1 assets, and
IELTS Task 2.

Smaller alternative: general A2-C1 plus IELTS Task 2 only (36 prompts), deferring the Task 1
asset and rubric contract. This is materially faster but does not satisfy the existing UX
follow-up's proposed first-release breadth.

### D3. Translate persistence

Recommended: explicit Saved translations only. No automatic persistence setting in this
iteration.

Alternative: a one-time opt-in to automatic history. That is convenient but creates retention,
bulk deletion, trust copy, and accidental-sensitive-text requirements beyond a simple history
gap.

### D4. Writing ability profile

Recommended: defer measurement to the next iteration, but design prompt metadata so a future
writing vocabulary can attach without migration churn.

Alternative: add the writing tag vocabulary, evaluator observation writer, learner mastery
aggregation, and `/english/progress` presentation now. This makes the release more complete as
a learning loop, but it is a separate measurement-design decision and roughly doubles the
silent-logic test surface.

### D5. Reading `next_drills`

Recommended: stop generating new `next_drills` while retaining read compatibility for stored
feedback.

Alternative: build the one-tap drill creation flow now. That introduces a new session/material
lifecycle and overlaps the explicitly deferred matching/session layer.

## 10. Effort and stopping rules

Estimated agent execution after decisions:

- Recommended scope without writing measurement: roughly 6-10 focused agent hours, including
  content generation/review passes and browser verification.
- Adding writing measurement: roughly 3-5 additional hours plus a separate owner vocabulary
  review gate.
- Adding Mapdown or long-document translation should be treated as another iteration, not as
  overtime on this one.

Stop and ask the owner if implementation uncovers a need to change the public prompt contract,
persist anonymous translation text, weaken user ownership checks, publish unreviewed content,
or expand into a deferred roadmap item.
