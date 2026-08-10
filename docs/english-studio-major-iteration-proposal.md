<!-- /autoplan restore point: /Users/star/.gstack/projects/zxsun2022-bcailab/codex-english-studio-major-iteration-autoplan-restore-20260809-211051.md -->
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
| `task_material_json`, `asset_path` | Canonical Task 1 facts plus a content-addressed visual derived from them |
| `asset_alt_text` | Concise visual summary; the full table/long description derives from the same facts |
| `source_label` | Provenance or `bcailab original` |
| `content_hash` | SHA-256 identity binding JSON, derived visual, and review evidence |
| `status` | `draft`, `reviewed`, `published`, or `retired` |
| timestamps | Review, publication, retirement, and operational traceability |

Add nullable `prompt_id`, `assignment_snapshot_json`, and `start_key` to `writing_articles`.
Keep `essay_prompt` as the backward-compatible text projection. The versioned assignment
snapshot contains the prompt taxonomy, target, coach, canonical Task 1 facts, accessibility
representation, and asset digest needed by every evaluation/retry. A retired or edited
catalogue prompt must not rewrite an existing learner's assignment or history.

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
- Selecting a published prompt opens a prompt-backed editor without writing a row. The first
  feedback submission atomically creates the article and Round 1 revision with `prompt_id` plus
  the immutable assignment snapshot, then enters the existing iterative coach flow.
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
| Published prompt -> editor -> first submit | `prompt_id` plus immutable versioned assignment snapshot; article + Round 1 are one D1 batch |
| Prompt edited/retired after start | Existing article and revisions unchanged |
| Same prompt submitted twice as separate attempts | Two articles; duplicate transport retry for one submit remains one article |
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

Estimated execution after the full review:

- The authorized scope without writing measurement is roughly 12-18 focused agent hours for
  implementation, deterministic content checks, local D1 verification, and the browser matrix.
  The 48-prompt owner review is a separate 60-90 minute gate; live-model evaluation can add
  elapsed time without adding coding scope.
- Adding writing measurement would still be a separate iteration, roughly 3-5 additional agent
  hours plus an owner vocabulary review gate; it is not included here.
- Adding Mapdown or long-document translation should be treated as another iteration, not as
  overtime on this one.

Stop and ask the owner if implementation uncovers a need to change the public prompt contract,
persist anonymous translation text, weaken user ownership checks, publish unreviewed content,
or expand into a deferred roadmap item.

## 11. Autoplan review appendix

This appendix records the full CEO, design, engineering, and maintainer-DX review. The review
uses **SELECTIVE EXPANSION** posture but does not add product scope without roadmap authority.
The owner-approved D1-D5 choices remain controlling. Review findings may make those choices
safer or more explicit; they may not silently replace them.

### 11.1 Phase 1 — CEO review

#### Premise challenge

| Premise | Evidence examined | Verdict |
|---------|-------------------|---------|
| Writing needs a material-led start | Current `/writing` and trial begin with a coach plus blank editor; IA v2 names a prompt bank as the missing material shape | Valid, but prompt choice solves cold start rather than the whole difficulty of writing 150-250 words |
| A 48-prompt batch is justified | The owner explicitly selected D2; prompt content is cheap to store but expensive to trust and review | Keep the batch, but treat publication as 48 independent reviewed units, not one all-or-nothing launch |
| IELTS Task 1 can reuse the current writing evaluator | Current evaluation receives only prompt text and learner text; official Task 1 criteria require accurate reporting of visual facts | Invalid as originally underspecified; a canonical structured fact source is a release blocker |
| Saved translations are privacy-safe when saves are explicit | Explicit save matches DeepL's cloud-saved model, but text retention and logging still need definition | Valid after adding retention, cache, log-redaction, and user-scoped deletion rules |
| Writing measurement can wait | Prompt difficulty is not a writing ability vocabulary and the roadmap already separates the two | Valid; keep D4 |
| `next_drills` should stop being generated | It is parsed and stored but has no learner-facing consumer | Valid; keep D5 and the old-read compatibility seam |

The actual release outcome is therefore: **learners can deliberately choose a trustworthy
Writing assignment, reach feedback through a coherent editor, and explicitly keep a useful
translation without the product silently retaining text.** Catalogue size, row count, and UI
polish are inputs to that outcome, not the outcome itself.

