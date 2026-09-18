# Roadmap

**This file is the single source of truth for what is planned and authorized.** It is not the
delivery record and not an idea list; both were split out on 2026-08-01 (see the end of this
file). Any AI coding tool (Claude Code, Codex, etc.) or human working in this repo should:

1. Read this file before starting product work, to know what the current iteration is.
2. Only add or reprioritize items after the owner (Z.Sun) confirms — never unilaterally.
3. Report finished work as `in_review` with evidence; append the entry to `docs/changelog.md`
   in the same PR. **Only the owner marks work accepted** — an agent does not make that
   transition on its own.
4. An item without acceptance criteria is exploratory, not authorized. Ask rather than assume.

Product direction (agreed 2026-07): bcailab is a studio; **English Studio** is the flagship
product (an AI English coach: read, write, listen, translate). Translate is the free,
no-account acquisition funnel into it. A second product, **Mapdown**, was added 2026-08-01 —
a static, local-first Markdown mind-map editor at `map.bcailab.com`, sharing this repo's
infrastructure and eventually its accounts, but branded and styled independently (see Next).

## Now — Readability and Home action hierarchy (iteration 6) — in_review

Owner-authorized 2026-09-17: F06 and the bounded Home hierarchy follow-up.
Keep the current palette, typography, recommendation logic and product boundaries.

Acceptance:
- Necessary supporting text and placeholders meet 4.5:1 against their rendered light/dark
  backgrounds; required input boundaries and custom focus indicators meet 3:1. Preserve
  light decorative dividers and distinguish disabled controls from actionable ones.
- Continue is the primary Home action when available; recommendation Start is secondary.
  Without Continue, recommendation Start is primary. Recent status stays next to its title
  and wraps with long content on narrow screens.
- Verify Home, Writing and Dictation in light/dark, narrow layouts and keyboard use, with
  stable input labels and visible focus. Compare identical fixture data between themes.
- Exercise cold, Continue-only, recommendation-only, combined, empty/degraded and long-title
  Home states using isolated data. Record actual checks and limitations; update behavior docs.

Review evidence (2026-09-17): `verify:web` passes 227 tests, typechecks, build and 29 isolated
D1/HTTP assertions; lint has 0 errors and 7 existing warnings in this scope. Six contrast-token
regressions include both dark modes; the old colors fail all three supporting-text cases.
Manual browser checks covered the Home state matrix, light/dark input contrast, narrow reflow,
labels, Tab focus and mobile navigation Escape/focus return. See [changelog](changelog.md) and
[fixture instructions](../scripts/testing/README.md). Screen-reader speech, forced-colors rendering
and real audio were not tested. Owner acceptance is pending.

No Reading experiment, recommendation algorithm, font replacement, Mapdown redesign or
release/CI changes. Report `in_review`; acceptance remains the owner's decision.

## Now — Documentation authority and drift repair (iteration 5) — in_review

Owner-authorized 2026-09-17. Establish a concise docs entry point; repair the reviewed Writing
rail, Home, layout-width and testing-scope conflicts against code. Preserve settled product
boundaries and distinguish historical review evidence from current guidance.

Acceptance:
- The entry point answers what is authorized, how actual behavior is established, how to verify,
  and how to publish; conflicts between intent, implementation and dated evidence have a rule.
- Architecture describes component relationships rather than duplicating the complete route list.
- Already accepted roadmap details move to a dated historical record without losing text,
  evidence or old anchors. Keep summaries, still-open caveats and all unaccepted work reachable;
  do not infer new acceptance or reorder active work.
- Context packs fail on missing selected inputs and explicitly requested files, classify history
  separately from intent/derived facts, and never leave an apparently successful partial pack.
  Generated output stays untracked; existing secret-handling boundaries remain.
- Extend bounded docs checks to the repaired/entry documents and explicit document-role markers.
  Exercise context profiles and failure cases using synthetic copies, including a missing input.

Review evidence (2026-09-17): the documentation entry point and factual repairs are complete.
Accepted history preserves 93 original paragraphs and 22 old heading anchors; unaccepted work
remains active. Combined verification passes (744 tests, 25 D1/HTTP assertions), plus 31 context
checks and two expected documentation failures. All four real-checkout pack profiles generate.
See [delivery record](changelog.md) and [documentation entry point](README.md). Owner acceptance is pending.

No product behavior, visual refresh, CI/deployment changes, Reading experiment or wholesale docs
folder reorganization. Report delivery as `in_review`; only the owner accepts it.

## Now — Local verification entry points (iteration 4) — in_review

Owner-authorized 2026-09-17. Add `verify:web`, `verify:mapdown`, and `verify` with explicit
scope for tests, typechecks, lint, builds and operational documentation checks. Preserve the
per-package TypeScript choices. Root verification must include Mapdown client and Functions.
Reuse the isolated Writing/Home D1 fixture as an automatic check and document how to repeat
browser checks; do not silently report manual browser checks as automated passes.

Acceptance:
- All three commands run locally, identify their scope and failing step, and exit nonzero on
  failure. Required tools/input files cannot be silently skipped. Check Node compatibility and
  the repository's declared pnpm version before starting.
- Web covers its shared packages, existing seed/grader/worker checks, React regressions, build
  and isolated D1/HTTP checks. Mapdown covers client and Functions tests/types, lint and build.
  Combined verification covers both without relying on the legacy Web-only root build.
- Deliberate unit, type and lint failures block the appropriate product command; a Functions
  type error blocks combined verification. A broken operational-doc link also blocks verification.
  Keep a reproducible failure-injection command that restores its temporary changes.
