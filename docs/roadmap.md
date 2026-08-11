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

## Now — English Studio material, memory, and interaction iteration

The owner authorized this iteration and decisions D1-D5 on 2026-08-09. Implementation is
**in_review** on `codex/english-studio-major-iteration`; only the owner may move it to
accepted. The detailed design and failure registry live in
[the iteration plan](english-studio-major-iteration-proposal.md).

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

### A. Writing prompt bank and guided entry — in_review

- Add a reviewable `writing_prompts` contract with stable identity, family/task type, prompt
  text, optional CEFR discovery band, topic, target words, optional reviewed asset, provenance,
  editorial status, and timestamps. Add a nullable prompt reference to writing articles while
  preserving the article's assignment as an immutable snapshot.
- Add deterministic intake/validation and idempotent publication tooling. The first batch is
  exactly 48 original prompts: 24 general prompts (six each for A2/B1/B2/C1), 12 IELTS
  Academic Task 1 prompts with reviewed chart/table/process/map assets, and 12 IELTS Task 2
  prompts across the four common task families.
- Generated artifacts may be committed as drafts, but no prompt becomes published until
  automated validation, an independent content review, and owner review of all flagged items
  plus the agreed sample are complete.
- Make `/writing` a material-led catalogue with family/task filters, visible learner work and
  progress, and repeated attempts as distinct articles. Preserve freeform writing at
  `/writing/new`; no prompt may be hidden because of level.
- Starting a published prompt must use its correct coach, target, and asset and save both its
  stable prompt reference and immutable assignment snapshot. Draft/retired prompts never
  appear or start; retiring/editing a prompt never rewrites existing work.
- Add a distinct IELTS Academic Task 1 evaluation contract. The anonymous trial uses one
  reviewed featured prompt without gaining catalogue access, persistence, or extra quota.

Acceptance evidence: validation/parser unit tests; a 48-item manifest with zero validator
errors and review status; local D1 checks for published/draft/retired visibility, immutable
snapshots, and repeated attempts; browser coverage for catalogue, prompt detail/start,
freeform entry, Task 1/Task 2, trial, progress, mobile, keyboard, and reduced motion.

Review evidence (2026-08-10): deterministic validation passes for all 48 source prompts
(24 general, 12 Task 1, 12 Task 2); all 12 derived Task 1 assets and the review pack match
batch hash `38d84de9ab133f3308d3ac95ec24a06c243ef60f58b6bcfc9a08244836864078`.
Fresh local D1 applies all 17 migrations with no foreign-key violations; browser/D1 fixtures
cover no-write preview, atomic/idempotent first submission, immutable snapshots, feedback
retry generations, failure recovery, trial, and responsive catalogue/detail layouts.

Publication status (2026-08-10): the batch is approved and published to development and
production D1; `/writing` serves all 48 assignments. The approval was recorded by a single
reviewer — the owner acted as both independent content reviewer and approving owner, with no
second party — in `docs/approvals/writing-prompts-38d84de9.json`. A second-party content
review is therefore still outstanding as a quality step, and would need a fresh manifest.
Publication does not by itself make this item accepted; only the owner makes that transition.

### B. Saved translations — in_review

- Add private, user-owned saved translations containing the source/result language metadata
  and timestamps. Saving is explicit, signed-in only, retry/double-click idempotent, and
  available after the existing popup-auth handoff without losing the in-memory result.
- Add an authenticated, bounded/paginated `/translate/saved` workspace with list/detail and
  confirmed hard delete. Every read and mutation is user-scoped; foreign and absent ids are
  indistinguishable. Failed/partial streams cannot be saved.
- Keep the feature out of the universal navigation rail: it is history inside the Translate
  workspace, consistent with the English Studio information architecture.

Acceptance evidence: pure validation/idempotency tests where applicable; local D1 checks for
no implicit or anonymous persistence, owner-only save/read/delete, retry stability, bounded
queries, and deletion; browser coverage for anonymous-to-auth Save, list/detail/delete,
mobile, keyboard, and failure recovery.