Official IELTS guidance confirms that Academic Task 1 is an information-transfer task whose
Task Achievement score depends on selecting key features and reporting figures and trends
accurately. The implementation must evaluate against the information behind the visual, not
infer it from a filename or prompt sentence. Sources:
[IELTS Academic Writing format](https://ielts.org/take-a-test/test-types/ielts-academic-test/ielts-academic-format-writing),
[IELTS key assessment criteria](https://ielts.org/cdn/ielts-guides/ielts-writing-key-assessment-criteria.pdf).

#### What already exists

| Sub-problem | Existing seam | Review decision |
|-------------|---------------|-----------------|
| Multi-round Writing ownership | `writing_articles`, `writing_revisions`, `writing-article.server.ts` | Extend; do not create a parallel prompt-attempt system |
| Immutable assignment history | `writing_articles.essay_prompt` | Keep as the text projection; add nullable `prompt_id` and full versioned assignment snapshot |
| Coach registry and rubric | `writing-agents.ts` | Add `ielts_task1`; keep coaches in code, not D1 |
| Async evaluation and retry | `writing-article.server.ts`, status route, Retry feedback | Reuse and make prompt material available to every initial/retry path |
| LLM image/fact transport | `llm.server.ts` accepts text/inline data parts | Prefer compact canonical facts for scoring; image remains learner-facing and optional model context |
| Material editorial workflow | `scripts/material-seed/` intake/publish pattern | Reuse command shape and idempotent publication, without TTS |
| Translate validation/streaming/auth revalidation | `translate.tsx`, `translate.server.ts`, `bcailab-auth` event | Add Save to the completed-result state; do not fork translation execution |
| User-scoped DB style | Existing `WHERE user_id = ?` helpers and `requireUser()` routes | Require user scope in every saved-translation read and mutation |
| Confirmation behavior | Five native web `confirm()` calls | Replace through one shared dialog, not five local versions |
| Feedback-language storage | Reading and Writing local-storage helpers | Merge behind one shared helper with legacy fallback |
| Old `next_drills` payloads | Current normalizer already tolerates arrays | Stop prompting/generating; retain the optional normalized field |

#### Dream state delta

```text
CURRENT                              THIS ITERATION                         12-MONTH IDEAL
blank Writing + disconnected      -> reviewed material + explicit      -> measured writing dimensions +
tools + ephemeral Translate          saved work + coherent states          highest-leverage practice plan
                                             |                                      |
                                             +-- preserves prompt identity ----------+
                                             +-- preserves learner-loop seams -------+
```

The iteration moves toward the ideal by making Writing material a first-class entity and by
preserving stable provenance. It deliberately does not claim that prompt level is measurement.
Saved translations remain a workspace utility until a later, separately authorized learning
action consumes them.

#### Implementation alternatives

| Approach | Effort | Risk | Advantages | Costs | Decision |
|----------|--------|------|------------|-------|----------|
| A. Minimal pilot: 8-12 prompts, Task 2 only, simple saved list | M | Low | Smallest diff and fastest behavioral signal | Does not deliver owner-approved D2 or Task 1 breadth; repeats another migration/content pass later | Rejected; incomplete against D2 |
| B. Reviewed material platform: 48 drafts, structured Task 1 facts, explicit publish gates | L | Medium | Delivers D2, reuses article/evaluation seams, and future-proofs material without adding measurement | More validation, content review, and local QA | **Selected** |
| C. Full learning loop: B plus micro-writing stages, analytics, and writing mastery | XL | High | Closest to the 12-month moat | Reopens D4, needs a vocabulary and measurement design, and adds unapproved behavior | Deferred |

Approach B is the highest-completeness option inside the authorized lake. The review rejects a
silent reduction to A and a silent expansion to C.

#### Selective-expansion scan

The review considered staged micro-writing, product analytics, bulk saved-translation export,
automatic history, account-management UI, and writing mastery. None is required to make the
approved work correct. They remain outside this iteration; no TODO or roadmap priority is
created by this review. The two completeness additions below are inside the existing blast
radius and are not new product scope:

1. Task 1 material has one canonical structured source (`task_material_json`) containing the
   chart/table/process/map data, units, labels, editorial key features, and comparison facts.
   The visual asset, accessible table/long description, and evaluator context are derived from
   or verified against that source. A prompt cannot publish if any representation disagrees.
2. Saved translation rows are retained until the learner deletes them. Source and result text
   never appear in application logs, analytics, URLs, or page metadata. Saved surfaces return
   `Cache-Control: private, no-store`; the About/Translate copy states that manually saved text
   is stored in the account. The table uses a user foreign key with future-safe cascade behavior,
   while this iteration does not invent an account-deletion UI.

DeepL documents the same core trust contract: cloud text is stored only when a user manually
saves it and remains until deletion/account termination. Google separates Saved from ordinary
history and exposes individual deletion. Sources:
[DeepL saved translation storage](https://support.deepl.com/hc/en-us/articles/4404106202130-Data-storage-of-saved-translations),
[Google Translate history and Saved](https://support.google.com/translate/answer/6142480).

#### Temporal interrogation

| Implementation time | Decision needed before code | Resolution |
|---------------------|-----------------------------|------------|
| Hour 1: foundations | Can prompt, article, and save migrations deploy before their consumers? | Additive schema first; new code handles missing schema with the existing unavailable pattern |
| Hours 2-3: core logic | What is the Task 1 truth source? What proves Save follows a complete result? | Canonical `task_material_json`; short-lived server-signed completion proof with one completion id |
| Hours 4-5: integration | How do retries retain prompt context? How does popup auth retain output? | Load immutable article material for every retry; keep Translate result/proof in component state across revalidation |
| Hour 6+: polish/tests | What blocks publication and what can ship with zero published prompts? | Code may ship empty; production content remains draft until validation, independent review, and owner review |

Human-team scale is roughly 20-26 focused engineering/content-operation hours. Agent execution
is expected to compress that to 12-18 focused hours, but does not compress content judgment or
the 60-90 minute owner review gate.

#### CEO system architecture

```text
                    EDITORIAL / RELEASE SIDE

  48 JSON drafts ──> deterministic intake ──> independent review ──> owner gate
        |                     |                         |                  |
        | Task 1 facts        +-- no partial write ----+                  |
        v                                                                  v
  visual + table + alt text <── same canonical source ───────────> published prompts
                                                                          |
  ------------------------------------------------------------------------+--- auth boundary
                                                                          v
  /writing catalogue ──> prompt editor ──> first submit/batch ──> evaluator ──> feedback
         |                    |                      |                     |
         |                    +-- no preview write  +-- immutable --------+-- Task 1 facts
         +-- draft/retired excluded

  Translate stream ──> completed result + signed proof ─ explicit Save ─> private D1 row
         |                         |                     |                    |
         +-- anonymous allowed ---+                     +-- requireUser -----+
                                                        +-- unique server completion id
```

#### Data flows and state machines

```text
PROMPT: draft -> reviewed -> published -> retired
           |         |           |          |
           |         |           |          +-- cannot start; old snapshots stay valid
           |         |           +-- catalogue/start allowed
           |         +-- owner gate still required
           +-- never learner-visible

Invalid transitions: draft -> published without review evidence; retired -> implicit published;
article snapshot -> rewritten after prompt edit. Validator/publish command and immutable article
fields prevent them.

TRANSLATION RESULT: idle -> streaming -> complete -> saving -> saved
                              |           |          |         |
                              +-> failed  +-> retry  +-> error +-> delete -> absent

Invalid transitions: streaming/failed -> saved; anonymous -> persisted; saved foreign id ->
visible. Server validation, `requireUser`, completed-result token, and scoped queries prevent them.

INPUT ──> VALIDATE ──> TRANSFORM ──> PERSIST ──> OUTPUT
  |           |             |             |           |
  | nil       | enum/limit  | asset/fact  | conflict  | stale cursor
  | empty     | ownership   | mismatch    | partial   | retired/deleted
  v           v             v             v           v
reject with   field error   no publish    idempotent  refresh/not-found
no mutation                               batch/save
```

#### Error and Rescue Registry

| Method/codepath | Failure class | Rescued | Rescue action | User sees |
|-----------------|---------------|---------|---------------|-----------|
| Prompt intake | `PromptValidationError` | Yes | Report file, field, and reason; write nothing | Editorial CLI error |
| Task 1 representation check | `PromptMaterialMismatchError` | Yes | Block publish and name mismatched representation | Editorial CLI error |
| Prompt publish | `D1PublishError` | Yes | Abort batch; safe idempotent retry | Editorial command failure |
| Prompt catalogue loader | `WritingSchemaUnavailableError` | Yes | Existing schema-missing log plus 503 state | Writing temporarily unavailable |
| Initial prompt submission | `PromptUnavailableError` | Yes | Reject draft/retired/stale prompt without article and retain draft client-side | Refresh assignment list or switch to freeform |
| Article + first revision | `D1BatchError` | Yes | Atomic D1 batch; no orphan article | Could not start; retry |
| Writing evaluation | `LlmRequestError` | Yes | Existing failed status and Retry feedback | Draft saved; retry feedback |
| Writing evaluation parse | `LlmOutputValidationError` | Yes | Mark failed, keep revision, log ids/model only | Draft saved; retry feedback |
| Task 1 factual evaluation | `TaskMaterialMissingError` | Yes | Never call model; mark configuration failure | Assignment temporarily unavailable |
| Saved translation validation | `SavedTranslationValidationError` | Yes | Reject empty/partial/oversize/language mismatch | Save-specific field error |
| Saved translation auth | `AuthenticationRequiredError` | Yes | Open existing login popup; retain result locally | Sign in to save |
| Saved translation proof | invalid/expired/tampered proof | Yes | Write nothing; keep result | Re-translate before saving |
| Saved translation insert | `D1SaveError` | Yes | Keep result and same signed completion id for retry | Couldn't save; retry |
| Duplicate Save | unique `(user_id, completion_id)` | Yes | Return matching existing row; mismatch is 409 | Saved once |
| Saved list cursor | `InvalidCursorError` | Yes | Reject malformed cursor; default only when absent | Refresh Saved translations |
| Saved list/detail/delete | absent or foreign id | Yes | Same not-found response; disclose nothing | Translation not found |

No rescue may log source text, translated text, essay text, or Task 1 learner answers. Logs may
include request id, row id, user id, model name, character/word counts, status, and normalized
error class.

#### Security and threat model

| Threat | Likelihood | Impact | Mitigation in plan |
|--------|------------|--------|--------------------|
| IDOR against saved item/article/prompt start | Medium | High | `requireUser`; every private query/mutation includes `user_id`; foreign=absent behavior |
| Sensitive translation text in logs/cache/URL | Medium | High | No content logging; POST bodies only; `private, no-store`; no text in metadata or query strings |
| Stored script/HTML in source or result | Medium | Medium | Length validation; React text rendering; never inject raw HTML |
| Oversized save or prompt JSON | Medium | Medium | Reuse translate limits; explicit JSON/field limits before D1/model calls |
| Prompt publication bypass | Low | High | Status constraint, deterministic validator, review manifest, owner gate |
| Task 1 visual disagrees with evaluator facts | Medium | High | One canonical source plus publish-time representation validation and adversarial fixtures |
| Save retry creates many copies | High | Low | Server-issued completion id and unique user/completion index |
| Browser history/back reveals saved body | Low | Medium | No-store responses; sensitive body not placed in URL |

No new dependency, secret, background queue, or external service is authorized by this plan.

#### Interaction edge cases

| Interaction | Edge case | Required behavior |
|-------------|-----------|-------------------|
| First prompt submission | Double submit | Disable while pending; server creates at most one article for the submission start key |
| Start prompt | Prompt retired after render | Server rejects; catalogue refreshes; no article row |
| Evaluate revision | Navigate away | Existing background task continues; article status is recoverable |
| Save translation | Double click/retry | Same signed completion id returns one matching row |
| Save translation | Login popup closed | Translation stays complete and unsaved |
| Save translation | Auth succeeds in same tab | Revalidation reveals Save without clearing source/result |
| Saved list | Empty | Explain explicit saving and link to Translate |
| Saved list | Item deleted in another tab | Detail/delete returns not found and returns to list |
| Mobile output reveal | Stream completes after user scrolls | Reveal only when output was not already in view; respect reduced motion |
| Drawer | Route changes while open | Close, restore scroll/inert state, then focus destination heading where appropriate |
| Confirmation dialog | Pending mutation | Confirm disabled; Escape/backdrop cannot duplicate mutation |

#### Code quality, performance, and operations

- Keep prompt domain parsing in one pure module consumed by seed scripts, DB boundaries, routes,
  and tests. Do not duplicate enums or Task 1 material validation.
- Keep saved-translation validation in one pure module shared by Save actions and no-JS paths.
- Make article + first revision atomic with D1 `batch`; the existing two-write seam can orphan
  an article if the second insert fails and lies directly in this feature's blast radius.
- Catalogue scale is 48 rows in this release; query published rows with an index on
  `(status, family, task_type, cefr_band)`. Do not add caching.
- Saved list uses keyset pagination, default 25 and hard cap 50, with index
  `(user_id, created_at DESC, id DESC)`. Never load every saved body into a global rail.
- Privacy-preserving operations log normalized error class and ids/counts only. No new metrics
  vendor or dashboard is justified in this iteration.
- At 10x load, LLM evaluation and Translate streaming fail before prompt reads or saved-list D1
  queries. Existing quotas and pending/failed feedback states remain the control points.

#### Deployment and rollback

```text
deploy additive migration 0016
        |
        v
verify tables/indexes locally and target D1
        |
        v
deploy compatible application code
        |
        +--> zero published prompts is a valid safe state
        |
        v
owner-reviewed publish command -> smoke catalogue/start/save/list/delete

ROLLBACK: stop content publish -> revert app code -> keep additive tables/data
              |                       |
              +-- retire prompts -----+-- no destructive down migration
```

Old code ignores additive tables/columns. New code must show the existing feature-unavailable
state if schema is missing. A rollback never drops saved user text or prompt/article provenance;
destructive cleanup requires a separate confirmed operation.

#### Failure Modes Registry

| Codepath | Failure mode | Rescued | Test | User-visible | Logged |
|----------|--------------|---------|------|--------------|--------|
| Intake/publish | invalid or partial batch | Yes | Unit + CLI dry run | Exact editorial error | ids/field only |
| Prompt start | stale/retired prompt | Yes | Integration | Refresh prompt | id/status |
| First revision | second write fails | Yes after atomic batch | Integration | Retry without orphan | ids/class |
| Task 1 evaluation | facts missing/mismatch | Yes | Unit + adversarial fixture | Assignment unavailable or retry | id/class only |
| LLM evaluation | timeout/empty/malformed/refusal | Yes | Parser + route verification | Revision retained, Retry | ids/model/class |
| Save | anonymous, partial result, duplicate, D1 failure | Yes | Unit + route verification | Sign in / cannot save / retry | ids/counts/class |
| Saved read/delete | foreign, absent, stale cursor | Yes | Integration | Not found / refresh | ids/class |
| Drawer/dialog | interrupted or route change | Yes | Browser keyboard QA | Stable focus/recovery | N/A |

There are no planned silent failures. A missing Task 1 fact contract would have been a critical
gap; the review makes it a publish-time and evaluation-time hard stop.

#### Test diagram

```text
NEW UX
  Writing catalogue/filter/empty/progress -> browser + route verification
  Prompt start/repeat/freeform/trial       -> route verification + browser
  Task 1 visual/table/alt/evaluation       -> pure validation + adversarial eval fixture + browser
  Translate Save/auth/list/detail/delete   -> validation + local D1 + browser
  Drawer/dialog/mobile reveal/wait states  -> keyboard/mobile/reduced-motion browser QA

NEW DATA
  draft JSON -> validator -> publish        -> pure unit + CLI dry run
  prompt -> article snapshot -> revisions   -> local D1 integration
  complete translation -> private save      -> local D1 ownership/idempotency
  historical next_drills -> normalizer       -> pure parser fixture

NEW ERROR PATHS
  invalid material / stale prompt / LLM malformed / schema missing / duplicate save /
  foreign id / stale cursor / popup cancel  -> one named test or browser scenario each
```

The hostile tests are: reverse a Task 1 trend while keeping fluent prose; alter a visual asset
without changing facts; submit Prompt Start and Save twice; request another user's saved id;
open the drawer then Tab repeatedly; delete a saved row in another tab. The chaos scenarios are
schema missing during deploy, D1 failure after validation, and LLM failure after revision commit.

#### Long-term trajectory

Reversibility: **4/5**. Prompt status and additive tables are reversible; published prompt ids
and user-saved text become durable contracts. The canonical Task 1 fact source prevents this
iteration from creating a second, visual-only content model that future evaluators cannot trust.
No writing mastery vocabulary or automatic translation retention is smuggled into the release.

#### CEO dual-voice review

The independent subagent raised eight concerns. Its strongest two were accepted as completeness
requirements: Task 1 needs a structured factual source and Saved translations needs an explicit
data lifecycle. Its recommendations to reduce D2 to an 8-12 prompt pilot, add staged micro-writing,
instrument product analytics, defer Saved translations, and split the release would change the
owner-approved direction without a feasibility blocker, so they remain rejected alternatives.

The Codex CLI voice could not run because the environment's policy rejected exporting the plan
to an external Codex service. The review did not work around that boundary. Phase 1 therefore ran
in `[subagent-only]` degradation mode.

| Dimension | Independent subagent | Primary review | Consensus |
|-----------|----------------------|----------------|-----------|
| Premises valid | Revise | Valid after two contract fixes | CONFIRMED: contracts need strengthening |
| Right problem | Misframed toward breadth | Material cold start is authorized but not the whole moat | DISAGREE on strategic priority |
| Scope calibration | Reduce/split | Keep D1-D5 boundary | DISAGREE; owner direction stands |
| Alternatives explored | Pilot/micro-writing missing | Now explicitly recorded and deferred | CONFIRMED after review |
| Competitive risk | Commodity breadth/history | Same risk, mitigated by trustworthy evaluation and explicit memory | CONFIRMED |
| Six-month trajectory | Conditional | Sound if facts/privacy gates land | CONFIRMED |

#### CEO completion summary

| Review area | Result |
|-------------|--------|
| Mode | SELECTIVE EXPANSION; no product expansion accepted |
| Architecture | Existing article/streaming seams reused; canonical Task 1 facts added |
| Errors | 13 named paths, 0 unresolved critical gaps |
| Security | 7 threats mapped; private text logging/cache rules added |
| Data/interaction | 10 adversarial interaction cases mapped |
| Code quality | Shared pure validators; atomic first revision required |
| Tests | UX/data/error diagram plus hostile/chaos cases added |
| Performance | Bounded indexed queries; no cache/new infra |
| Observability | ids/counts/errors only; content never logged |
| Deployment | Additive migration, empty-catalogue safe state, non-destructive rollback |
| Future | Reversibility 4/5; measurement and automatic history remain excluded |
| Design | UI scope confirmed; passed to Phase 2 |

#### Phase 1 implementation tasks

- [ ] **CEO-T1 (P1, human: ~2h / agent: ~20m)** — Task 1 material — define one canonical
  facts schema and validate visual, table, alt text, and evaluator context against it.
- [ ] **CEO-T2 (P1, human: ~1h / agent: ~15m)** — Saved translations — enforce explicit
  retention copy, no content logging, private/no-store responses, and user-scoped hard delete.
- [ ] **CEO-T3 (P1, human: ~1h / agent: ~15m)** — Writing persistence — make article plus
  first revision atomic and idempotent for first feedback submissions.
- [ ] **CEO-T4 (P1, human: ~2h / agent: ~25m)** — Evaluation trust — add Task 1 factual
  adversarial fixtures and label all band output as a coach estimate.

#### Decision Audit Trail

| # | Phase | Decision | Classification | Principle | Rationale | Rejected |
|---|-------|----------|----------------|-----------|-----------|----------|
| 1 | CEO | Keep English Studio separate from Mapdown | Mechanical | Focus/DRY | Products share no user outcome or rollback surface | Combined release |
| 2 | CEO | Keep the 48-prompt D2 batch | Owner-set taste | Completeness | The owner explicitly chose breadth; review gates each unit instead of reducing scope | 8-12 prompt pilot |
| 3 | CEO | Add canonical Task 1 facts as a hard contract | Mechanical quality gate | Explicit + complete | Accurate Task Achievement cannot be judged from a filename | Visual-only asset path |
| 4 | CEO | Keep explicit cloud Save | Owner-set taste | Trust | Directly answers the requested history gap without silent retention | Automatic/local-only history |
| 5 | CEO | Add retention, cache, and log rules | Mechanical security gate | Completeness | Explicit save alone does not define the sensitive-data lifecycle | Vague privacy-safe claim |
| 6 | CEO | Keep writing measurement deferred | Mechanical | Scope | No authorized writing vocabulary exists | Prompt level as measurement |
| 7 | CEO | Stop generating `next_drills` | Mechanical | Pragmatic/DRY | No consumer exists; parser compatibility costs little | New drill lifecycle |
| 8 | CEO | Do not add analytics/micro-writing/account UI | Borderline scope | Roadmap discipline | Valuable ideas but outside D1-D5 and not needed for correctness | Silent expansion |

**Phase 1 complete.** Independent subagent: 8 concerns, 2 absorbed as quality gates. Codex
CLI: unavailable by environment policy. Consensus: 4 of 6 dimensions aligned, 2 strategic
disagreements resolved in favor of the owner's explicit D1-D5 direction. Passing to Phase 2.

### 11.2 Phase 2 — Design review

#### Step 0: scope and existing system

UI scope is confirmed across Writing catalogue/detail/editor/trial, Translate workspace/Saved,
mobile navigation, destructive confirmations, Reading record controls, and Writing evaluation
wait states. Initial design completeness is **5/10**: the repository has a coherent shell and
tokens, but the original plan left hierarchy, partial states, mobile ordering, and focus recovery
to the implementer.

There is no repository `DESIGN.md` and no `TODOS.md`. This iteration does not introduce either
as a side project. The controlling design vocabulary is the existing implementation:

| Existing pattern | Reuse decision |
|------------------|----------------|
| `StudioShell`, `ToolNavRail`, `StudioPage` and width variants | Keep one left origin and the 1024px rail breakpoint |
| Playfair Display / Source Serif 4 / DM Mono | Reuse display, reading, and metadata roles |
| `global.css` spacing, paper/ink/rust, semantic status tokens | No new color, radius, shadow, or spacing system |
| Reading's CEFR catalogue | Reuse graded, open-not-locked grouping; reduce its card density for 48 prompts |
| Translate's two-pane desktop workspace | Preserve at >=1024px; intentionally reorder controls on smaller screens |
| Writing article/revision surface and progress | Link to them; do not create a parallel history UI |

The gstack designer binary was present, so visual generation was attempted as required. It had
no configured API key and generated/uploaded nothing. Phase 2 therefore uses the existing UI,
local browser QA, and text wireflows; no mockup is presented as approved.

#### Step 0.5: design dual voices

##### CLAUDE SUBAGENT (design — independent review)

The independent reviewer found seven issue groups. The P0 findings were ambiguous Writing
hierarchy, incomplete interaction states, no route/result-snapshot decision for Saved, and
missing 375/768 keyboard/screen-reader contracts. It also warned against presenting 48 equal
cards, badge-heavy prompt metadata, decorative empty states, token-by-token live announcements,
and focus indicators removed by the current Translate styles.

##### CODEX SAYS (design — unavailable)

The external Codex design voice was not retried after environment policy rejected exporting the
repository plan. Phase 2 ran in `[subagent-only]` mode, with the primary review checking the
independent findings against the live components and CSS.

| Litmus check | Independent voice | Primary review | Consensus |
|--------------|-------------------|----------------|-----------|
| Product unmistakable in first screen | Yes | Yes | CONFIRMED |
| One strong visual/work anchor | Partial | Partial | FIX: one primary action and workspace |
| Page scannable from headings | Partial | Partial | FIX: fixed section order |
| Each section has one job | Partial | Partial | FIX: separate Continue, Prompts, Pieces |
| Cards are necessary | No for history; limited for prompts | Same | CONFIRMED |
| Motion improves hierarchy | Partial | Partial | FIX: reveal only, reduced-motion safe |
| Premium without decorative shadows | Yes | Yes | CONFIRMED |

#### Pass 1: information architecture — 6/10 -> 9/10

Writing and Translate use the following fixed hierarchy. Constraint worship: a Writing learner
must be able to identify only three things in the first viewport — **continue**, **choose an
assignment**, or **start freeform**. A Translate learner sees only **language/input**, **run the
translation**, then **the result and its explicit memory action**.

```text
/writing  (wide)
  H1 Writing                                      [New freeform piece]
  Continue one piece (only when a recoverable unfinished piece exists)
  Prompt catalogue
    Family: All | General English | IELTS Academic      (URL query)
    General: CEFR A2 | B1 | B2 | C1                     (URL query)
    IELTS: Task 1 | Task 2                              (URL query)
    compact assignment list, <=2 columns desktop / 1 mobile
  Your pieces (row list, recent first)                 [View progress]

/writing/prompts/:slug  (wide)
  assignment -> target/time -> Task 1 visual -> data disclosure -> Start writing link
  neither preview nor Start writes; the first feedback submission is the creation boundary

/writing/new  (standard)
  freeform coach + editor, retaining the current behavior

/writing/:id  (workspace/detail)
  immutable assignment context + editor/revisions + honest evaluation status

/translate  (workspace)                 local tabs: Translate | Saved
  language/input -> Translate -> immutable completed-result snapshot -> Copy / Save

/translate/saved  (wide)                private row list, newest first
/translate/saved/:id  (standard)        private detail, Copy / Delete / Back to saved
```

Opening a Prompt detail and choosing `Start writing` never write data; Start navigates to the
prompt-backed editor. The first feedback submission is pending/idempotent and atomically creates
the article plus Round 1. Family/task/level filters are query parameters so refresh and Back
preserve the catalogue. CEFR is a secondary control only for General; IELTS never pretends to
have a CEFR equivalence. The trial starts on one reviewed featured prompt; `Use your own topic`
is secondary.
Switching modes with a non-empty draft uses the shared confirmation dialog and preserves the
text when confirmed; feedback always follows the visibly active assignment.

#### Pass 2: interaction states — 4/10 -> 9/10

| Feature | Loading | Empty | Error | Success | Partial/stale |
|---------|---------|-------|-------|---------|---------------|
| Prompt catalogue | Preserve page frame; labelled row skeletons | “No reviewed assignments match these filters” + Clear filters; zero published globally shows feature-unavailable copy + Freeform | Inline retry without hiding freeform/pieces | Count and assignment rows | Retired after load: Start rejects, refreshes, keeps filter |
| Prompt detail/editor/submit | Detail and editor shells remain readable; first submit says “Saving…” | Missing/retired returns catalogue notice | Submit error keeps draft and assignment | One article plus Round 1, then feedback wait | Duplicate transport retry resolves to the same start key/article |
| Task 1 asset | Reserve aspect ratio | Publication blocks missing asset/table | Image failure reveals canonical table and long description | Visual plus data disclosure | Visual is never the only source of facts |
| Writing draft/evaluation | “Saving your draft…” then saved pending page | N/A | Failed state keeps draft + Retry feedback | Feedback appears and focus stays stable | After 15s: “Your draft is saved. Feedback is taking longer than usual—you can leave and return.” No fake stages or percentage |
| Translate | Input remains usable only until submit; status announces once | Initial output explains where result appears | Error stays near action; source remains | Immutable result snapshot, Copy and Save | Stream text is selectable but not saveable; one separate live status announces start/complete/error, not every token |
| Translate after input edit | N/A | N/A | N/A | Displayed output remains the prior immutable snapshot | Label “Last translation — source changed”; Save saves that exact displayed source/language/result snapshot; next Translate replaces it |
| Save/auth | Save -> “Saving…” | Anonymous: sign-in action | Keep snapshot/proof; “Couldn't save — Retry” | “Saved” link to detail, one row on retry | Popup cancel leaves complete unsaved snapshot; auth success reveals Save without clearing it |
| Saved list/detail | Keep heading/row geometry | Explain manual saving and link to Translate | Retry; foreign/absent is same not-found | Row/detail with source preview, language pair, date | Keyset next page; deleted in another tab returns to list notice |
| Delete dialog | Confirm disabled while mutation pending | N/A | Dialog stays open with error | Close and remove row | Cancel/failure restores invoker focus; success focuses next row, previous row, then empty-state heading |
| Mobile drawer | N/A | N/A | Semantic nav remains usable without animation | Trap, Escape/backdrop close, scroll restore | Route change clears inert/lock and focuses destination heading when navigation initiated there |

Completed translation state owns an immutable result snapshot: source text, result text, source
and target languages, detected language, and the server-signed completion proof/id. Input edits
never rewrite that snapshot. A failed or interrupted stream has no proof and cannot be saved.

#### Pass 3: journey and emotional arc — 6/10 -> 9/10

| Horizon | Learner does | Intended feeling | Product support |
|---------|--------------|------------------|-----------------|
| First 5 seconds | Opens Writing or trial | Oriented, not judged by 48 choices | Continue/featured assignment first, grouped catalogue second, one primary action |
| First 5 minutes | Reads a clear assignment, drafts, submits | Work is safe; waiting is honest | Persistent prompt/targets, “draft saved” copy, no synthetic progress stages |
| First feedback | Reads estimate and revises | Coached, not officially graded | All bands labelled “Coach estimate”; strengths precede highest-leverage revision |
| Repeat attempt | Starts the same prompt again | Practice, not failure | Attempts are independent and summarized neutrally by count/latest/best |
| First Save | Explicitly saves a useful translation | In control of sensitive text | “Saved to your account until you delete it”; immediate detail/delete path |
| Long term | Returns to pieces/progress/Saved | Continuity without surveillance | No automatic translation history; writing provenance survives prompt retirement |

#### Pass 4: specificity and AI-slop risk — 5/10 -> 9/10

This is **app UI**, not a landing page. Prompt tiles exist because selecting an assignment is the
interaction, but the catalogue is at most two columns on desktop and one on mobile. Each tile/row
shows title, one descriptive line, at most three metadata values, one attempt state, and one
navigation affordance. `Your pieces` and Saved are rows, not cards. Topic is prose, not another
badge. No new gradients, decorative icons, emoji empty states, glass, blobs, carousel, fake
completion percentage, or universal bubbly radius. Task 1 imagery communicates examinable data
only. The first viewport has exactly one highest-weight action.

Hard-rejection checklist: no generic SaaS card grid; no weak action; no busy image behind text;
no stacked-card workspace; no repeated mood copy. All seven litmus checks pass after the hierarchy
and low-card-density rules above.

#### Pass 5: design-system alignment — 6/10 -> 9/10

- Catalogue and Prompt detail use `StudioPage` wide, Freeform/Saved detail use standard, and the
  editor/Translate use workspace only when the task needs it.
- Use existing semantic color and spacing tokens. Do not add a new palette, corner language,
  shadow system, or ornamental icon vocabulary.
- Add one shared `ConfirmDialog` vocabulary and one shared local tab treatment; do not create
  per-route dialog/tab CSS.
- All new and affected interactive controls receive a visible `:focus-visible` outline using
  existing action tokens. Removing `outline` without a replacement is forbidden, including the
  Translate textarea/selects.
- Validate light/dark themes and 200% zoom. Body and utility text retain WCAG AA contrast and
  body-equivalent copy remains at least 16px.

The absence of `DESIGN.md` is noted but does not justify pausing this scoped iteration for a new
design-system project; the implemented tokens and components are sufficiently explicit.

#### Pass 6: responsive and accessibility — 4/10 -> 10/10

| Viewport | Required layout |
|----------|-----------------|
| 375px | Mobile drawer; one-column prompt list; full-width primary action; Task 1 prompt then visual then disclosure/table; Translate language controls -> input (max ~40dvh) -> Translate button -> page-flow output -> Copy/Save. Page owns vertical scroll; output does not become a short nested scroller. Respect `env(safe-area-inset-bottom)`. |
| 768px | Still use drawer and single-column Translate. Prompt list may reach two columns only when every row preserves title/metadata/touch targets. Test software keyboard and landscape. |
| >=1024px | Persistent rail; wide catalogue; two-pane Translate with output in the same first workspace; Task 1 detail may use adjacent context/editor only when reading order remains prompt-first. |

All touch targets are at least 44px; recording primary controls are at least 48px. Task 1 data
tables may scroll horizontally inside a labelled region but cannot clip the page. Images use a
concise alt summary; the disclosure contains the full canonical data table/long description and
is keyboard reachable. Streamed tokens are not an `aria-live` firehose: a separate `role=status`
region announces translating, complete, and error. The Reading recorder accessible name changes
between Start and Stop and permission failures use an alert. Drawer and dialog implement focus
entry/trap, background inertness, Escape, backdrop semantics, scroll lock/restore, and invoker
focus restoration. Automatic output reveal occurs only when output is outside the viewport and
uses instant scrolling under `prefers-reduced-motion`.

Browser acceptance covers 375, 768, desktop, Tab/Shift+Tab/Escape, VoiceOver accessibility tree,
200% zoom, dark/light, and reduced motion.

#### Pass 7: design decisions — 8 resolved, 0 deferred

| Decision | Resolution | Classification |
|----------|------------|----------------|
| Prompt opening writes immediately? | Preview and Start are read-only navigation; first feedback submit is the idempotent atomic creation boundary | Mechanical safety |
| Writing first-screen order | Continue (conditional) -> Prompts -> Your pieces; Freeform is header secondary action | Hierarchy |
| Trial featured/freeform switching | Featured default; non-empty switch confirms and preserves text; active context is explicit | Taste, auto-selected for safety |
| Task 1 reading order | Assignment -> goal -> visual -> accessible data disclosure -> Start; DOM facts remain adjacent | Accessibility |
| Saved routes | `/translate/saved` list and `/translate/saved/:id` independent detail with mobile Back | IA |
| Input edited after a translation | Keep immutable displayed snapshot, mark it last/stale, Save exact snapshot | Trust |
| Long evaluation copy | Honest saved/pending copy after submit; longer-than-usual at 15s; Retry only after failed | Trust |
| Focus after delete | Next row -> previous row -> empty heading; cancel/failure returns invoker | Accessibility |

No design decision from this review changes D1-D5. No `TODOS.md` item is created: the identified
P0/P1 design debt is required in this iteration, and the broader design-system documentation
project is not authorized.

#### Design implementation tasks

- [ ] **DES-T1 (P1, human: ~2h / agent: ~20m)** — Writing routes — implement the fixed
  Continue/Prompts/Pieces hierarchy, URL filters, preview-first Start flow, and low-card-density
  layouts. Verify with route tests and 375/768/desktop browser journeys.
- [ ] **DES-T2 (P1, human: ~2h / agent: ~20m)** — Interaction states — implement every row in
  the state matrix with recovery action, immutable result snapshot, and deterministic focus.
  Verify with component/browser state fixtures.
- [ ] **DES-T3 (P1, human: ~2h / agent: ~20m)** — Responsive/a11y — implement drawer/dialog
  focus contracts, status live regions, Task 1 data alternative, touch sizes, mobile Translate
  order, and focus-visible treatment. Verify with keyboard, VoiceOver tree, reduced motion, and
  200% zoom.
- [ ] **DES-T4 (P2, human: ~1h / agent: ~10m)** — Design consistency — keep prompt metadata
  bounded, histories row-based, and new CSS on existing tokens. Verify light/dark visual review
  and token/diff inspection.

#### Design completion summary

| Review area | Result |
|-------------|--------|
| System audit | No `DESIGN.md`; strong implemented shell/token vocabulary reused |
| Initial -> final | 5/10 -> 9/10 |
| Information architecture | 6 -> 9 |
| States | 4 -> 9 |
| Journey | 6 -> 9 |
| AI slop | 5 -> 9 |
| Design system | 6 -> 9 |
| Responsive/accessibility | 4 -> 10 |
| Decisions | 8 resolved, 0 deferred |
| Mockups | 0 generated; local designer lacked API configuration |
| Not in scope | New design-system project, visual rebrand, analytics, automatic history |

**Phase 2 complete.** Codex CLI: unavailable by environment policy. Independent design
subagent: 7 issue groups, all converted into implementation constraints. Consensus: 7 of 7
litmus dimensions confirmed after fixes, 0 unresolved disagreements. Passing to Phase 3.

### 11.3 Phase 3 — Engineering review

#### Step 0: scope challenge and existing seams

Review mode is **FULL_REVIEW**. The D1-D5 scope is accepted as-is: no alternate practice
system, automatic history, writing measurement, provider, queue, cache, or admin service is
needed. The implementation reuses the existing article/revision, `waitUntil`, LLM routing,
Translate validation/quota/auth popup, material-seed command shape, and Studio shell seams.

| Existing seam | Engineering decision |
|---------------|----------------------|
| `writing_articles` + `writing_revisions` | Extend with provenance/snapshot/idempotency; do not add attempt tables |
| `writing-article.server.ts` | Keep orchestration but make DB transitions atomic/CAS-protected |
| `writing-eval.server.ts` + `llm.server.ts` | Add Task 1 context/versioned parsing; keep one model gateway |
| `translate.tsx` + stream/no-JS shared validation | Add a completion proof to both success paths; Save is a separate authenticated mutation |
| `bcailab-auth` popup message | Revalidate auth while retaining the completed snapshot/proof |
| `scripts/material-seed/` | Reuse explicit local/remote CLI mechanics and hash-gated idempotency; no TTS/R2 |
| Vitest + local D1/browser verification | Pure logic in Vitest; bindings verified against local runtime per repository rules |

The repository baseline reported by the independent reviewer was clean (`pnpm typecheck` and
`pnpm test`, 24 files / 531 tests). Relevant new prompt/save paths have no existing tests, so
the coverage diagram below is the implementation contract rather than a claim of coverage.

#### Dual-voice engineering review

The independent reviewer reported five P0 and three P1 groups. The primary review verified the
load-bearing findings in current code and accepted the complete fixes. The external Codex CLI
voice remained unavailable because repository-plan export was rejected by environment policy.

| Topic | Independent reviewer | Primary review | Resolution |
|-------|----------------------|----------------|------------|
| Full assignment snapshot | Required | Required | CONFIRMED |
| Frozen prompt/review/hash contract | Required | Required | CONFIRMED |
| Server proof of complete translation | HMAC proof | Same, with server completion id | CONFIRMED |
| Prompt Start creation time | Create zero-revision article | No write until first feedback submit | DISAGREE; primary selected minimal durable boundary |
| Remix Saved routes | Escape leaf routes | Same | CONFIRMED |
| Rollback below new durable contracts | Unsafe | Same | CONFIRMED |
| Revision/evaluation concurrency | Unique + generation CAS | Same | CONFIRMED |
| Private content logs/cache | Current leak exists | Same | CONFIRMED |

The Start disagreement is mechanical, not product taste. Without autosave, an empty article
created at Start preserves no learner text and pollutes Continue/Your pieces. The selected flow
is preview -> assigned editor -> atomic first submit. A server-rendered `start_key` makes a
transport retry idempotent while a deliberate later attempt receives a new key.

#### 1. Architecture review — 6 issues found, all folded

1. **[P0] (confidence 10/10) Incomplete immutable assignment.**
   `writing-article.server.ts:67-76` currently sends only `topic`, and retry does the same from
   `article.essay_prompt` at lines 246-262. A Task 1 retry also needs taxonomy, target, coach,
   canonical facts, accessible representation, and asset digest. The article therefore stores
   `assignment_snapshot_json` with `schema_version: 1`, `prompt_id`, `content_hash`, title,
   prompt text, taxonomy, target words/minutes, coach id, material, alt/long description, and
   content-addressed asset path. Every evaluation/retry reads the snapshot, never the mutable
   catalogue. `essay_prompt` remains its text projection for old code/data.

2. **[P0] (confidence 9/10) Prompt/review contract was not closed.** The original field list
   allowed broad `family`/`task_type` strings while the state diagram claimed a `reviewed`
   transition absent from the status enum. Freeze one discriminated schema:
   `family = general | ielts`, `task_type = guided | academic_task_1 | academic_task_2`, and
   `prompt_kind` enumerates general form, Task 1 line/bar/pie/table/process/map, or Task 2
   opinion/discussion/problem_solution/advantages_disadvantages. Status is
   `draft -> reviewed -> published -> retired`. A SHA-256 manifest binds JSON, derived SVG,
   accessibility output, independent review, and owner-approved hash. Same-hash publish is a
   no-op; changed content returns to draft; a batch failure publishes nothing.

3. **[P0] (confidence 10/10) Save completion was client-asserted.** The current stream success
   frame at `translate_.stream.ts:63-65` contains only `done` and remaining quota. A manipulated
   client could POST partial/arbitrary content. On stream completion, the server accumulates the
   emitted translation and signs a short-lived proof with `SESSION_SECRET`, domain-separated as
   `bcailab:translate-save:v1`. The compact token carries version, issued/expiry time, a random
   `completion_id`, subject (`user:id` or `anon:cookie`), and SHA-256 digest of normalized
   source/result/languages—not raw text. Save recomputes/verifies it; signed-in Save may accept
   the current user subject or the same anonymous cookie after popup auth. The no-JS success
   response receives the same proof. Expired/tampered/cross-subject/partial output writes zero.

4. **[P0] (confidence 10/10) First-submit atomicity and idempotency.** Current creation performs
   separate calls at `writing-article.server.ts:48-61`; revision failure can orphan an article.
   The prompt-backed and freeform editors both receive a server-rendered `start_key`; first
   submit uses one DB helper with deterministic IDs and `DB.batch([article, revision])`, unique
   `(user_id, start_key)`, then reads the matching result. Cloudflare documents D1 batches as
   SQL transactions that abort/roll back the sequence when a statement fails. Subsequent
   revisions use a single-statement round allocation plus a unique round index. Source:
   [Cloudflare D1 `batch()`](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch).

5. **[P0] (confidence 9/10) Leaf-route and ownership boundary.** `translate.tsx` is a leaf and
   renders no `<Outlet>`. Use `translate_.saved.tsx` for `/translate/saved` and
   `translate_.saved_.$id.tsx` for the independent detail; confirm with the Remix route manifest.
   Every private DB helper accepts `userId` in its public signature and includes it in SQL.
   Article status/detail/retry likewise move to owner-scoped lookup/update helpers so route code
   cannot forget the second ownership check.

6. **[P0] (confidence 9/10) Rollback must respect durable contracts.** Current
   `getWritingAgentOrDefault` falls unknown coach ids back to Task 2 at
   `writing-agents.ts:104-105`; old code could silently mis-score `ielts_task1`. Once a Saved row
   exists, rolling back to code with no delete surface also violates retention control. The
   release history therefore keeps a compatibility-floor commit that can read/retry Task 1
   snapshots and read/delete Saved rows with creation/catalogue entry points disabled. After
   new durable data is enabled, rollback targets that floor or rolls forward; it never returns
   to `main`. No remote content/data enablement happens in this task.

Architecture after fixes:

```text
48 authored JSON ─> pure parse ─> derive SVG/table/longdesc ─> hash manifest
      |                    |                     |                  |
      +-- invalid ---------+--> exact error/no write              owner hash gate
                                                                   |
                                               reviewed D1 batch <-+
                                                       |
catalogue summary query -> prompt detail -> assigned editor (no write)
                                                       |
first submit + start_key -> [article + Round 1 D1 batch] -> waitUntil eval gen=1
                                      |                         |
                                      +-- snapshot v1 ----------+-> feedback CAS

Translate request -> model stream -> accumulate complete result -> HMAC proof
       |                     |                         |               |
       +-- partial/error ----+-------------------------+--> no proof  |
                                                                      v
signed-in Save -> verify subject/expiry/digest -> insert completion_id -> private row
```

Cloudflare D1 enforces foreign keys and supports cascade actions by default; Saved uses
`user_id REFERENCES users(id) ON DELETE CASCADE`, while prompts are retained/retired and article
provenance uses `ON DELETE RESTRICT`. Source:
[Cloudflare D1 foreign keys](https://developers.cloudflare.com/d1/sql-api/foreign-keys/).

#### 2. Code-quality and error review — 5 issues found, all folded

1. **[P0] (confidence 10/10) Private model output is logged.**
   `llm.server.ts:236` logs `payload.slice(0, 300)` after JSON parse failure. That payload can
   contain a translation or learner quote. Replace it with task/request id, response length,
   model, and normalized error class only; callers stop logging raw provider error objects.

2. **[P1] (confidence 10/10) Evaluation retry can race late work.**
   `updateWritingRevisionFeedback` updates by id only (`packages/db/src/index.ts:1380`), and
   retry forces a status through the type cast at `writing-article.server.ts:235-239`. Add
   `feedback_generation` and `feedback_started_at`. Initial work owns generation 1; retry
   atomically claims a failed/stale row by incrementing generation; completion/failure updates
   require `(id, user_id, generation)`. Late old work changes zero rows.

3. **[P1] (confidence 10/10) Article deletion is a partial-write risk.**
   `writing.$id.tsx:183-189` deletes revisions then soft-deletes the article in two calls. The
   shared confirmation work touches this path, so replace it with an owner-scoped D1 batch. A
   first failure keeps both; a retry is idempotent.

4. **[P1] (confidence 9/10) DB entry point is already 2,459 lines.** New prompt and Saved types,
   mapping, and queries live in `packages/db/src/writing-prompts.ts` and
   `packages/db/src/saved-translations.ts`, re-exported by `index.ts`. Only the atomic helper and
   compatibility fields remain near existing Writing code. Do not move unrelated existing
   helpers in this branch.

5. **[P1] (confidence 9/10) Preference migration conflict and status prose need deterministic
   rules.** The new key is `bcailab-feedback-language`. When absent, a fixed legacy precedence
   applies: Writing key, then Reading key, then English; immediately persist the winner and
   remove both old keys. One shared custom event handles same-tab changes and `storage` handles
   other tabs. Writing shows “draft saved / feedback being prepared,” adds honest
   longer-than-usual copy at 15 seconds, and exposes Retry only for server `failed` or stale
   generation-claimable state—never a synthetic stage/percentage.

Error/rescue contract:

| Path | Production failure | Test | Error handling | Learner result |
|------|--------------------|------|----------------|----------------|
| Prompt parse/derive/hash | invalid enum/fact/asset mismatch | Unit + hostile fixtures | batch not called | exact editorial file/field error |
| Publish | D1 statement 17/48 fails | Local D1 fault | batch rollback | command fails, zero partial publish |
| Prompt submit | retired while editor open | Route/local D1 | reject before batch | draft retained; refresh/switch freeform |
| First batch | revision insert fails | Local D1 fault | D1 rollback | retry; no orphan |
| Evaluation | timeout/malformed/refusal | Parser/eval/route | generation-scoped failed state | draft retained; Retry |
| Retry | original task finishes late | Local D1 race | CAS ignores old generation | newest generation wins |
| Completion proof | tamper/expire/wrong subject | Unit | 400/403, zero write | re-translate to save |
| Saved insert | duplicate/mismatched id | Local D1 | same payload returns row; mismatch 409 | one Saved item or explicit conflict |
| Saved read/delete | foreign/absent | Local D1 | identical 404 | no disclosure |
| Private response | intermediary/browser cache | Header assertion | `private, no-store` | no reusable private body |
| Drawer/dialog | navigation/pending interruption | Browser keyboard | cleanup/focus rules | recoverable UI, no duplicate mutation |

No planned failure is silent. Schema-missing logs name migrations but never content. Pages that
contain identity, quota, essay feedback, a completion proof, or saved text return
`Cache-Control: private, no-store`; text never enters URL, metadata, analytics, or logs.

#### 3. Schema, migrations, and state invariants

Use two additive migrations:

```text
0016_writing_prompts.sql
  writing_prompts + catalogue/review indexes
  writing_articles: prompt_id, assignment_snapshot_json, start_key
  writing_revisions: feedback_generation, feedback_started_at
  unique article start key; unique article/round (after duplicate preflight)

0017_saved_translations.sql
  saved_translations with user CASCADE
  unique user/completion_id
  keyset index (user_id, created_at DESC, id DESC)
```

Server validation caps Saved source at the signed-in Translate limit (20,000 characters) and
result at 40,000 characters, rejects empty/failed/partial snapshots, validates language enums,
and verifies the proof before DB work. SQL adds complementary `length()`/status/JSON validity
checks where D1 supports them. Prompt summary queries do not return `task_material_json`; Saved
list queries return a 160-character source preview, never both full bodies.

Prompt publication is an editorial operation, not a migration. The command defaults to
validate/dry-run; `--local` writes local D1; `--remote` additionally requires the owner-approved
manifest hash. This task never executes the remote mode. Content-addressed assets are never
overwritten or deleted when a prompt is retired.

#### 4. Test review — diagram produced, 9 implementation gaps

```text
CODE PATHS                                             USER / OPERATOR FLOWS
[GAP] Prompt parser + discriminated union [UNIT]       [GAP] Browse/filter/back preserves query [BROWSER]
  +-- enum/null/length/duplicate boundaries              +-- zero match / zero published / retired stale
  +-- exact 24 general / 12 T1 / 12 T2 manifest         +-- prompt detail -> editor writes zero rows
[GAP] Task 1 canonical material [UNIT + EVAL]           [GAP] First submit + retry [LOCAL D1/BROWSER]
  +-- chart/table/process/map derivation                  +-- duplicate POST -> one article/revision
  +-- SVG/table/longdesc/hash agreement                   +-- same prompt new start_key -> new attempt
  +-- reversed trend/wrong figure factual detection      +-- prompt edit/retire -> old snapshot stable
[GAP] Assignment snapshot v1 [UNIT]                     [GAP] Async feedback [LOCAL D1/BROWSER]
  +-- old freeform article compatibility                  +-- pending/15s/stale/failed/retry/late result
  +-- Task 1 retry context exactly preserved             +-- generation CAS accepts only current work
[GAP] Completion proof [UNIT]                           [GAP] Translate -> auth -> Save [E2E]
  +-- valid/tampered/expired/user/anon/popup subject      +-- partial/error has no Save proof
  +-- source/result/language digest mismatch              +-- input edit labels immutable last result
[GAP] Saved validation/cursor [UNIT]                     +-- double Save -> one row; mismatch -> 409
  +-- length/language/cursor boundary                    [GAP] Saved ownership/delete [LOCAL D1/E2E]
[GAP] D1 helpers/migrations [LOCAL D1]                    +-- list/detail/copy/delete/pagination/foreign id
  +-- empty/existing DB + foreign_key_check              +-- cache headers contain private,no-store
  +-- batch rollback + unique indexes                    [GAP] Shared interaction regressions [BROWSER]
[GAP] Feedback-language migration [UNIT]                  +-- drawer/dialog/record/focus/reduced motion
[GAP] Historical next_drills [UNIT]                       +-- 375/768/desktop/200%/VoiceOver tree
  +-- old payload preserved; new prompt/schema absent
[GAP] Private logging regression [UNIT/LOCAL]
  +-- malformed model output emits no content substring

LEGEND: UNIT = Vitest pure deterministic test; LOCAL D1 = running binding verification;
        BROWSER/E2E = real route + auth/interaction; EVAL = live model quality report.
```

Specific test files/artifacts:

- `writing-prompt.test.ts`: schemas, Task 1 derivation, content hashes, 48 manifest counts, and
  hostile representation mismatches.
- `writing-eval.test.ts`: old feedback compatibility, Task 1 prompt context, fact-id validation,
  and coach-estimate labelling.
- `translate-save-proof.test.ts` and `saved-translation.test.ts`: proof matrix, lengths,
  languages, cursor, and conflict semantics.
- `feedback-language.test.ts`: shared/legacy/conflicting/invalid storage values and event payload.
- `esl-reading-eval.test.ts`: old payload retains drills; new prompt/heuristic produces none.
- Local D1 script/checklist: both migrations on empty and existing state, duplicate-round
  preflight, `PRAGMA foreign_key_check`, batch fault, idempotency, ownership, query plans.
- Live-model eval before any IELTS prompt is owner-published: at least eight human-reviewed
  fixtures (accurate and deliberately wrong Task 1 facts/trends plus stable Task 2 baselines),
  two runs each, 100% detection of seeded critical factual errors, no invented source facts,
  and coach-estimate variation no more than 0.5 band on identical input. Results are a review
  artifact, not a deterministic unit gate.

#### 5. Performance review — 3 issues found, all folded

1. `writing.tsx` currently calls `listWritingArticlesByUser` merely to probe schema, loading all
   rows before child loaders may load them again. Replace it with a constant-cost schema probe;
   homepage gets a bounded recent query and one grouped prompt-attempt summary query—no N+1.
2. Catalogue summary omits full material JSON/assets and handles 48 rows without caching. Saved
   list defaults to 25, caps at 50, uses keyset pagination and preview-only rows. Detail fetches
   one full body. Do not add KV/cache for private text.
3. Evaluation prompts include only the current immutable assignment, bounded prior feedback,
   and compact canonical fact references. Do not inline SVG/base64 when structured facts suffice.
   At 10x, quota/model latency remains the bottleneck; D1 queries stay indexed and bounded.

Verification includes `EXPLAIN QUERY PLAN` for catalogue attempt summary, recent pieces, Saved
keyset, owner detail/delete, and prompt lookup. A scan is acceptable only for the 48-row published
prompt catalogue, never per-user unbounded history.

#### Deployment, compatibility floor, and rollback

```text
commit/deploy compatibility floor (new fields optional; Task 1 read/retry; Saved read/delete)
        -> apply 0016 + 0017
        -> verify migrations/FKs/indexes/schema-missing rescue
        -> deploy creation/catalogue/Save UI
        -> owner-reviewed hash publishes content (separate explicit operation)

rollback after durable data:
        disable new entry points -> compatibility-floor code -> keep additive schema/data
        NEVER drop tables/assets or roll back to code that maps Task 1 to Task 2 / hides delete
```

This plan does not authorize deploy, remote migration, prompt publication, push, or destructive
cleanup. D1 Time Travel remains an operational last resort, not the routine rollback mechanism.

#### Worktree dependency and execution lanes

| Step | Modules | Depends on |
|------|---------|------------|
| Shared privacy/interaction foundations | web utils/components/routes/styles | — |
| Prompt/snapshot schema + DB APIs | migrations, packages/db, web domain utils | — |
| 48 artifacts + Task 1 derivation/review | scripts, public assets | prompt domain contract |
| Writing routes/evaluator | web Writing routes/utils/components | schema + prompt contract |
| Saved schema/proof/DB | migrations, packages/db, Translate utils | — |
| Saved/Translate UI | web Translate routes/components/styles | proof + Saved DB |
| Integrated QA/docs | docs, routes, styles | all lanes |

Conceptual Lane A is foundations; Lane B is prompt contract -> artifacts -> Writing runtime;
Lane C is proof/Saved DB -> Translate runtime. B and C can run in parallel after their contracts,
but both touch migrations, `packages/db` exports, `global.css`, and final docs. This execution uses
one worktree and focused sequential commits to avoid concurrent-user diffs; the dependency map is
retained for a future multi-worktree handoff. Integrated QA/docs is always last.

#### Engineering implementation tasks

- [ ] **ENG-T1 (P1, human ~3h / agent ~35m)** — Prompt domain — freeze discriminated schemas,
  Task 1 derivation, content-addressed assets, versioned snapshots, and hash review manifest.
- [ ] **ENG-T2 (P1, human ~2h / agent ~25m)** — Writing persistence — add 0016, owner-scoped
  DB APIs, atomic/idempotent first submit/delete, round uniqueness, and evaluation generation CAS.
- [ ] **ENG-T3 (P1, human ~3h / agent ~35m)** — Writing runtime/eval — add catalogue/detail/new/
  trial flows, snapshot-only Task 1 evaluator, coach-estimate output, and honest wait/retry states.
- [ ] **ENG-T4 (P1, human ~2h / agent ~25m)** — Translate proof/Saved — add completion HMAC,
  0017, bounded owner-scoped CRUD/keyset, conflict rules, no-store responses, and redacted logs.
- [ ] **ENG-T5 (P1, human ~2h / agent ~25m)** — Interaction foundations — shared language
  migration, dialog, drawer, record semantics, mobile reveal, and `next_drills` compatibility.
- [ ] **ENG-T6 (P1, human ~3h / agent ~40m + human review)** — Content/evals — generate all 48
  drafts/12 derived Task 1 assets, run validators/adversarial evals, and produce owner review pack;
  do not mark published.
- [ ] **ENG-T7 (P1, human ~3h / agent ~35m)** — Verification — unit/type/build, local D1
  migration/ownership/race/rollback checks, browser matrix, docs, changelog `in_review`.

#### Engineering completion summary

| Area | Result |
|------|--------|
| Scope challenge | Accepted as-is; no scope reduction/expansion |
| Architecture | 6 issues found, 6 complete fixes selected |
| Code quality/errors | 5 issues found, 5 complete fixes selected |
| Test review | Diagram produced, 9 gaps converted to required tests |
| Performance | 3 issues found, 3 bounded-query fixes selected |
| Failure modes | 11 mapped, 0 unresolved critical gaps after plan fixes |
| NOT in scope | Existing explicit exclusions retained; no TODO created |
| Outside voice | Independent subagent ran; Codex unavailable by policy |
| Parallelization | 3 conceptual lanes; sequential in this shared worktree |
| Lake score | 14/14 findings chose the complete correctness option |
| Unresolved engineering decisions | 0 |

**Phase 3 complete.** Independent engineering subagent: 8 issue groups. Primary review:
14 architecture/quality/performance findings plus 9 test gaps, all folded into the plan; one
mechanical Start timing recommendation was simplified without changing behavior. Codex CLI:
unavailable by environment policy. No unresolved engineering decision remains. Passing to
Phase 3.5 maintainer-DX review.

### 11.4 Phase 3.5 — Maintainer-DX review

#### Scope, persona, and time to hello world

Product type is an **internal editorial CLI plus local developer workflow**. Review mode is
**DX POLISH**: the feature needs a safe, learnable operator path, but this iteration does not
turn the prompt pipeline into a public platform or generic content framework.

**Developer persona card**

| Attribute | Definition |
|-----------|------------|
| Primary user | Solo maintainer who is also prompt editor and release operator |
| Review partners | Independent content reviewer, then owner approval |
| Existing knowledge | TypeScript, pnpm, this repository, and Cloudflare basics |
| Must not memorize | Wrangler persistence paths, raw SQL, script order, or publication invariants |
| Success | Edit one prompt, regenerate derived material, receive complete diagnostics, publish to the same local D1 used by `pnpm dev`, and verify the result |
| Trust boundary | No implicit network write; remote publication requires an explicit target and owner-approved manifest hash |

Current feature-specific TTHW is effectively unavailable because no Writing prompt CLI exists.
Using current direct-`tsx` and Wrangler conventions would take an estimated **35-50 minutes** of
repository archaeology. Target TTHW is **10 minutes or less** from installed checkout to sample
validation, migration, local publication, and verification; a one-prompt edit-to-clean rerun
must take **2 minutes or less**. Human review of all 48 prompts is deliberately excluded.

#### Developer empathy narrative

> I need to improve a Writing assignment without rediscovering which JSON fields are canonical,
> which local D1 my dev server reads, or whether a publish command might touch production. I want
> one command to show the workflow, one validator to report every fixable problem at once, and a
> receipt that tells me exactly what hash and target were written. When something fails, I need
> the file, JSON path, reason, and recovery command; I should never have to inspect SQL or wonder
> whether seventeen of forty-eight prompts were partially published.

#### Competitive DX benchmark and magical moment

| Experience | Current project pattern | Post-review target |
|------------|-------------------------|--------------------|
| Discovery | Direct script paths found in per-pipeline READMEs | One `pnpm writing-prompts --help` entry |
| Safe defaults | Existing material publish treats no `--local` as remote | All bare/check commands read-only; publish requires local or remote target |
| Feedback | Script-specific errors and late environment failures | Aggregate stable diagnostics plus exact recovery command |
| Idempotency | Material pipeline has useful resumable/idempotent patterns | Transactional prompt batch, same-hash no-op, changed hash returns to review |
| Learning | Material pipeline documents a multi-step workflow | One canonical ordered quick start with expected receipts |

Competitive tier after fixes is **Competitive internal tooling**. The magical moment is a
single terminal session where `validate` reports all 48 prompts and 12 Task 1 representations
consistent, then local publish prints the exact target, manifest hash, status counts, and the
next verification command. It must require no credentials or network access until the operator
explicitly selects a write target.

The golden path is:

```text
pnpm writing-prompts --help
pnpm writing-prompts preflight --local
pnpm writing-prompts validate && pnpm writing-prompts derive --check
pnpm writing-prompts review-pack
pnpm writing-prompts publish --local --manifest <current-sha256>
pnpm writing-prompts verify --local
```

`preflight --local` and `publish --local` target `apps/web/.wrangler/state`, the same persistence
used by `pnpm dev`. The CLI prints the exact local migration command if migration 0016 is absent.
Bare `publish`, unknown targets, and `--remote` without the exact current 64-character
owner-approved hash fail before Wrangler is invoked.

#### Dual-voice DX challenge

The independent maintainer-DX reviewer inspected the current package scripts, material pipeline,
workflow docs, and implementation plan. The external Codex voice remained unavailable because
the environment rejected repository-plan export; it is recorded as N/A rather than fabricated
cross-model agreement.

| Dimension | Independent subagent | Primary review | Result |
|-----------|----------------------|----------------|--------|
| Getting started under 10 minutes | Blocking without one root command | Same | SINGLE-VOICE ALIGNED |
| Naming is guessable | Use `review-pack`, never imply automated approval | Same | SINGLE-VOICE ALIGNED |
| Errors are actionable | Aggregate file/JSON-path diagnostics and recovery | Same | SINGLE-VOICE ALIGNED |
| Docs are findable | One pipeline README linked from Writing/workflow docs | Same | SINGLE-VOICE ALIGNED |
| Upgrade is safe | Version artifacts, keep old reads, compatibility floor | Same | SINGLE-VOICE ALIGNED |
| Environment is safe | Read-only defaults; explicit local/remote target | Same | SINGLE-VOICE ALIGNED |

There are zero reviewer disagreements. Cross-model confirmation is unavailable, so every P0
operator-safety finding remains independently verified in implementation tests.

#### Nine-stage maintainer journey

| Stage | Initial friction | Resolution and evidence |
|-------|------------------|-------------------------|
| 1. Discover | Root scripts expose no editorial entry | `pnpm writing-prompts --help` lists the ordered journey and examples |
| 2. Preflight | Root and app Wrangler state can diverge | `preflight --local` names target, migrations, and artifact permissions without network writes |
| 3. Author | Schema and examples live only in the plan | Commit a versioned template/example per prompt kind; JSON-path validation errors |
| 4. Derive | SVG, table, long description, alt, and hash may drift | Canonical JSON only; `derive --write` regenerates and `derive --check` detects drift |
| 5. Validate | Fail-fast creates repeated cycles over 48 files | Stable-sort and report all errors; nonzero exit with counts and next actions |
| 6. Review | `review` could imply judgment is automated | `review-pack` creates a manifest/checklist and never changes editorial status |
| 7. Local schema | Operators reconstruct Wrangler flags | One named local migration script; absent schema prints the copy-paste command |
| 8. Publish/verify | No operator receipt or atomicity proof | Transactional idempotent local publish, explicit receipt, separate verify command |
| 9. Remote/recover | Existing seed precedent can default remote | No inferred target; hash-gated remote; compatibility-floor rollback, no destructive cleanup |

#### First-time maintainer confusion report

| Confusion | Initial answer | Resolution |
|-----------|----------------|------------|
| Which command starts the workflow? | Read scripts and guess | Root help command |
| Does validation write files or D1? | Unspecified | Help labels read/write/network behavior for every subcommand |
| Which Task 1 representation is canonical? | Several artifacts appear editable | JSON facts only; derived outputs are checked/generated |
| Did `review-pack` approve content? | Name could imply yes | It creates evidence only; reviewer and owner remain explicit gates |
| Which local database receives rows? | Root/app Wrangler ambiguity | Named target equals `pnpm dev` persistence path |
| Did a failed batch partially publish? | Requires SQL inspection | Transaction plus status/hash receipt and `verify --local` |
| Can a command accidentally reach production? | Existing pipeline precedent says yes | New CLI refuses all writes without an explicit target |
| What does rollback mean after Saved/Task 1 data exists? | Old main appears tempting | Compatibility-floor runbook; entry points disabled, additive data retained |

All eight items are addressed in this implementation rather than deferred.

#### What already exists

- Root pnpm scripts provide the discoverable entry point pattern; no dependency or package is
  required for the dispatcher.
- `scripts/material-seed/` provides useful validation, idempotency, resumability, and Wrangler
  invocation patterns. Its implicit-remote default is explicitly not reused.
- `docs/workflow.md` already owns local/preview/production migration instructions; the Writing
  pipeline README links to it rather than duplicating environment policy.
- Vitest covers pure deterministic behavior; the real local D1 binding verifies migrations,
  batch rollback, ownership, query plans, and application visibility.
- `docs/changelog.md`, roadmap `in_review`, and the compatibility-floor commit provide the
  release/audit trail. No separate versioning service is needed.

#### Pass 1 — Getting started: 3/10 -> 9/10

The current feature has no entry point, so a new maintainer would search scripts and docs before
seeing value. One root dispatcher with an ordered help screen and a no-network preflight makes
the first run meaningful. The target is one terminal session, at most ten minutes to a locally
visible prompt, with exact expected summary counts and manifest output.

#### Pass 2 — CLI design: 2/10 -> 9/10

Use one thin `scripts/writing-prompt-seed/cli.ts` dispatcher with pure domain modules, not several
unrelated executables. Commands use nouns and explicit verbs: `preflight`, `derive --check|--write`,
`validate`, `review-pack`, `publish --local|--remote`, and `verify`. Bare help/check paths are
production-safe; complexity appears only when the operator selects a write target.

#### Pass 3 — Errors and debugging: 3/10 -> 9/10

Three concrete paths define the error contract. An invalid prompt emits
`E_PROMPT_FIELD`, relative file, JSON pointer, actual constraint, and fix; a derivation mismatch
emits `E_DERIVATION_DRIFT` and the `derive --write` recovery command; a missing local table emits
`E_SCHEMA_MISSING` and the exact migration command. A fourth safety error,
`E_MANIFEST_MISMATCH`, blocks all writes and reports expected/received hashes without printing
prompt bodies, credentials, provider output, or private absolute paths.

Diagnostics are accumulated across the full batch, stable-sorted, and assigned exit classes for
usage/configuration, validation, and operation failures. Debug output may add target, row counts,
hashes, and timings, but never content. A failure at item 17 must leave zero status transitions.

#### Pass 4 — Documentation and learning: 4/10 -> 9/10

`scripts/writing-prompt-seed/README.md` is the canonical copy-paste tutorial and reference;
`docs/tools/writing.md` documents learner-visible behavior and links to the pipeline; and
`docs/workflow.md` owns environment/migration operations. Templates for every prompt kind teach
by doing and are executable validation fixtures. Help output and docs must use the same command
names and expected receipts, verified by a smoke test.

#### Pass 5 — upgrade and migration: 5/10 -> 9/10

Prompt artifacts and article snapshots carry explicit schema versions and reject unsupported
future versions rather than guessing. Changed reviewed content invalidates its manifest and
returns to draft; no command silently rewrites reviewed or published content. Additive migrations,
old-read compatibility, immutable article snapshots, and a documented compatibility-floor commit
provide the upgrade/rollback path; a codemod or semantic-versioned public SDK is not applicable.

#### Pass 6 — developer environment and tooling: 6/10 -> 9/10

The workflow stays within pnpm, TypeScript, Vitest, Wrangler, and the existing Cloudflare local
runtime. Read-only commands require no credentials or network, work non-interactively, and can
run in CI; local publish explicitly shares the Vite dev persistence directory. A fresh/existing
local database matrix and `pnpm dev` visibility check prevent environment-specific false success.

#### Pass 7 — community and ecosystem: 5/10 -> 8/10

This is private solo-maintainer tooling, so a public community, plugin ecosystem, pricing model,
or external support channel would be scope pollution. The relevant ecosystem is the repository:
templates, help, docs, focused commits, owner review, and changelog make the workflow transferable
to another maintainer. The score stops at eight because public discoverability is intentionally
not a product goal.

#### Pass 8 — measurement and feedback loops: 2/10 -> 8/10

No analytics service is added. The committed review artifact records first-local TTHW,
one-prompt edit-to-clean-verify time, validation-cycle count, second-run diff count, and every
undocumented recovery step. The implementation target is <=10 minutes, <=2 minutes, zero second-
run diff, and zero undocumented recovery steps; a post-implementation boomerang review compares
these observations with the plan.

#### NOT in maintainer-DX scope

- Admin UI/CMS, browser prompt editor, generic content framework, or material-seed rewrite.
- Automation that replaces independent reviewer or owner judgment.
- Public SDK, plugin system, semantic-versioned package, community program, or hosted sandbox.
- Cryptographic owner identity infrastructure; the approved manifest hash is the release gate.
- Auto-fixing or silently migrating reviewed prompt content.
- Remote migration/publication, deployment, push, telemetry dashboard, or destructive rollback.
- Any D1-D5 product exclusion: Mapdown, Writing measurement, automatic translation history, or
  a new `next_drills` lifecycle.

#### DX scorecard

| Dimension | Initial | Final |
|-----------|--------:|------:|
| Getting started | 3/10 | 9/10 |
| CLI/API design | 2/10 | 9/10 |
| Error messages | 3/10 | 9/10 |
| Documentation | 4/10 | 9/10 |
| Upgrade path | 5/10 | 9/10 |
| Developer environment | 6/10 | 9/10 |
| Community/repository transfer | 5/10 | 8/10 |
| Measurement | 2/10 | 8/10 |
| **Overall** | **4/10** | **9/10** |
| **TTHW** | **35-50 min** | **<=10 min** |

Principle coverage after fixes: zero friction, learn by doing, fight uncertainty, opinionated
defaults with explicit escape hatches, code in repository context, and a meaningful first local
receipt are all covered. No dimension remains below eight.

#### DX implementation checklist

- [ ] `pnpm writing-prompts --help` is the one discoverable entry point.
- [ ] Read-only first run requires no credentials/network and prints meaningful counts.
- [ ] Feature TTHW is <=10 minutes; one-item rerun is <=2 minutes.
- [ ] CLI naming and help distinguish derive, evidence generation, approval, and publication.
- [ ] Every error contains problem, cause, exact location, fix, and next command.
- [ ] All 48 validation errors can be reported in one stable pass without content leakage.
- [ ] Canonical JSON derives Task 1 SVG/table/long description/alt/hash idempotently.
- [ ] Bare publish never infers local or remote; remote additionally requires approved hash.
- [ ] Local publication uses the same D1 persistence as `pnpm dev` and prints a receipt.
- [ ] Docs contain working copy-paste commands, examples, receipts, and rollback sequence.
- [ ] Snapshot/artifact versions, old reads, and compatibility-floor rollback are tested.
- [ ] Help, validators, manifest stability, local D1, and boomerang metrics are reproducible.

#### DX implementation tasks

- [ ] **DX-T1 (P1, human ~2h / agent ~20m)** — Editorial CLI — implement one root dispatcher,
  safe target parsing, ordered help, pure read-only defaults, and command/exit-code tests.
- [ ] **DX-T2 (P1, human ~2h / agent ~25m)** — Author/review workflow — add versioned templates,
  idempotent derivation, aggregate diagnostics, review-pack evidence, and manifest invalidation.
- [ ] **DX-T3 (P1, human ~2h / agent ~25m)** — Local operations — add named Vite-local migration,
  transactional publish/verify receipts, injected-failure checks, and compatibility-floor runbook.
- [ ] **DX-T4 (P2, human ~1h / agent ~10m)** — Documentation/boomerang — write the canonical
  quick start and record TTHW, rerun time, validation cycles, second-run diff, and recovery gaps.

#### Unresolved DX decisions

None. All findings clarify the authorized implementation or operator safety; none changes
D1-D5 product scope.

**Phase 3.5 complete.** DX overall: 4/10 -> 9/10. TTHW: 35-50 minutes -> <=10 minutes.
Independent subagent: 10 findings. External Codex: unavailable by environment policy.
Six of six dimensions aligned with the primary review; no disagreement or unresolved decision.
Passing to the final execution gate.

### 11.5 Cross-phase synthesis and execution gate

#### Cross-phase themes

| Theme | Independently surfaced in | Execution consequence |
|-------|----------------------------|-----------------------|
| Canonical Task 1 provenance | CEO, design, engineering, DX | Facts are the only editable source; visual/a11y/eval/hash must agree before review |
| Explicit trust boundaries | CEO, engineering, DX | No silent text retention, no content logs/cache, no inferred publication target |
| Immutable completed work | CEO, design, engineering | Article assignment and completed translation result remain stable across later edits |
| Honest recoverable states | Design, engineering, DX | No fake progress; every failure preserves work and exposes one valid recovery action |
| Durable-data rollback floor | CEO, engineering, DX | Deploy/read-delete compatibility before enabling new durable writes; never roll back below it |
| Bounded low-density interfaces | Design, engineering | Indexed summaries, row histories, at most two catalogue columns, no private caching layer |

These repeated findings are high-confidence implementation constraints, not new roadmap scope.

#### Decision audit continuation

| # | Phase | Decision | Classification | Principle | Rationale | Rejected |
|---|-------|----------|----------------|-----------|-----------|----------|
| 9 | Design | Fix Writing order to Continue, catalogue, pieces | Mechanical IA | Clear hierarchy | Answers resume/start/history before showing metadata | Equal card walls |
| 10 | Design | Preview prompt before assigned editor | Mechanical interaction | Trust | GET navigation writes nothing and Task 1 material is inspectable | Click-to-create |
| 11 | Design | Save immutable completed translation snapshot | Mechanical state | Explicit | Editing input cannot silently mutate completed output | Save current mutable form |
| 12 | Design | Keep histories row-based and catalogue <=2 columns | Taste within system | Focus | Prevents card-grid density and preserves hierarchy | Multi-column dashboard |
| 13 | Design | Apply focus/inert/live-region contracts | Accessibility gate | Completeness | Drawer/dialog/stream states must work without pointer or token announcements | Visual-only polish |
| 14 | Engineering | Version full assignment snapshot | Mechanical correctness | Explicit | Retries must not depend on mutable prompt rows | Prompt text only |
| 15 | Engineering | Sign server-complete translation digest | Security gate | Trust | A client flag cannot prove full provider completion | Random client save key |
| 16 | Engineering | Batch first article/revision with start key | Mechanical correctness | DRY | Prevents orphans and duplicate transport retries | Two writes or empty article |
| 17 | Engineering | Generation-scope evaluation updates | Concurrency gate | Completeness | Late old work must not overwrite a retry | Status cast/time-only stale check |
| 18 | Engineering | Split prompt/Saved DB feature modules | Mechanical maintainability | Focus | Avoids extending the 2,459-line DB entry point | Broad DB refactor |
| 19 | Engineering | Establish compatibility-floor rollback | Operational gate | Reversibility | Old main mis-scores Task 1 and hides Saved delete | Schema drop/main rollback |
| 20 | DX | Provide one root editorial dispatcher | Mechanical DX | Learn by doing | Makes the ordered path discoverable without docs archaeology | Several executables |
| 21 | DX | Name evidence command `review-pack` | Mechanical semantics | Explicit | Machines produce evidence; humans review and approve | Automated `review` claim |
| 22 | DX | Make all no-target commands read-only | Safety gate | Trust | Prevents accidental production writes | Existing implicit-remote precedent |
| 23 | DX | Target the Vite-local D1 explicitly | Mechanical environment | Code in context | CLI and `pnpm dev` must observe the same rows | Ambiguous root state |
| 24 | DX | Measure TTHW without analytics | Mechanical feedback | Pragmatic | A review artifact can verify workflow quality without new services | Telemetry dashboard |

#### Pre-gate completeness audit

| Required output | Status |
|-----------------|--------|
| CEO premise challenge, alternatives, error/failure registries, dream delta, exclusions | Complete |
| Design seven dimensions, state matrix, responsive/a11y contract, implementation tasks | Complete |
| Engineering scope challenge, architecture/test diagrams, failure/deployment registries | Complete |
| DX eight dimensions, persona/empathy, nine-stage journey, TTHW/checklist | Complete |
| Dual voices | Independent subagents complete; external Codex unavailable and recorded |
| Cross-phase synthesis and decision audit | Complete |

The owner's message approving D1-D5 is the final product gate. No taste choice, user challenge,
or unresolved decision remains. Execution proceeds in focused commits: shared foundations;
schema/domain/CLI; 48 draft artifacts; Writing runtime/evaluator; Translate Saved; integrated
verification/docs/changelog. The branch stops before push, deploy, remote migration, remote prompt
publication, or owner acceptance.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | CLEAR | 2 completeness proposals, 2 accepted, 0 deferred |
| Codex Review | `/codex review` | Independent second opinion | 1 | ISSUES FOLDED (subagent fallback) | External Codex export unavailable; independent challenges incorporated |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR | 23 issues/test gaps, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | CLEAR | Score 5/10 -> 9/10, 8 decisions |
| DX Review | `/plan-devex-review` | Maintainer experience | 1 | CLEAR | Score 4/10 -> 9/10, TTHW 35-50 min -> <=10 min |

**CODEX:** External CLI review could not run under repository-export policy; all four phases used
independent subagents and recorded the missing cross-model voice explicitly.

**CROSS-MODEL:** No genuine cross-model agreement is claimed. Primary and independent subagent
reviews repeatedly aligned on Task 1 provenance, privacy, recoverable state, local-first tooling,
and the durable-data compatibility floor.

**VERDICT:** CEO + ENG + DESIGN + DX CLEARED — owner-approved plan is ready for implementation.

NO UNRESOLVED DECISIONS