- Document command boundaries, prerequisite tools, D1/browser invocation and limitations.
  Limit doc checking to verification/workflow instructions and required inputs; semantic doc
  drift and historical-doc reorganization belong to a later iteration.

Review evidence (2026-09-17): all three verify commands pass; 744 tests, 25 D1/HTTP assertions,
and eight injected failures confirm scope and fail-fast behavior. See [verification instructions](verification.md)
and [changelog](changelog.md). Browser interaction checks remain manual; owner acceptance is pending.

No CI, remote settings, deployment mechanism, production migration, product behavior or Reading
experiment changes are authorized in this iteration. Delivery is `in_review`, with evidence in
changelog; acceptance remains the owner's decision.

## Now — Writing reliability and Home data correctness

Owner-authorized 2026-09-16: iterations 1–3 of the review follow-up plan. Implement in this
order, one independently reviewable change per iteration. The review's findings F01–F05 are
inputs, not authorization for the remaining review batches.

### 1. Writing retry lifecycle (F01) — in_review

Consume each retry response once, by article/revision/feedback generation; keep feedback task
start time separate from revision creation time. Acceptance: a React regression fails on the old
loop and passes after the fix; retry → pending → completed terminates; old responses cannot reset
completed feedback or overwrite another article/round; browser polling continues then stops with
no update-depth warning. Additive response fields preserve existing API consumers.

### 2. Writing draft recovery and account isolation (F02/F03) — in_review

One account-scoped local draft contract for freeform, assignments and new rounds, carrying text,
topic/coach, base revision, update time and first-submit identity. Existing unscoped keys are not
automatically assigned to whoever is signed in. Anonymous trials remain non-persistent. Acceptance:
refresh/return and failed requests preserve input; server revalidation does not overwrite dirty
edits; account B cannot see account A's draft; a lost successful first-submit response followed by
refresh/retry creates one article and Round 1; success only clears the corresponding submitted
version; unavailable storage is visible. Verify through an isolated browser and real local D1.

### 3. Home bounded inputs and degradation (F04/F05) — in_review

Separate level/adjacent candidates from record-referenced passages needed for Continue/Recent.
Keep queries and returned rows bounded; absence from a candidate window is not withdrawal.
Acceptance: >60 and uneven-band fixtures retain B2 recommendations and old eligible unfinished
work; withdrawn passages stay excluded; profile/history/library failures each have an intentional
fallback, with unknown level never displayed as B1; authentication failures retain their existing
behavior. Verify SQL against local D1 and error paths against the dev server.

### Delivery and exclusions

Review evidence (2026-09-17): see the four reliability entries in [changelog](changelog.md)
and [the reproducible local fixture](../scripts/testing/README.md). Owner acceptance is pending.

Each iteration includes its behavioral docs, defect-specific regression tests and changelog
entry marked `in_review`. Minimal React/D1/browser test support belongs with these fixes; the
broader verify/CI/docs reorganization is not authorized here. No Reading enablement, Stage 2
category work, quota redesign, visual refresh, Mapdown changes, push or deployment is included.

## Now — English Studio material, memory, and interaction iteration

The owner authorized this iteration and decisions D1-D5 on 2026-08-09. Implementation
continued past the original branch: `codex/english-studio-major-iteration` is now fully
contained in **`codex/ui-navigation-polish`**, which carries the UI/IA work that followed and
is the branch to review. The detailed design and failure registry live in
[the iteration plan](english-studio-major-iteration-proposal.md); what has shipped and its
acceptance state is in [the changelog](changelog.md). Only the owner moves an item to
accepted.

### Product boundary and invariants

- This branch covers English Studio only. Mapdown Create with AI remains authorized in Next,
  but is a separate branch and release.
- Prompt levels are discovery metadata, not measured ability. Never render a null level as B1
  and never lock material by band.
- Translation text is persisted only after an explicit signed-in **Save** action. There is no
  automatic history or anonymous persistence.
- Writing-to-profile measurement remains deferred. Prompt metadata must allow a future writing
  vocabulary without claiming that the vocabulary exists now.
- New Reading evaluations stop requesting `next_drills`; stored historical feedback that has
  the field must remain readable.

### Remaining quality note

The accepted Writing prompt-bank record still notes that a second-party content review has
not happened; publication used the owner as both reviewer and approver. This caveat remains
open. A new review/publication task would need its own scope and fresh manifest. Accepted A–E
scope and evidence are preserved in [the historical record](roadmap-accepted-history.md).

### Explicitly excluded from this iteration

Mapdown Create with AI; writing-to-profile measurement; Dictation v2/session matching;
long-document translation; first-token/provider/AI-Gateway work; model-routing hot config;
LLM-signal weight promotion; Chinese UI; paid tier; profile settings; and further
Reading/Dictation library expansion.

## Continuing learner-surface constraints

The IA v2 / Coach Home iteration shipped 2026-07-28 (all three phases; see
`docs/changelog.md`).

Two invariants established by that iteration outlive it and apply to anything touching the
learner surfaces — recorded as [ADR 0006](decisions/0006-learner-surface-invariants.md), with
the full reasoning in `docs/english-studio-ia-v2-design.md`:

- **Never render a `null` level as "B1".** A policy may use B1 internally; the UI must not
  claim a level the system has not established.
- **Never lock material by band.** CEFR confidence is the product of practice volume and band
  *spread*, so a recommender that never explores starves the estimator that decides the
  learner's level. Fold other bands; do not gate them.

The **matching** service (Dictation v2) remains in Later at the `selectStarterPractice()` seam.
The older suggestion of a shared session/planning entity is not active scope: [ADR 0007](decisions/0007-no-cross-tool-practice-session-entity.md)
rejects a cross-tool practice-session entity. Each tool retains its native model.

## Now — Mapdown canvas-first chrome