Review evidence (2026-08-10): proof tests cover tampering, expiry, subject changes,
normalization, size limits, and anonymous-to-auth handoff. Local D1/browser fixtures cover
explicit-only persistence, replay idempotency, snapshot integrity, two-user isolation,
same-result 404s, 25-row keyset pagination, confirmed hard delete, no-JavaScript redirect,
failed streams, and consecutive results that do not inherit `Saved` state. Private responses
use `Cache-Control: private, no-store`; no remote migration or deployment was performed.

### C. Shared interaction and layout correctness — in_review

- On narrow Translate layouts, keep the primary action reachable and reveal completed output;
  long input grows to a bounded height and the page owns ordinary reading scroll. Preserve
  streaming, selection, keyboard shortcuts, reduced motion, and no-JavaScript behavior.
- The mobile navigation drawer traps focus, makes covered content inert, closes by Escape and
  backdrop, locks background scroll, and restores focus. Navigation remains usable if drawer
  JavaScript fails.
- Give Reading's record control a state-dependent accessible name.
- Replace the duplicate Reading/Writing feedback-language keys with one English Studio
  preference, one-time compatibility fallback, and same-tab updates.
- Replace the five native web-app `confirm()` calls with one accessible branded dialog,
  including cancel/confirm, keyboard, pending, and return-focus paths. Mapdown is excluded.
- Replace Writing's static evaluation wait with honest narrative progress while preserving
  retry/failure behavior; do not add fake progress to Translate's real stream.

Acceptance evidence: relevant unit tests plus browser QA at desktop/tablet/mobile widths,
keyboard-only, reduced motion, and screen-reader accessibility-tree inspection. The four
planning-baseline failures (Translate mobile reveal, drawer focus escape, unnamed Reading
record control, unguided Writing trial) must all be closed without new console errors.

Review evidence (2026-08-10): browser QA at 375, 768, and 1280px verifies Translate action
reachability, output reveal, drawer `inert`/focus loop/Escape restoration, dialog role/title/
description/return focus, and Writing catalogue/detail layouts with no console errors.
Standard-tier QA found and fixed two remaining touch-target defects; the relevant Writing
links and Translate language selectors now measure 44px. Reduced-motion rules are present in
the production bundle; dynamic emulation was best-effort only because the isolated browser's
CDP allowlist rejects `Emulation.setEmulatedMedia`.

Acceptance-review follow-up (2026-08-10): nested Writing loaders now preserve the schema
unavailable state during Remix's parallel loading; trial submission is server-pinned to the
single featured slug; first-submit keys survive loader revalidation; article deletion retains
learner revisions; and recent-piece dates use the hydration-safe local formatter. Translation
completion is now independent from Save-proof eligibility, so output beyond the 40,000-character
Saved limit still completes and consumes quota without exposing Save. The first-batch census
was moved out of the shared prompt domain into seed policy, canonical sorting is locale
independent, publish SQL has explicit typed quoting, and the seed pipeline joins root
typecheck/tests. Mobile touch sizing is scoped to intended Studio controls, and destructive
form triggers cannot submit without the confirmation JavaScript path.

### D. Reading evaluation dead output — in_review

Remove `next_drills` from new evaluation prompts and generated schemas. Keep read compatibility
for existing stored payloads and leave the future one-tap drill/session lifecycle deferred.

Acceptance evidence: parser fixtures prove old feedback still loads; prompt/schema tests prove
new evaluations do not request or require `next_drills`.

Review evidence (2026-08-10): compatibility fixtures load legacy `next_drills`, while prompt
and schema tests prove new Reading evaluations neither request nor generate the field. The
full repository suite passes 558 tests.

### E. Scalable Studio navigation and material discovery — in_review

The owner authorized this follow-up on 2026-08-10 after reviewing the current desktop Writing
and Coach Home surfaces. It changes information architecture and presentation, not the
underlying learning, recommendation, or evaluation policies.

- Replace the heavy desktop rail treatment with a quieter, narrower navigation spine. Keep
  destinations, active state, account access, mobile drawer behavior, keyboard behavior, and
  the existing English Studio product boundary intact.
- Make `/english/home` action-first: continuation is primary, the coach recommendation is
  secondary, level/practice/coverage form a compact status summary, and detailed skills and
  recent activity read as lists rather than a dashboard card mosaic. Preserve the current
  recommendation seam and all null-level/no-locking invariants.
