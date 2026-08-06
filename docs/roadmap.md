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

- **Canvas affordances — authorized, not started.** Four independent items, each shippable
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
- **Theme differentiation — authorized, not started.** The four presets read as hue variants
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
  this roadmap — when it is added, this constraint applies to it.

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
- **`next_drills`: render or delete.** Reading evaluation generates `next_drills` on every
  attempt and stores it, but no page renders it — a pure dead output costing tokens. Either
  surface it (with a one-tap "practise this" that creates a passage from `target_text`) or drop
  it from the evaluation. Confirmed 2026-07-21.
- **Free entry points made explicit** (owner-raised 2026-07-23): header + hero chip showing what
  is usable without an account. Its *data* half already lands in IA Phase 1 — the registry's
  `access: public | trial | auth` field is what makes free entry consistent — so this item is the
  presentation half, and it follows the colour work.
- Unified feedback-language setting (currently duplicated per tool in localStorage).
- Fold **writing** into the ability profile. Writing currently contributes only counters and
  Continue/Recent entries, because it has no tag vocabulary — a prompt is not a passage. The
  mechanism is settled (IA v2 design §6.3): a new vocabulary plus a writer emitting into the same
  `learner_tag_observations` table, surfaced on `/english/progress` rather than crowding the Home
  snapshot. Blocked on that vocabulary, not on schema.
- Feedback wait experience: streaming or narrative loading instead of a spinner
  (the "magic moment" should not hide behind a spinner).
- Replace native `confirm()` dialogs with branded confirmation UI.

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
- Translate history for signed-in users — opt-in only (current privacy stance: translation
  text is never persisted). Most interesting framed as learning material: saved translations
  feeding vocabulary/dictionary and the learner profile, not a standalone log.
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
- **Writing prompt bank — raised 2026-07-27** from "nice cold-start fix" to structural. With a
  graded prompt bank, all three practice tools share one shape (platform material + user's own),
  which is what lets the IA v2 list skeleton be instantiated three times instead of special-cased.
  Note it gives writing *material*, not *measurement*: prompts have no tag vocabulary, so writing
  still contributes nothing to the ability profile until the Next item above lands. Originally
  discussed 2026-07-21, `docs/learner-model-notes.md` §5.
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
