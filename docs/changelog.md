# Changelog

Delivery record for bcailab. **This file is history, not a plan** — it records what shipped
and what was learned, so `docs/roadmap.md` can stay about what is next.

Split out of `docs/roadmap.md` on 2026-08-01; entries below are moved verbatim and were
written at the time each item shipped. Newest first.

Only the owner marks work done. An agent that finishes an item reports it and lets the owner
make the final transition; see `AGENTS.md`.

- 2026-08-04 — **in_review: Mapdown Phase 1 semantic editor (PR #26).** The review candidate
  contains the document model and ten enforced tree invariants, pure invertible commands,
  session-grouped undo/redo, right-only variable-size layout, keyboard-first editing with IME
  protection, canonical Markdown import/export, and IndexedDB autosave with validated snapshot
  recovery. Pre-landing review added production-backend IndexedDB coverage, direct IME guard
  boundary tests, stable canvas callbacks so typing does not reconcile every SVG node, correct
  F2 selection and editing-session undo behavior, and a recovery failure path that cannot
  permanently disable later saves. Final review also closed restored-session ID collisions,
  cross-session snapshot overwrites, selection clearing, and abandoned empty-node handling.
  Evidence: 287/287 tests, a clean production build, and browser regression checks. Only
  the owner may change this entry from `in_review` to accepted/shipped.

- 2026-07-30 — **Streaming translation output.** `/translate` no longer waits for the whole
  model response: a new SSE resource route (`/translate/stream`) streams the translation as it
  is generated, cutting time-to-first-text from the full generation time to first-token time
  (~1.7s vs ~2.7s on a 145-character sample; the gap widens with length). Added `streamGemini`
  to the shared LLM layer beside `callGemini`, so any task can stream without changing which
  model serves it. Because JSON cannot be read mid-stream, the streaming prompt emits the
  detected language as a `#lang:` header line that the server strips before forwarding deltas.
  Validation and quota moved into `translate-request.server.ts`, shared with the untouched
  `/translate` action, which remains the no-JS fallback. Usage is still charged only on a
  completed translation.
- 2026-07-30 — **Semantic colour layer.** Replaced pigment-named `--accent` / `--red`
  contracts with action, danger, warning and success families for both themes. Primary
  actions retain the Studio's vermilion while errors/destructive controls use a distinct
  crimson, warnings use ochre and completed/positive states use sage. Migrated form/login/
  translation errors, destructive menus, writing feedback, Speech warnings, Reading status,
  Dictation diffs and progress trends; the previously undefined `--sage` fallback is gone.
  Usage rules and light/dark values are documented in `docs/design-system.md`.
- 2026-07-30 — **Reading progress includes library attempts.** Repointed the completed-attempt
  history query from the rollback-only `esl_passages` table to the unified `passages` table,
  matching the foreign key introduced by the material-layer migration. `/reading/progress`
  now counts and averages evaluated attempts on global library material as well as the
  learner's own texts. Audited the remaining legacy-table reads: they belong to the retained
  legacy passage CRUD only; no other attempt/history query still joins the stale table.
- 2026-07-29 — **Studio brand and account controls restored.** Corrected two app-shell
  regressions found after deployment: the bcailab mark once again returns to the site
  homepage instead of bouncing a signed-in learner back to English Studio Home, and the
  pinned avatar is again an interactive account menu rather than a static identity row.
  The shared menu exposes profile context, theme, sign-out and tool Settings when available.
- 2026-07-29 — **English Studio secondary-page semantics and hydration consistency.**
  Extended the app-shell contract beyond primary catalogues and dashboards: Reading,
  Writing and Speech settings now use the shared page frame; progress, creation, settings
  and detail routes provide tool-specific browser titles; every secondary workspace has one
  semantic `h1`; and Writing's edit control no longer lives inside its heading. Fixed the
  real Reading workspace hydration mismatch by rendering persisted rail/panel preferences
  from deterministic SSR defaults and restoring them after hydration, applying the same
  rule to the equivalent Writing detail panel. Documented these as acceptance rules in
  `docs/studio-app-shell.md`.
- 2026-07-29 — **English Studio application shell and page-frame contract.** Replaced the
  collection of route-owned outer coordinate systems with two reusable layers:
  `StudioShell` now owns the rail/main/canvas nesting for every primary tool, and
  `StudioPage` owns the shared title, description, page action, local tabs, content origin
  and three controlled body widths. Migrated Home, the three Progress views, Dictation,
  Reading, Writing, Translate and both Speech workspaces. The result keeps catalogue,
  focused-form and two-pane layouts appropriately different without letting each page
  redefine its margins or heading rhythm. Speech now has a real page header while
  Generate/History remain tool-local tabs; history still never enters the product rail.
  Verified public surfaces at desktop, tablet and mobile widths and confirmed that the main
  inset, rather than the document body, owns long-page scrolling. Architecture and adoption
  rules: `docs/studio-app-shell.md`.
- 2026-07-29 — **English Studio rail boundary and unified Progress entry.** Strengthened
  the product navigation contract from "no history" to "destinations only": removed the
  pinned-action API from the shared rail, so Reading and Writing can no longer add local
  creation or progress controls beneath the tool list. `/english/progress` is now the one
  visible Progress entry; `/reading/progress` and `/writing/progress` remain stable,
  tool-scoped drill-down routes with their native metrics rather than being flattened into
  a synthetic score. The three views share an `Overview / Reading / Writing` workspace
  switcher while the rail continues to highlight product-level Progress. Reading's
  "Add text" moved to its catalogue header; Writing's root workspace now identifies itself
  as "New piece".
- 2026-07-29 — **English Studio shell and navigation contract.** Standardised the learner
  surfaces around one collapsible product rail: stable `English Studio` identity, `Home`
  and product-level `Progress` first, then practice/tools, with tool-local actions in a
  separate context section. Translate now stays inside the shell. Removed Speech,
  Dictation and Writing history rows from the rail until a cross-tool session contract
  exists, and removed the shared rail's arbitrary list slot so tools cannot reintroduce
  history ad hoc. Speech generation history moved to a real `/speech/history` workspace
  tab beside Generate, following the tool-local pattern rather than global navigation;
  concrete Dictation, Reading and Writing workspaces expose an explicit return to their
  tool. Fixed the viewport/scroll ownership bug that locked catalogues such as
  `/dictation` and `/reading`: ordinary pages now use the main content scroller, while
  only editor/session layouts opt into bounded inner scrolling.
- 2026-07-28 — **Library expanded to forty passages, with reference audio.** Ten graded
  passages per CEFR band instead of five, across five topics the library did not previously
  cover (health, shopping, family, transport, hobbies), generated per band so the register
  stays distinct. Fixed a blocking defect found on the way: `publish.ts` still wrote to the
  legacy `dictation_passages` / `dictation_sentences` tables while the app has read from
  `passages` since migration 0012 — anything published since that migration would have been
  invisible to both Dictation and Reading, and the pipeline had not been run end to end since.
  Closed the material layer's §9.1 reference-audio gap in the same pass, exactly as that doc
  asked, so the TTS bill is paid once: every newly published passage now also gets a
  whole-passage recording at `material/{id}/reference.mp3`. Added `intake.ts`, which the
  documented manual path never had — it turns a hand-written batch into `out/*.json` and
  enforces the constraints (digits are an error, not a warning: a learner cannot tell whether
  to type "25" or "twenty-five"). One passage was edited before publishing rather than accepted
  as generated, which is what the human review pass is for. Verified live: forty passages
  render on production, per-sentence audio streams, and a reference object downloads from R2
  at the recorded byte size.
- 2026-07-28 — **English Studio IA v2 / Coach Home** (all three phases, PR #17). The studio
  moves from tool-first — a menu of five peer apps — to coach-first: `/english/home` is the
  signed-in top surface and answers *continue this / do this next*, with progress data
  supporting the recommendation rather than fronting it. `/english` keeps its URL and its
  marketing job for signed-out visitors and redirects signed-in ones, so the acquisition
  surface and the app surface stay separable. A shared `english-modules.ts` registry now backs
  the landing page, the rail and the Home, which fixed a real bug: the rail's drifted copy of
  the module list bypassed trial routing, so an anonymous visitor picking Reading from it got a
  login bounce where the landing page would have opened `/reading/trial`. The rail became
  static navigation; Reading's catalogue became the material surface, grouped by band with
  practice state on each card and the learner's own texts as a visible secondary section.
  `/english/progress` was **kept** as the depth destination rather than folded into the Home —
  folding it in would have recreated the orphaned-progress problem the iteration set out to fix.
  `selectStarterPractice()` is the recommendation seam: pure, deterministic, 21 tests, ranking
  nothing by tag profile, and returning a *list* of actions with reasons so matching and the
  later planning layer inherit the shape. Two constraints are enforced by tests rather than
  assumed — a null level is never rendered as B1, and alternatives are directional
  (easier / challenge / different topic) rather than a slot-machine reshuffle. Design:
  `docs/english-studio-ia-v2-design.md`; structural prototype: `docs/mockups/ia-v2.html`.
  Deliberately excluded: the matching service, the session/planning layer, and any
  recommendation service, repository layer or feed framework.
- 2026-07-23 — Grader variance spike: `scripts/grader-variance.ts` calls the reading evaluator
  5× against the same (audio, passage) pair and reports per-dimension stddev + CEFR-guess
  agreement. Three real recordings tested (`docs/spikes/grader-variance-*-20260723.md`): a
  ~80-word plain passage (overall stddev 0.00, 100% CEFR agreement), a ~30-word jargon-dense
  sentence (stddev 2.79, one CEFR flip, 80% agreement), and a ~30-word plain sentence matched in
  length to rule out length as the driver (stddev 1.20, 100% agreement) — ruling out sentence
  length and pointing instead at vocabulary/register density as the likely source of what
  variance exists. All three stayed under the roadmap's 4-point threshold. Conclusion: the
  single-call reading grader is repeatable enough on most material that the deterministic-split
  rebuild is not currently justified — see the downgraded item in Later with its re-trigger
  condition. This turns the learner model's reading-observation down-weight
  (learner-model-design §5.2) from an untested assumption into a data-backed one, though
  further samples on jargon-dense material would sharpen it.
- 2026-07-21 — Shared learner model + unified progress centre: every scored attempt now
  writes deterministic per-tag observations (`learner_tag_observations`, keyed on the
  `passage_tags` vocabulary) that aggregate into a shared profile — `esl_learner_profiles`
  generalised beyond reading with per-tag mastery (`tag_mastery_json`) and a measured CEFR
  estimate. Dictation attributes errors deterministically by reusing the tagger's own
  per-word predicates (one definition, no drift); reading contributes a down-weighted
  LLM-judged signal from evaluation highlights. A throttled background pass names the
  patterns for the learner (the write path `esl_learner_profiles` was designed for and never
  had) and never decides them. Level self-selection is stored and a confident dictation
  measurement overrides it gradually and visibly. New `/english/progress` growth surface;
  per-tool dashboards stay as drill-downs. Migration 0014. Excludes the matching service by
  design (still Dictation v2 in Later), onboarding UI, and a writing→tag write path.
  Design: `docs/learner-model-design.md`.
- 2026-07-21 — English Studio repairs: partial dictation practice is persisted and
  resumable (an unfinished passage used to be discarded silently, which is why production
  had zero dictation attempts); module navigation stays inside the product, with the rail
  logo going to `/english` and the tool name doubling as a module switcher; `/reading`
  became a catalogue with creation moved to `/reading/new`, and dictation sessions dropped
  the competing rail; and each practice mode offers the same passage in the other mode at
  the point where that is the natural next step. Migration 0013. Deliberately excludes
  browse IA, which waits on the learner model — `docs/archive/english-studio-ia-design.md` §2.

- 2026-07-21 — Material layer unified: dictation and reading now share one graded passage
  store (`passages` / `passage_sentences` / `passage_tags` / `passage_stats`), so a single
  passage can be taken as dictation *and* read aloud. Adds a deterministic tagger — tags
  derived from text by code, never guessed by a model, so they are reproducible and can be
  recomputed over the whole library when the vocabulary changes — plus per-passage
  empirical difficulty accumulated from every scored attempt including anonymous ones.
  Reading gains a graded library alongside the learner's own texts, with authorization
  collapsed into one predicate. Migration 0012 moves all 20 library and 14 user passages
  with ids preserved and deletes nothing. Excludes the matching service by design.
  Known gap: whole-passage reference audio for library passages was not built (design
  §9.1) — do it with the next library expansion so TTS is paid once.
  Docs: `docs/material-layer-design.md`.
- 2026-07-21 — Try-before-sign-in extended to Reading and Writing: `/reading/trial`
  (fixed sample passage, record once, real evaluation) and `/writing/trial` (one coach
  feedback round), both public and both persisting **nothing** — no attempt or article
  rows, and the reading trial never writes the audio to R2 at all, passing the bytes
  straight to the evaluator instead of using a `trial/` prefix plus cleanup. 5/day per
  anonymous visitor via the `feature_usage` quota table built for Dictation v1. The
  `/english` Reading and Writing cards now route signed-out visitors into the trials
  instead of opening the login popup; the popup appears from inside the trial once the
  quota is spent. Docs: `docs/tools/esl.md`, `docs/tools/writing.md`.
- 2026-07-21 — Dictation v1 shipped: pre-generated global material library (20 passages,
  5 each at CEFR A2–C1; 211 per-sentence Chirp3 MP3s in R2 under a public `dictation/`
  prefix), `/dictation` library + session workspace with replay and speed control,
  deterministic diff scoring (`dictation-diff.ts`, British/American spellings equivalent,
  flooding guard), signed-in attempt history with background LLM error-pattern feedback,
  and anonymous access via the new generic `feature_usage` quota table. Content is seeded
  offline by `scripts/material-seed/` (generate → owner review → publish); there is no
  runtime generation. Two decisions during implementation: scoring runs server-side rather
  than client-side so the reference text never reaches the browser, and quotas were raised
  well above the design's original numbers because a v1 session consumes no LLM tokens.
  Docs: `docs/tools/dictation.md`, design `docs/dictation-v1-design.md`.
- 2026-07-20 — Iteration started 2026-07-15 completed: unified LLM call layer
  (`llm.server.ts` routing table, per-tier translate models, `GEMINI_BASE_URL` override);
  anonymous translate quotas (5,000 chars × 8/day anon; 20,000 chars × 200/day signed-in);
  email OTP login via Resend (domain verified 2026-07-16; real delivery to QQ/163
  mailboxes tested and sign-in confirmed 2026-07-20).
- 2026-07-15 — Homepage redesigned as studio page (every.to style); `/english` product
  landing page merging Reading/Writing/Translate/Speech as one product; `/translate`
  DeepL-style tool (Gemini-driven).
- 2026-04-02 — Reading progress dashboard; ESL reading compose layout refactor.
- 2026-03-05 — Reading/Recitation v2 redesign complete.