- Make `/writing` a category hub instead of rendering the complete prompt bank. It must expose
  General English, IELTS Academic Task 1, IELTS Academic Task 2, recent learner work, and the
  freeform path; a category selection opens a bounded catalogue and every published prompt
  remains reachable regardless of CEFR band.
- Keep catalogue state in the URL, query only the selected family/task and page, and use a
  bounded continuation mechanism rather than a client-side fetch of the whole bank. The
  resulting material-directory contract must be reusable by future Reading and Dictation
  catalogues without forcing material taxonomy onto Translate or Speech.
- Preserve the established editorial design tokens, responsive reading order, 44px primary
  touch targets, visible keyboard focus, reduced-motion behavior, and accessible names.
- Use **Session** for one durable Writing workspace and **Round** for a revision inside it.
  Rename the Writing hub's recent-work section accordingly and provide an authenticated,
  bounded `/writing/sessions` history where every non-deleted session remains reachable.

Acceptance evidence: focused query/filter/pagination tests; browser coverage at 375, 768, and
1280px for rail, Home, Writing hub, category catalogue, prompt detail, and continuation;
keyboard-only and reduced-motion checks; no new console errors; and the full repository test,
typecheck, and production build. Writing session history additionally covers empty, populated,
continued-page, and mobile layouts without loading an unbounded article collection. New materials, Reading/Dictation catalogue implementation,
global search, and a taxonomy/schema expansion are explicitly outside this follow-up.

Review evidence (2026-08-10): `/writing` now queries three collection counts instead of the
complete prompt bank; `/writing/library` keeps category, level/task-family, and opaque keyset
continuation state in the URL and reads at most 13 rows to render a 12-item page. The first
page promotes three non-duplicated assignments into the retained prompt-card treatment, then
uses compact rows for the remaining bank. Authenticated browser checks cover the rail, cold
Coach Home, Writing hub, catalogue, second-page continuation, drawer focus/Escape restoration,
visible keyboard focus, and 44px mobile actions at 375/768/1280px with no horizontal overflow.
Owner-review follow-up moves shallow detail return links to the leading edge and uses compact
breadcrumbs for Writing's real hub → collection → prompt hierarchy, including category-aware
prompt return destinations. Prompt-backed learner work extends that context through the source
assignment to the current piece; freeform work keeps a compact Writing → piece trail.
The in-app browser injects `#codex-browser-sidebar-comments-root` as a third child of `<html>`,
which produces Remix hydration warnings in that test surface; standalone browser checks are
clean, and no application runtime error was observed. The full suite passes 561 tests, Web
typecheck passes, and the production build succeeds.

Session-history follow-up (2026-08-10): Writing now uses Session for one durable workspace
and Round for an in-session revision. `/writing` exposes six recent sessions and links to the
authenticated `/writing/sessions` history; the history reads 21 rows to render a 20-item page
with a stable opaque continuation cursor. Cursor/unit coverage includes first and continued
pages. Authenticated empty-state browser QA at a 351px content width verifies breadcrumb
semantics, 44px actions, and no horizontal overflow. The full suite now passes 564 tests;
Web typecheck and the production build pass.

Filter-interaction follow-up (2026-08-10): bounded Writing catalogues expose every available
level or task-family choice as a direct URL-backed link, including All. Selection immediately
loads the filtered first page without an intermediate Apply action; native link semantics keep
the interaction available to keyboards and without JavaScript.

Home-density follow-up (2026-08-10): the action zone groups continuation and recommendation
into two lightweight, equal-height panels; recommendation alternatives become subordinate
text actions rather than competing buttons. The status summary moves closer in one bounded
strip, and a lone detail section uses the full available width instead of reserving an empty
second column. Authenticated cold-state QA at 351px verifies reflow, 44px primary and level
actions, and no horizontal overflow; the full suite, Web typecheck, and production build pass.

Owner-review correction (2026-08-11): removed the equal-height framed Home panels after they
turned useful whitespace into visible empty card space. Continue now leads with a single
editorial rule, the recommendation stays unboxed, alternatives form a stable vertical action
list, and status uses open dividers instead of another container. Null-level recommendations
no longer claim to fit a known level; learners with history but no estimate regain the direct
level picker; Coverage reads the practised passage bands rather than the bounded recommendation
window; and Writing continuation names its last edit. Translate and Speech now share the same
title → workspace tabs → tool canvas rhythm: Translate uses a bounded two-pane workspace with
visible From/To labels, while Speech uses a narrower unboxed compose surface with a persistent
text label, linked help/count text, visible focus, and a mobile-sized editor that keeps Generate
in the first viewport. Browser checks at a 351px content width confirm no horizontal overflow
and first-viewport primary actions on Translate and Speech; all 564 tests, root typecheck, and
the production build pass.