Authorized by the owner on 2026-08-26. The editor currently reads as a web page with a toolbar
above a canvas band: `.editor-shell` is a four-row grid and the map occupies the third row. The
owner's complaint is that this feels fragmented next to Figma and Excalidraw, where the canvas is
the page and the controls float on it.

- Make the map fill the viewport and float the chrome over it: the toolbar, the status line, the
  authoring hint and the existing zoom capsule become overlays that reserve no layout space.
- Teach `fitMap` about those overlays. With chrome floating, fitting to the full viewport puts
  the topmost nodes underneath the toolbar; the fit must target the unobscured area and centre
  the map there. Default behaviour with no insets stays exactly as it is today, so the published
  viewer is unaffected.
- Keep the interaction contract intact. This is presentation only: no change to pan, zoom,
  selection, editing, or the layout engine.

Acceptance:

- (a) The map occupies the full viewport, and no floating control reserves layout space.
- (b) **Fit** leaves every node visible — nothing lands under the toolbar or the status line, at
  desktop, tablet and mobile widths.
- (c) The canvas remains a **single tab stop** (`spec/accessibility.md` §16), and the floating
  controls are reachable by keyboard in a predictable order.
- (d) Coarse-pointer targets stay at 44 px; `prefers-reduced-motion` is respected; light and dark
  both hold up.
- (e) Help and the document library still open above the chrome, and the existing
  `data-overlay-background` inert mechanism still makes everything behind them unreachable.
- (f) No regression to the 500/2000-node benchmark, since floating chrome must not change what
  the canvas re-renders.

**Not in this iteration**, and recorded in `docs/exploration.md` instead: expand/collapse motion,
and the "smoother canvas" question the owner raised alongside it. The owner explicitly declined
to commit to either.


## Now — Mapdown: the root label is the map's name everywhere

Authorized by the owner on 2026-08-26 after the document library shipped and every row read
`Untitled`. This is not a new design decision — it finishes one already made. **D-18** settled
the same question for download filenames on 2026-08-04, *after the same symptom*: "the internal
document title is initialized or imported but has no editing surface, so it can remain
`Untitled` while the visible map has a meaningful name. The root label is the identity users see
and control." Downloads were changed then; the library and the published page were not, because
neither existed yet.

`spec/storage-export.md` §10.3 is the constraint that shapes the fix: *"The root node text is not
automatically forced to equal the filename/title."* So the two values must **not** be merged.
`title` keeps its real job — the imported filename or front-matter title, i.e. provenance — and
stops being what a person is shown.

- Show the root label wherever a map is named to a person: the library rows, the library detail
  panel, the rename field, the destructive-action confirmations, and the published page's `<h1>`,
  `<title>` and `og:title`. Fall back to `title`, then to a neutral placeholder when the root is
  empty.
- Search and sort operate on the displayed name, not on the hidden one.
- Carry `rootLabel` on the document index entry, written wherever `nodeCount` already is, so the
  library renders a row without loading its snapshot.
- **Rename edits the root node**, not `title`. It is otherwise a button with no visible effect —
  the same defect in the opposite direction.