History-surface follow-up (2026-08-11): Saved translations and Speech History no longer
repeat creation actions that are already available through their workspace tabs. Saved
translations keeps Translate as the single return path; Speech History removes its second,
oversized History heading and begins directly with the generation list or concise empty state.

### Explicitly excluded from this iteration

Mapdown Create with AI; writing-to-profile measurement; Dictation v2/session matching;
long-document translation; first-token/provider/AI-Gateway work; model-routing hot config;
LLM-signal weight promotion; Chinese UI; paid tier; profile settings; and further
Reading/Dictation library expansion.

## Now — Mapdown production MVP

The owner authorized Mapdown implementation through the Phase 2 production-MVP exit criteria
on 2026-08-04. Phase 1 merged in PR #26; Phase 2 implementation and deployment are complete
and **in_review**, not accepted until the owner makes that transition. Its acceptance criteria
are `docs/mapdown/spec/phases.md` §4 plus the scenario matrix in
`docs/mapdown/spec/testing-acceptance.md`.

The owner additionally authorized three Mapdown stabilization checkpoints on 2026-08-04:

- **P0 active-draft persistence — in_review.** Text visible in the editing textarea must be
  included in the debounced local snapshot before the editing session commits; direct refresh
  inside and after the debounce window must restore it; the saved indicator must track the
  visible draft; typing must retain one undo group; the textarea, node box and connectors must
  follow the visible draft in real time without creating per-keypress history entries; and
  leaving the empty node created by Enter must remove only that empty node, never the text that
  Enter just committed. Double-clicking a node must continue editing at the end of its existing
  label; `F2` remains the select-all replacement path.
- **Visual polish — in_review.** Reduce the top-level toolbar to a
  clear 6–7-control information hierarchy without losing commands; establish primary,
  secondary and quiet control styles; replace the unstyled theme picker; distinguish selection
  from node type; improve connector and collapse-control legibility; and establish consistent
  chrome spacing, typography and focus treatment. Keep chrome visuals out of document themes
  and exported SVG/PNG. Before increasing node typography, align layout measurement with
  rendered font metrics. Verify desktop, tablet, mobile, keyboard and reduced-motion behavior.
- **Interaction-state clarification — in_review.** Editing Enter must commit only and return
  the same node to selected mode; selected-mode Enter must create exactly one sibling/root
  child; a new empty leaf must not multiply on repeated Enter. The state machine must be
  recorded as an event/guard/action/next-state table. Markdown, SVG and PNG downloads must use
  the sanitized current root label with a safe fallback. `⌘0`/`Ctrl+0` must restore canvas zoom
  to 100% without changing viewport centre, document content or semantic history.

The owner authorized a fourth and fifth Mapdown checkpoint on 2026-08-06:

- **Canvas affordances — in_review.** Four independent items, each shippable
  alone. (a) Move the zoom control out of the status bar and View menu into a floating
  bottom-left capsule (− percent +), where clicking the percentage restores 100%; the View
  menu keeps its entries. (b) Show a dismissable hint line on an untouched empty map naming
  the two authoring keys (Enter = sibling, Tab = child); it must disappear once the map has
  any content beyond the root and must never appear in an export. (c) Choose the initial
  document theme from the system colour scheme — light systems open Minimal Light, dark
  systems open Dark — as an **initial value only**: once the user picks a theme, or a stored
  document carries one, the system preference is ignored for that document. (d) Give nodes a
  hover treatment distinct from both the selected and the editing state. Acceptance for all
  four: chrome visuals stay out of document themes and exported SVG/PNG; keyboard and
  screen-reader behaviour is unchanged; verified at desktop, tablet and mobile widths and
  under reduced-motion.