**The asymmetry is accepted, not hidden** (owner's decision, 2026-08-26). Renaming the map open
in the editor goes through history and is undoable, because `spec/vision.md` §4.8 requires every
structural action to be undoable. Renaming a map that is not open edits its stored snapshot
directly, where no history exists; it is covered by the library's existing in-tab undo instead.

Acceptance:

- (a) A map created, imported, or copied from a published link shows its root label in the
  library and on its published page — never `Untitled` while the root says something else. This
  includes a row that exists **only** in an account: the save endpoints derive the stored name
  with the same rule the client uses, so the account list does not become the one surface left
  behind. A row last written by an older client keeps its provenance title until it is saved
  again; no migration backfills it.
- (b) An empty root falls back predictably, and the fallback is the same string in the library
  and on the published page.
- (c) Rename changes what the canvas shows. On the open map it is undoable through history; on
  any other map it is covered by the library's in-tab undo.
- (d) Search and sort match what the row displays.
- (e) `title` is unchanged as a stored field: import still populates it from the filename or
  front matter, and Markdown import/export semantics do not move (§10.3).
- (f) Download filenames still follow D-18, unchanged.

**Not in this iteration.** Existing publications are frozen, so a published map keeps its old
public title until its owner runs *Update published version* — that is D-29's freeze semantics
working, not a bug to route around. No data migration: existing index entries gain `rootLabel`
the next time they are written. Whether the library should become Mapdown's landing surface is a
separate question the owner deferred until names are real.


## Now — Material library expansion

The owner authorized this on 2026-08-27, together with
[ADR 0009](decisions/0009-ielts-is-a-material-family-not-a-second-product.md), which settles
that IELTS is a family of material rather than a second product. This is a **content-and-review
push, not engineering**: the pipelines already exist and are unchanged by this item
(`scripts/material-seed/` for passages, `scripts/writing-prompt-seed/` for prompts).

**Counts confirmed by the owner 2026-08-27.** Drafts for both halves are generated and
validated; nothing is published.

**Correction to this item's own framing (2026-08-27).** "Content-and-review push, not
engineering" held for the passages and was wrong for the writing prompts. The first batch's
census — exactly 48 prompts, 12 per IELTS task, 2 per Task 1 kind, 3 per Task 2 kind — was
frozen as literals in three places: `scripts/writing-prompt-seed/policy.ts`, a second copy in
`packages/db/src/writing-prompt-content.test.ts`, and the `validate` command's summary line.
Any second batch was therefore a code change by construction. The census now lives in one
`WRITING_PROMPT_BATCH_CENSUS` constant with its totals derived from it, the duplicate assertion
is gone, and the summary counts instead of stating. No schema, taxonomy, evaluator or navigation
change was needed, so the item's boundary held even though its cost estimate did not.

### Scope

- **Graded passages: 40 → 80** (from ten per band to twenty, across A2/B1/B2/C1). One passage
  continues to serve both dictation and reading-aloud. Every newly published passage gets its
  per-sentence audio *and* its whole-passage reference recording in the same pass, so TTS is
  paid once.
- **IELTS writing prompts: 24 → 48** (from twelve to twenty-four each for Academic Task 1 and
  Task 2). Task 1 additions need reviewed chart/table/process/map assets on the same terms as
  the first batch.
- **General writing prompts: unchanged at 24.** Writing thinness is not the current complaint;
  passage thinness is.

### Explicitly out of scope

- **IELTS Listening and IELTS Reading material.** ADR 0009 keeps them out: they need
  question-type schemas and timed-section semantics that do not exist, which is product work
  with its own authorization, not a content push.
- **Reading's topic/state filters.** The stated trigger was "a band passes roughly thirty";
  twenty per band still browses fine, so this stays deferred rather than being folded in.
- **Backfilling reference audio** for the twenty passages published before reference recordings
  existed. Optional, costs a fresh TTS pass, and is not blocking anything.
- Any schema, taxonomy, evaluator, or navigation change.

### Acceptance criteria

- Every new passage passes `intake.ts` with zero errors — sentence count, per-sentence length,
  title shape, duplicate titles, and the digits rule — before any review time is spent on it.
- Generation follows the recorded review policy: a capable model generates, a second independent
  LLM pass checks each item against the constraints and flags doubt, and the owner reviews the
  flagged set plus an agreed sample. Register stays distinct per band (one sub-agent per band).
- New writing prompts pass deterministic validation and are published with a batch manifest and
  hash, exactly as batch `38d84de9` was. **Publication requires owner approval of the manifest**;
  an agent never publishes a batch on its own.
- Publication is idempotent and additive: republishing changes nothing, and no existing passage,
  prompt, learner attempt, or stored assignment snapshot is rewritten.
- `tag.ts` is re-run across the whole library afterwards, since it replaces tags wholesale and
  is the intended path rather than a migration.
- Local D1 checks confirm the new counts per band and per task family, and that Reading,
  Dictation and Writing catalogues page correctly at the larger size with no unbounded query.

### Progress — drafts complete, in_review (2026-08-27)

- **Passages 40 → 80.** The existing forty were one passage per topic per band across ten
  topics; the new forty add ten topics on the same grid (education, technology, money,
  neighbourhood, sport, music, pets, housing, friendship, celebrations), so the library stays
  one passage per topic per band. All eighty pass `intake.ts`: 8–12 sentences, no sentence over
  110 characters, no digits, valid titles, and no duplicate title anywhere in the library.
- **IELTS prompts 24 → 48**, source 48 → 72. Task 1 goes 2 → 4 per material kind across all six
  kinds; Task 2 goes 3 → 6 per family across all four. `validate`, `derive --check`,
  `review-pack` and `preflight` all pass; 72 prompts and 24 Task 1 SVG assets are derived and
  committed. General prompts untouched at 24.
- **693 tests, both typechecks, lint (0 errors) and both production builds pass.**
- **Not done, and blocking publication.** (a) The independent second-model content check the
  material pipeline's review policy requires has **not** been run — the same model generated
  this batch, so its self-review is not the independent pass. (b) No owner review yet. (c) The
  batch hash moved from `38d84de9` to `034b84f4`, so the committed approval file no longer
  matches and `publish` stays blocked until a new approval records both reviews. (d) No TTS has
  been spent and no D1 row, local or remote, has been written.

### The honest caveat, recorded deliberately

Expansion here is **supply-side work against unmeasured demand**. The library is thin, but no
learner has yet exhausted a band, because there are effectively no learners. Twenty per band is
chosen to remove the most visible thinness, not because a measurement asked for it — the
demand-driven alternative (expand what the practice engine asks for and cannot find) needs a
practice engine that does not exist yet. If usage later shows learners concentrating in one
band or one family, that evidence should redirect the *next* batch rather than this one.


## Now — Learner context for graders

The owner authorized Stage 1 of [the learner context proposal](learner-context-proposal.md) on
2026-09-15 and confirmed its five decisions as recommended. The problem, verified in code: every
grader remembers one object rather than the learner — Reading one passage, Writing one session,
Dictation feedback one attempt. Writing's feedback never reaches the shared learner layer, and the
only cross-mode input any grader receives is at most eight profile phrases on the Reading
evaluator.

### Decisions (owner, 2026-09-15)

- **D1 — Context is separate from measurement.** A grader may be given profile aggregates labelled
  with their provenance, and earlier coach feedback labelled as earlier AI judgement; nothing in
  context is written back as a measurement. Recorded as
  [ADR 0010](decisions/0010-grader-context-is-separate-from-measurement.md).
- **D2 — Saved translations are excluded** from grader context.
- **D3 — Rollout order is Dictation → Writing → Reading.** Reading receives context only after the
  bias evaluation in (d) passes. The evaluation also runs against today's `persistent_issues`
  injection, whatever Stage 1's outcome.
- **D4 — Stage 2 follows Stage 1** as context-only structured categories (see Next).
- **D5 — The design text describes the code.** `docs/learner-model-design.md` §1 and §7 were
  corrected in the authorizing change. Folding Reading's `cefr_guess` into the CEFR estimate is a
  measurement change that needs its own evidence, and is not part of this item.

### Scope

- A pure learner brief and per-grader projection beside `learner-model.ts`, and a server assembler
  reading at most four bounded sources: the profile row; the latest feedback round of up to six
  other non-deleted Writing sessions; up to six other completed Dictation attempts with feedback;
  and up to six Reading evaluations on other passages. Bounds, grouping, truncation and the
  projection table follow proposal §4.2–§4.3. Assembly is deterministic over the history available
  at call time; it is not a reproducible record of what a past evaluation saw (proposal §4.1).
- Every tag-accuracy line states its provenance. Tags only Dictation writes are deterministic
  measurement; Reading's six tags blend down-weighted LLM observations into `tag_mastery_json`, so
  they are labelled as possibly including earlier AI judgement.
- One prompt section with one renderer, placed after each grader's rubric and before the work
  being judged, carrying the usage rules in proposal §4.4. When Reading is enabled, its brief
  replaces the current `persistent_issues`/`strengths` injection.
- The Dictation prompt gives the learner's level — or "not established" — separately from the
  passage band.
- For Reading's gate: a `--brief <file>` option on `scripts/grader-variance.ts` for the preliminary
  screen, and a harness that runs the bias evaluation in (d) over its recording set.

### Acceptance criteria

- (a) **Pure logic, vitest-covered.** Output stays under the character ceiling however much history
  exists; a null level renders "not established" and never B1; no empty section appears when
  evidence is absent; ordering and truncation are deterministic; each projection contains only
  what proposal §4.3 assigns to its grader; every tag line carries its provenance, and no tag in
  Reading's six-tag set is ever labelled as measured.
- (b) **Data scope, verified against local D1 on the dev server.** A brief never contains another
  user's data, rounds of a deleted Writing session, soft-deleted Dictation attempts, or evaluations
  of deleted Reading attempts, and the assembler never reads `saved_translations`.
- (c) **Prompts.** Dictation feedback, Writing feedback and Reading evaluation include their
  projection for signed-in learners, enabled in that order. Trial prompts are unchanged, proven by
  prompt fixtures. The Dictation prompt no longer presents the passage band as the learner's level.
- (d) **Bias evaluation before Reading is enabled.** A standard deviation is not evidence here: it
  measures stability, and a context that shifts every result the same way passes it. Recorded in
  `docs/spikes/`:
  - *Preliminary screen.* The single-recording `--brief` spike — five runs each with no brief, a
    false brief and a true brief. It can stop Reading early; it cannot enable it.
  - *Recording set, fixed before any run.* At least six recordings from at least two speakers,
    testing at least `th_sound` (word-level attribution) and `linking` (prosodic attribution). Each
    tested weakness is present in at least two recordings and absent in at least two, and at least
    two recordings also carry known errors outside their tested tag. Ground truth is never the
    grader's own judgement: it comes by construction where possible — a passage's reference TTS
    recording for "absent", scripted errors on pre-listed words for "present" — and otherwise from
    a human annotation committed before the first run.
  - *Runs.* Five per recording with no brief, and five with a brief asserting that recording's
    tested weakness.
  - *Pass, all of:* the brief shifts the pooled mean overall score by at most 2 points, and no
    single recording's mean by more than 4; where the tested weakness is absent, its attributed
    accuracy — hits ÷ exposure, exactly as `attributeReadingErrors` computes it — falls by at most
    0.05 pooled; and the share of known errors outside the tested tag that get highlighted falls by
    at most 0.10 pooled, since Reading keeps at most eight highlights and a primed weakness can
    crowd real errors out.
  - The same evaluation runs against today's `persistent_issues` injection and is recorded
    regardless. These thresholds are fixed here, before any run; changing them is the owner's call.
    A failing result is reported to the owner rather than worked around, and choosing between the
    fallbacks in proposal §5 is also the owner's call.
- (e) **Cost and latency.** At most four additional bounded D1 reads per evaluation, performed
  inside each grader's existing evaluation task, so no page request gains a query unless it
  already waits on the model call (Reading's inline path when `waitUntil` is unavailable). Assembly
  failure degrades to no brief and never fails an evaluation.
- (f) **Unchanged contracts.** No migration, and no change to stored feedback schemas,
  `learner_tag_observations`, `SOURCE_WEIGHT`, the naming pass, or CEFR resolution.
- (g) **Privacy.** No brief content in logs — counts and ids only.
- (h) **Verification.** `pnpm test`, typechecks, lint (0 errors) and both production builds pass.
- (i) **Docs in the same PR.** The grader-context sections of `docs/tools/esl.md`,
  `docs/tools/writing.md` and `docs/tools/dictation.md`; the learner-model paragraph of
  `docs/architecture.md`; and a `docs/changelog.md` entry marked `in_review`.

### Explicitly excluded

Stage 2 categories (Next); Writing observations or a Writing measurement vocabulary (Next); any
change to aggregation, `SOURCE_WEIGHT`, the naming pass or CEFR resolution, including folding in
Reading's `cefr_guess` (D5); the recommender and Dictation v2 matching; a Today queue, an enrolment
unit, or an offline job runner; any new learner-facing surface; trials; and saved translations
(D2).

### Progress

- **Dictation feedback step — in_review (2026-09-15).** Dictation feedback, first in the rollout
  order, now receives the learner brief. Evidence: the pure
  `learner-context.ts` is covered by 17 tests (a null level never rendered as B1, provenance on
  every tag line, exposure and mastery thresholds, exclusion of the current, unfinished and deleted
  attempts, dimension normalisation, the grammar-only projection, quote flattening, the
  1,800-character ceiling, determinism); three prompt fixtures prove the band is stated as the
  passage's and the brief sits before the errors; one fixture pins the new Writing query. For (b),
  the real assembler ran against a fresh, fully migrated local D1 through wrangler's platform proxy
  — workerd's D1, not a mock — over seeded rows that must stay out: another user's sessions and
  attempts, a deleted session's retained rounds, soft-deleted and unfinished attempts, a newer
  failed round, a pending session and a saved translation. All 17 checks passed, with three reads
  and none touching `saved_translations`; the Writing query plan uses `idx_writing_articles_user`
  and the per-article round index. The dev server renders a dictation passage page on the changed
  route with no console errors. 714 tests, all typechecks, lint (0 errors) and the production build
  pass. **Follow-up verification (2026-09-15):** the signed-in Dictation action was exercised over
  HTTP on an isolated dev server, using a synthetic session and migrated in-memory D1. A real model
  call produced feedback with the brief, and stored accuracy matched the deterministic action
  result. See `docs/spikes/learner-context-writing-verification.md`. Owner acceptance remains open.
- **Writing feedback step — in_review (2026-09-15).** First drafts, revisions and retries now
  receive the Writing projection, with two bounded reads inside the evaluation task. The current
  session is excluded before the six-session limit; the existing within-session delta is retained.
  Listening weaknesses are explicitly labelled; trial prompts match pre-change SHA-256 fixtures.
  Evidence: 720 tests, all typechecks, lint (0 errors; 9 existing warnings), and both production
  builds pass. Isolated dev-server checks verify user/deletion/current-session scope, the read
  budget and successful real-model first-draft, revision and retry feedback. Details in the same
  spike. Reading remains disabled for the new brief pending its bias gate.
- **Reading gate tooling — in_review (2026-09-16); experiment pending.** The variance script
  accepts `--brief` and now uses the production prompt/highlights. The registered-corpus harness
  compares baseline, candidate brief and legacy profile over five calls per condition and recording,
  using production attribution and the fixed thresholds in (d). It refuses uncommitted manifests,
  changed experiment code/audio hashes, incomplete runs and malformed evaluation output. It writes
  both comparisons and preserves incomplete runs without a pass. Evidence: 734 tests, all
  typechecks (including grader tools), lint (0 errors), and Web build pass; Mapdown build passed
  in the preceding Writing step and its code is unchanged. CLI dry-run and preregistration rejection
  were checked with synthetic tone fixtures, without model calls. Protocol:
  `docs/spikes/reading-context-bias-protocol.md`. **Still needed:** the pre-annotated recording
  corpus and the actual preliminary/full experiments. Reading's new projection/assembler and
  prompt integration remain unimplemented until the gate is evaluated; existing profile injection
  is unchanged. No bias result or Stage 1 completion is claimed.


## Next
- **Mapdown — create with an external AI (authorized 2026-08-08, not started).** Validate the
  product direction “AI-generated structure → Mapdown visualization” without putting a model
  inside Mapdown. Add a **Create with AI** flow for people learning a new subject or researching
  a topic: the user enters the topic, copies a model-agnostic prompt that defines Mapdown's
  supported Markdown outline format, sends it to an AI of their choice, then pastes the returned
  Markdown directly into Mapdown and creates a local editable map. Acceptance: (a) the prompt
  requires exactly one level-1 root heading, unordered-list descendants and indentation-based
  hierarchy, and asks for Markdown only — no explanation or code fence; (b) the pasted text is
  validated by the same parser as file import, with actionable errors and no mutation of the
  current map on failure; (c) a valid result opens immediately as a new locally saved map while
  the previous map remains recoverable; (d) the flow works with at least two external AI
  products and requires no account, API key or network request from Mapdown; and (e) the flow is
  keyboard- and screen-reader-operable at desktop and mobile widths. Explicitly excluded:
  built-in model calls, prompt-provider integrations, Agent/MCP/HTTP APIs, publish/share URLs,
  and server-side rendering. Those remain separate directions requiring their own evidence and
  authorization.
- **Dictation contributes practice duration** (owner-authorized 2026-08-12, not started).
  `total_practice_seconds` counts reading only: `learner-model.server.ts` passes
  `practiceSeconds: 0` for dictation because nothing times a dictation attempt. A learner who
  practises both modes therefore has a duration covering half their work. The surfaces were
  made honest rather than left overclaiming — Home dropped duration entirely, Progress renamed
  its card to *Reading time* and hides it at zero — so this item is about restoring the
  measurement, not about the copy. Acceptance: (a) a dictation attempt records elapsed practice
  time and adds it to `total_practice_seconds`; (b) resuming an in-progress attempt does not
  double-count time already recorded; (c) idle time with no interaction is excluded, by a
  documented rule; (d) Progress presents one duration covering every mode that measures one,
  renamed back from *Reading time*; and (e) existing rows are unaffected — historical dictation
  attempts stay at zero rather than being back-estimated. Explicitly excluded: timing Writing,
  whose unit of work is a submitted round rather than a timed sitting.

- **Free entry points made explicit** (owner-raised 2026-07-23): header + hero chip showing what
  is usable without an account. Its *data* half already lands in IA Phase 1 — the registry's
  `access: public | trial | auth` field is what makes free entry consistent — so this item is the
  presentation half, and it follows the colour work.
- **Learner context Stage 2 — structured feedback categories** (owner-authorized 2026-09-15;
  starts only after "Now — Learner context for graders" is accepted). Writing annotations and
  Dictation error patterns gain an optional `category` from one closed list, so the learner brief
  groups recurring issues by category rather than by the model's free-text names, and Dictation
  notes become filterable for Reading. Context only, under
  [ADR 0010](decisions/0010-grader-context-is-separate-from-measurement.md): categories never enter
  `learner_tag_observations`, and choosing a Writing measurement vocabulary stays the item below.
  Acceptance: (a) one module defines the closed list, with a one-line definition per category, and
  both graders' prompts and output normalisers reference it instead of restating it; (b) stored
  feedback without the field still loads and renders, proven by parser fixtures over old Writing
  and Dictation payloads, as the `next_drills` compatibility work did; (c) a missing or unknown
  category normalises to absent and never fails an evaluation; (d) the brief groups on `category`
  when present and falls back to Stage 1 grouping otherwise, with unit tests over mixed old and new
  history; (e) Reading's projection gains category-filtered Dictation notes only after Stage 1's
  anchoring spike is re-run with them and passes; and (f) no migration, no measurement change, and
  no learner-facing surface change. Explicitly excluded: backfilling categories into stored
  feedback, Writing observation rows, and showing categories to learners.
- Fold **writing** into the ability profile. Writing reaches the shared learner surfaces only as
  Home's Continue/Recent entries: it writes nothing to the profile — no observations, counters, or
  CEFR signal — because it has no tag vocabulary; a prompt is not a passage. The mechanism is
  settled (IA v2 design §6.3): a new vocabulary plus a writer emitting into the same
  `learner_tag_observations` table, surfaced on `/english/progress` rather than crowding the Home
  snapshot. Blocked on that vocabulary, not on schema. Stage 3 of
  `docs/learner-context-proposal.md` records three problems the vocabulary decision must solve —
  exposure without a reference text, grader recall inflating mastery, and keeping production apart
  from perception in aggregation — and the Stage 2 categories above are its intended input.
  Writing's feedback reaching other graders does **not** wait on this item (ADR 0010).

## Later

- Long-document translation: chunked parallel translation; raise signed-in limit to ~100k
  chars. (Streaming output — the other half of this item — shipped 2026-07-30; see `docs/changelog.md`.)
- Faster first-token: evaluate Groq (or similar) for the translate task via the
  `llm.server.ts` routing table; adopt Cloudflare AI Gateway for cost/usage observability.
- **Model routing hot-config** (owner-raised 2026-07-21). As the task→model table grows
  (already three tiers after routing evaluation tasks to 3.6 Flash; multi-provider later),
  changing routing shouldn't need a deploy. The cheap intermediate — **not** an admin system —
  is to move `TASK_MODELS` from a code constant into D1/KV read at runtime, with the code
  default as fallback, so routing changes by SQL/`wrangler` alone. Pair with AI Gateway (above)
  for the per-task cost/latency data that tells you *which* task to re-route. An admin UI over
  that table comes only if a non-engineer ever needs to change it. Trigger: a 2nd provider, or
  the first time a routing change is wanted between deploys.
- **Reading grader — deterministic split.** Parked: the 2026-07-23 variance spikes showed the
  single-call evaluator repeatable enough that the ASR-diff rebuild is not justified.
  **Trigger to revisit:** a further spike run on more jargon-dense or unfamiliar-register
  material reproduces variance that actually crosses the 4-point threshold. Evidence and
  reasoning: [ADR 0005](decisions/0005-reading-grader-stays-single-call.md).
- Chinese UI (at least Translate + landing pages) — deferred 2026-07-15,
  [ADR 0003](decisions/0003-defer-chinese-ui.md).
- Paid tier (quota/model config already has an `anonymous/free/paid` shape).
- Posts product landing page (currently links straight into the tool).
- **Dictation v2 — level-adaptive material matching.** Retrieve from the tagged library rather
  than generate per request. The work is (a) a dimensional tag schema shared by library and
  learner profile, (b) a matching policy, (c) growing the library (now its own item above).
  It replaces `selectStarterPractice()` and inherits its callers, so the Home needs no IA
  change; the session / goal-first layer is the next tenant on that same seam, deliberately not
  built now. Prerequisites are delivered (shared learner model 2026-07-21, dictation v1).
  Reading and Writing migrate to the same interface gradually — an interface migration, not a
  rewrite. Full reasoning:
  [ADR 0004](decisions/0004-dictation-v2-retrieves-rather-than-generates.md).
- Dictation: bring-your-own-text — user pastes a passage and practices dictation on it.
  Noted 2026-07-20 as the one place runtime generation/synthesis genuinely earns its
  keep; it is user-initiated, distinct from adaptive difficulty, and should not be
  conflated with v2 matching.
- Decided 2026-07-16: Translate stays inside English Studio as its free funnel (not a
  standalone homepage product); revisit only if usage data shows a distinct audience.
- Engineering quality (remaining): vitest for LLM-output parsers; audio Range request
  support. ESLint, the evaluation-history N+1 query, session cleanup cron, and session
  secret rotation were promoted to "Now — Engineering quality iteration" (authorized
  2026-08-15) with acceptance criteria.
- ~~Profile settings (avatar + nickname) for email-OTP users~~ — promoted to
  "Now — Account passwords and profile" (authorized 2026-08-18), which delivers profile
  editing plus optional passwords.
- ~~**Library expansion — keep going.**~~ — promoted to "Now — Material library expansion"
  (authorized 2026-08-27), which carries the scope and acceptance criteria. The reasoning below
  is kept because it is the reasoning that item inherits. First batch shipped 2026-07-28
  (20 → 40 passages, ten per band). The IA v2 design assumes material eventually grows ~100× (roughly 500 per band),
  because at five per band a motivated learner exhausted their level in two sittings and the
  Coach Home made that thinness visible. Ten per band buys room, not resolution. Expansion is
  mostly a content-and-review push rather than engineering: generate per band (parallel
  sub-agents keep the register distinct), `intake.ts` to validate, owner review, `publish.ts`,
  `tag.ts`. **Reference audio is now produced for every newly published passage** — the material
  layer's §9.1 gap, closed in the same pass so TTS is paid once. The twenty passages published
  *before* that change still lack a reference recording; backfilling them is optional and costs
  a fresh TTS pass for those rows only. Reading's topic/state filters are still **not** needed:
  the Phase 3 trigger was "the first expansion", but ten cards per band browse fine — revisit
  when a band passes roughly thirty.
- **Promote LLM judgment to a formal measurement signal** (owner direction 2026-07-27). The
  grader variance spikes (`docs/changelog.md`, 2026-07-23) showed LLM scoring repeatable enough to be more than
  a down-weighted hint. The architecture already anticipates this: `learner_tag_observations.source`
  distinguishes `deterministic` from `llm`, and the weighting lives in one constant
  (`SOURCE_WEIGHT` in `learner-model.ts`), so promotion is **a weight change with a documented
  evidence trail, not a migration** (IA v2 design §6.2). Do it on evidence — more variance runs
  across registers and speakers — not on vibes. New signal sources (a speaking evaluator, say)
  join the same way: one enum value, one weight.

## Accepted work — summaries and preserved anchors

These entries are historical, not the active queue. Their original scope, evidence, caveats
and recorded acceptance are preserved verbatim in [accepted roadmap history](roadmap-accepted-history.md).
No item was newly accepted by this documentation move.

<a id="now--engineering-quality-iteration"></a>
<a id="1-remove-dead-eslpassage-code--accepted-2026-08-15"></a>
<a id="2-configure-eslint-across-the-monorepo--accepted-2026-08-17"></a>
<a id="3-split-bcailabdb-into-per-domain-modules--accepted-2026-08-17"></a>
<a id="4-fix-the-evaluation-history-n1-query--accepted-2026-08-17"></a>
<a id="5-session-cleanup-cron--accepted-2026-08-17"></a>
<a id="6-session-secret-rotation--accepted-2026-08-17"></a>

- **Engineering quality iteration** — already accepted. [Original scope and evidence](roadmap-accepted-history.md#now--engineering-quality-iteration); [delivery record](changelog.md).

<a id="now--account-passwords-and-profile--accepted-2026-08-18"></a>

- **Account passwords and profile — accepted (2026-08-18)** — already accepted. [Original scope and evidence](roadmap-accepted-history.md#now--account-passwords-and-profile--accepted-2026-08-18); [delivery record](changelog.md).

<a id="now--mapdown-local-document-library--accepted-2026-08-23"></a>

- **Mapdown local document library — accepted (2026-08-23)** — already accepted. [Original scope and evidence](roadmap-accepted-history.md#now--mapdown-local-document-library--accepted-2026-08-23); [delivery record](changelog.md).

<a id="now--mapdown-account-save-and-frozen-publishing--accepted-2026-08-23"></a>
<a id="stage-2--explicit-account-save"></a>
<a id="stage-3--frozen-publication"></a>

- **Mapdown account save and frozen publishing — accepted (2026-08-23)** — already accepted. [Original scope and evidence](roadmap-accepted-history.md#now--mapdown-account-save-and-frozen-publishing--accepted-2026-08-23); [delivery record](changelog.md).

<a id="now--mapdown-library-page-live-published-viewer-and-copy--accepted-2026-08-25"></a>
<a id="stage-1--the-document-library-becomes-a-page"></a>
<a id="stage-2--the-published-page-becomes-a-live-read-only-map"></a>
<a id="stage-3--copy"></a>

- **Mapdown library page, live published viewer, and copy — accepted (2026-08-25)** — already accepted. [Original scope and evidence](roadmap-accepted-history.md#now--mapdown-library-page-live-published-viewer-and-copy--accepted-2026-08-25); [delivery record](changelog.md).

<a id="a-writing-prompt-bank-and-guided-entry--accepted"></a>

- **A. Writing prompt bank and guided entry — accepted** — already accepted. [Original scope and evidence](roadmap-accepted-history.md#a-writing-prompt-bank-and-guided-entry--accepted); [delivery record](changelog.md).

<a id="b-saved-translations--accepted"></a>

- **B. Saved translations — accepted** — already accepted. [Original scope and evidence](roadmap-accepted-history.md#b-saved-translations--accepted); [delivery record](changelog.md).

<a id="c-shared-interaction-and-layout-correctness--accepted"></a>

- **C. Shared interaction and layout correctness — accepted** — already accepted. [Original scope and evidence](roadmap-accepted-history.md#c-shared-interaction-and-layout-correctness--accepted); [delivery record](changelog.md).

<a id="d-reading-evaluation-dead-output--accepted"></a>

- **D. Reading evaluation dead output — accepted** — already accepted. [Original scope and evidence](roadmap-accepted-history.md#d-reading-evaluation-dead-output--accepted); [delivery record](changelog.md).

<a id="e-scalable-studio-navigation-and-material-discovery--accepted"></a>

- **E. Scalable Studio navigation and material discovery — accepted** — already accepted. [Original scope and evidence](roadmap-accepted-history.md#e-scalable-studio-navigation-and-material-discovery--accepted); [delivery record](changelog.md).

<a id="now--mapdown-production-mvp"></a>

- **Mapdown production MVP and five stabilization checkpoints (accepted 2026-08-15)** — already accepted. [Original scope and evidence](roadmap-accepted-history.md#now--mapdown-production-mvp); [delivery record](changelog.md).

## Exploration, history, and decisions

These used to live in this file and were split out on 2026-08-01, so that what remains here
is only what is planned or authorized:

- **Unscoped ideas** the owner is considering → `docs/exploration.md`. Not authorization.
- **What shipped**, with dates and what was learned → `docs/changelog.md`.
- **Settled decisions** and their rationale → `docs/decisions/`.