- **Theme differentiation — in_review, all three steps.** The four presets read as hue variants
  of one design because the branch palette reaches only connector strokes: `branchColorFor()`
  is consumed for stroke colour alone, so node fills always come from a single per-role token
  and no theme can look structurally different from another. Three ordered steps, each
  shippable alone.
  1. **Palette reaches the nodes.** In `by-first-level-branch` mode the branch colour must
     drive first-level node fill as well as connector stroke, with node text switched to the
     accessible contrast partner of that fill. Descendants follow the theme's existing
     `descendantTintPolicy`. Acceptance: every palette colour in every preset yields node text
     at WCAG AA or better against its own fill; `single` mode renders exactly as it does today;
     SVG and PNG exports carry the fills as literals.
  2. **Presets differ in shape language, not only hue.** Give the presets genuinely distinct
     node geometry — corner radius, border presence and weight, padding density, and root
     treatment — instead of today's near-identical `node()` defaults. The typography scale
     belongs to this step. Acceptance: the four presets are distinguishable in a grayscale
     screenshot.
  3. **Split the theme into two orthogonal fields — shape language × palette.** Acceptance:
     Markdown front matter carries both fields; a document written with the current single
     `themeId` still opens and maps onto the pair; the picker presents the two axes separately.
- **Sequencing constraint (owner, 2026-08-06): step 3 must land before any Mapdown publish or
  share-URL feature.** The theme id is persisted in Markdown front matter, so it becomes a
  public contract the moment a published URL carries it; splitting the field is close to free
  now and requires format migration plus back-compatibility afterwards. Publish is not yet on
  this roadmap — when it is added, this constraint applies to it. **Step 3 shipped 2026-08-06
  (PR #37), so this gate is clear**; the front matter now carries `shape:` and `palette:` and a
  published URL can safely reference either axis.

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

Also still open, and the natural successors at the seam Phase 2 left: the **matching** service
(Dictation v2, in Later) and the session/planning layer. Both replace
`selectStarterPractice()` and inherit its callers — the Home renders whatever that seam
returns, so neither needs an IA change.

## Next
- **Mapdown — production MVP in review.** A static, local-first, keyboard-first
  Markdown mind-map editor at `apps/mapdown`, live at `map.bcailab.com`. The editor works:
  keyboard authoring (Enter/Tab/Shift+Tab), two-sided layout, four document themes,
  Markdown/SVG/PNG export, IndexedDB autosave with validated recovery, pan/zoom/fit,
  searchable Help/Command Center, and accessible tree semantics.
  All seventeen implementation steps and D-03 deployment are complete with evidence in
  `docs/mapdown/README.md` and `docs/changelog.md`; owner acceptance is the remaining roadmap
  transition, while the authorized stabilization checkpoints above continue separately. Read
  `docs/mapdown/decisions.md` before reopening any settled question — it has nineteen records,
  several of which correct an earlier
  mistake of mine and say so.
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
- **Free entry points made explicit** (owner-raised 2026-07-23): header + hero chip showing what
  is usable without an account. Its *data* half already lands in IA Phase 1 — the registry's
  `access: public | trial | auth` field is what makes free entry consistent — so this item is the
  presentation half, and it follows the colour work.
- Fold **writing** into the ability profile. Writing currently contributes only counters and
  Continue/Recent entries, because it has no tag vocabulary — a prompt is not a passage. The
  mechanism is settled (IA v2 design §6.3): a new vocabulary plus a writer emitting into the same
  `learner_tag_observations` table, surfaced on `/english/progress` rather than crowding the Home
  snapshot. Blocked on that vocabulary, not on schema.

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
- Engineering quality: vitest for LLM-output parsers + ESLint; fix evaluation-history N+1
  query; audio Range request support; session cleanup cron; session secret rotation.
- Profile settings (avatar + nickname) for email-OTP users, who have no Google profile
  data to fall back on — noted 2026-07-20, not urgent.
- **Library expansion — first batch shipped 2026-07-28 (20 → 40 passages, ten per band); keep
  going.** The IA v2 design assumes material eventually grows ~100× (roughly 500 per band),
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

## Exploration, history, and decisions

These used to live in this file and were split out on 2026-08-01, so that what remains here
is only what is planned or authorized:

- **Unscoped ideas** the owner is considering → `docs/exploration.md`. Not authorization.
- **What shipped**, with dates and what was learned → `docs/changelog.md`.
- **Settled decisions** and their rationale → `docs/decisions/`.
