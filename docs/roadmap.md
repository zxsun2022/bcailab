# Roadmap

**This file is the single source of truth for iteration planning.** Any AI coding tool
(Claude Code, Codex, etc.) or human working in this repo should:

1. Read this file before starting product work, to know what the current iteration is.
2. Move finished items to **Done** (with a date) in the same PR that finishes them.
3. Only add or reprioritize items after the owner (Z.Sun) confirms — never unilaterally.

Product direction (agreed 2026-07): bcailab is a studio; **English Studio** is the flagship
product (an AI English coach: read, write, listen, translate). Translate is the free,
no-account acquisition funnel into it.

## Now (current iteration — IA v2 / Coach Home, scoped 2026-07-27, confirmed by owner)

**Read `docs/english-studio-ia-v2-design.md` before starting — it is the specification, and
this entry is only the index into it.** It went through two external review rounds and three
prototype revisions; the prototype (`docs/mockups/ia-v2.html`, neutral colours, no data) shows
the intended structure, and `docs/mockups/ia-v2-brief.md` is the historical review brief.

English Studio moves from **tool-first** (a menu of five peer apps) to **coach-first**: a Home
that answers *continue this / do this next*, with progress data supporting the recommendation
rather than fronting it. Three independently shippable, independently revertible phases —
**do not do this as one change**:

- [x] **Phase 1 — Navigation truth.** *(completed 2026-07-28)* Shared module registry (`english-modules.ts`) consumed by
      landing, rail, and Home; static rail (no dropdown) with a Home entry and practice/utility
      grouping; per-tool actions in the rail; Translate gains a way back into the studio.
      This also **fixes a real bug**: the switcher's drifted copy of the module list bypasses
      trial routing, so an anonymous visitor picking Reading from the switcher gets a login
      bounce where the landing page would have sent them to `/reading/trial`. No page redesign.

- [x] **Phase 2 — Coach Home.** *(completed 2026-07-28)* `english_.home.tsx` (escaped layout); `/english` redirects
      signed-in users to it and stays the public landing for everyone else. Action zone
      (Continue + **one** recommendation with directional alternatives — easier / challenge /
      different topic, never a slot-machine refresh) over a status grid (level, volume,
      coverage, ability snapshot, trend, recent). Cold start = a single dictation CTA **plus
      the one-tap level picker** (moved out of Later — the cold start depends on it; the data
      layer already exists unused). `selectStarterPractice()` as a pure, unit-tested function
      returning a **list of actions with reasons** even while its length is 1, so matching and
      the later planning layer inherit the same seam. `/english/progress` is **kept** as the
      first-class detail page, linked from the Home panels and the rail — not redirected away.
      Bounded queries; degrade to a module launcher on any personalisation failure, never blank.

- [x] **Phase 3 — Reading surface.** *(completed 2026-07-28)* Remove the rail's passage list (which also removes a
      duplicated DB query); library as the main axis grouped by band with card states
      (`New` / `In progress 4/11` / `Best 86%`); learner's band open and marked, others folded
      and **never locked**; own texts a visible secondary section with the add action in the
      rail. Topic/state filters and search wait for the first library expansion.

Constraints an implementer must not quietly break (rationale in the design doc):

- **Never render a `null` level as "B1".** The starter policy may use B1 internally; the UI
  must not claim a level the system has not established.
- **Never lock material by band.** Beyond it being hostile on an uncertain estimate, CEFR
  confidence depends on band *spread* — practising one band caps it at exactly the override
  threshold, so a recommender that never explores starves its own estimator.
- **Writing reuses the list skeleton, not the semantics.** Writing cards speak prompt type,
  length, draft round, feedback state — never accuracy or mastery it does not have, and
  writing stays out of the ability panels until it has a real vocabulary.
- **No recommendation service, repository layer, or feed framework** in this iteration.

Still open after this iteration: the **matching** service (Dictation v2, Later) and the
session/planning layer, both of which attach at Phase 2's recommendation seam.

## Next

- **Reading history silently drops library attempts** (found 2026-07-28 while building the
  Coach Home). `listCompletedEslReadingAttemptsByUser` still joins the legacy `esl_passages`
  table, but reading attempts have pointed at `passages` since the material-layer migration —
  so an inner join on the old table matches only user-created passages and **every attempt on
  library material vanishes** from `/reading/progress`. Not cosmetic: it under-reports practice
  and skews the reading dashboard's averages. `listRecentReadingAttempts` (added for the Home)
  shows the correct join; repoint the older helper and check the rest of the file for the same
  stale join before assuming it is the only one.
- **`next_drills`: render or delete.** Reading evaluation generates `next_drills` on every
  attempt and stores it, but no page renders it — a pure dead output costing tokens. Either
  surface it (with a one-tap "practise this" that creates a passage from `target_text`) or drop
  it from the evaluation. Confirmed 2026-07-21.
- **Semantic colour separation** (owner-raised 2026-07-23). Today `--accent: #b52a1c` and
  `--red: #b52a1c` are **the same colour in light mode**, and `--accent` (87 usages) covers both
  primary CTAs and `.form-error` — so a form error and a primary button are indistinguishable by
  colour. There is no semantic colour layer at all (no `--error` / `--success` / `--warning`).
  Fold in a related defect: `.dash-trend.is-up` references `var(--sage, …)` but `--sage` is never
  defined, silently relying on the fallback. Sequenced **before** the item below, because that one
  adds new coloured UI and you should not add coloured elements before deciding what colours mean.
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

- Long-document translation: chunked parallel translation + streaming output; raise
  signed-in limit to ~100k chars.
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
- **Reading grader — deterministic split** (not triggered by current evidence; revisit if the
  trigger below reproduces). The grader variance spike (see Done, 2026-07-23) found the
  single-call reading evaluator repeatable on 2 of 3 samples (stddev well under the 4-point
  threshold) and borderline-but-under on the third (a jargon-dense sentence). That does not
  justify the deterministic-measurement rebuild (ASR diff + calibrated pronunciation API) the
  v1 diagnosis proposed — the evaluator looks trustworthy enough as-is for most material.
  **Trigger to revisit:** a further spike run on more jargon-dense/unfamiliar-register material
  reproduces variance that actually crosses the threshold; until then this stays parked.
- Chinese UI (at least Translate + landing pages) — decided to defer, 2026-07-15.
- Paid tier (quota/model config already has an `anonymous/free/paid` shape).
- Posts product landing page (currently links straight into the tool).
- Translate history for signed-in users — opt-in only (current privacy stance: translation
  text is never persisted). Most interesting framed as learning material: saved translations
  feeding vocabulary/dictionary and the learner profile, not a standalone log.
- Dictation v2 — level-adaptive material **matching** (revised 2026-07-20, owner
  confirmed; supersedes the earlier "dynamic per-user generation" framing): elevate
  `learner_profile` into a shared learner-model layer (tools write observations, the
  profile layer aggregates), then **retrieve** from a large pre-generated, tagged
  material library instead of generating per request. The LLM's job is assessing the
  learner and interpreting error patterns, not producing material at request time.
  Rationale: a fixed item bank can be empirically calibrated from real accuracy data
  (every passage accumulates a sample; generated-once material never can), TTS cost is
  paid once and amortized across all users rather than per session, and retrieval is a
  D1 query rather than a multi-second generate-then-synthesize round trip. It also keeps
  the owner's per-passage review in the loop. Work shifts from generation to (a) a
  dimensional tag schema shared by library and learner profile, (b) a matching policy,
  (c) growing the library from 20 to several hundred passages (now its own raised item above).
  Reading/Writing migrate to the same interface gradually (interface migration, not a rewrite).
  Prerequisites: shared learner model (done 2026-07-21) + dictation v1 (done).
  **Where it attaches (2026-07-27):** IA v2 Phase 2 builds `selectStarterPractice()` — a pure
  function returning a list of recommended actions with reasons. Matching replaces that function
  and inherits its callers; the Home renders whatever the seam returns, so no IA change is needed.
  The **session / goal-first layer** (compose "today's practice" rather than return single items)
  is the tenant after matching, on the same seam — recorded 2026-07-27 from the second IA review
  as the eventual framing, deliberately not built now.
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
- **Library expansion — raised 2026-07-27**, and no longer only a Dictation v2 sub-task. The IA
  v2 design assumes material grows ~100× (roughly 500 per band): at today's 5 per band a
  motivated learner exhausts their level in two sittings, and the Coach Home makes that thinness
  *visible* in a way the current catalogue does not. Expansion is cheap now that material is
  LLM-generated, so this is mostly a content-and-review push, not engineering. Two consequences
  when it lands: Reading's topic/state filters become necessary (IA v2 Phase 3 defers them to
  exactly this trigger), and the whole-passage reference audio gap from the material layer
  (design §9.1) should be closed in the same batch so TTS is paid once.
- **Writing prompt bank — raised 2026-07-27** from "nice cold-start fix" to structural. With a
  graded prompt bank, all three practice tools share one shape (platform material + user's own),
  which is what lets the IA v2 list skeleton be instantiated three times instead of special-cased.
  Note it gives writing *material*, not *measurement*: prompts have no tag vocabulary, so writing
  still contributes nothing to the ability profile until the Next item above lands. Originally
  discussed 2026-07-21, `docs/learner-model-notes.md` §5.
- **Promote LLM judgment to a formal measurement signal** (owner direction 2026-07-27). The
  grader variance spikes (Done, 2026-07-23) showed LLM scoring repeatable enough to be more than
  a down-weighted hint. The architecture already anticipates this: `learner_tag_observations.source`
  distinguishes `deterministic` from `llm`, and the weighting lives in one constant
  (`SOURCE_WEIGHT` in `learner-model.ts`), so promotion is **a weight change with a documented
  evidence trail, not a migration** (IA v2 design §6.2). Do it on evidence — more variance runs
  across registers and speakers — not on vibes. New signal sources (a speaking evaluator, say)
  join the same way: one enum value, one weight.
- **vanmemo** (formerly vanbox) stays a permanently separate product — settled
  2026-07-21. It is getting its own top-level domain (vanmemo.com) and its own accounts,
  and its stack is Next.js + OpenNext on Workers with Auth.js, so a monorepo would share
  almost nothing while adding two build systems and two deploy pipelines. bcailab's only
  tie to it is a product link from the homepage — shipped 2026-07-23 as the third card in
  the homepage Products list (external link to vanmemo.com). This is no longer a decision
  awaiting a trigger; treat it as closed.

Under consideration by the owner, **not scoped, not prioritized** (recorded 2026-07-21 so
they are not forgotten — none are urgent):

- Homepage redesign.
- Overall visual language pass across the studio.
- An admin/back-office system for **content** (material-library management currently happens
  through `scripts/material-seed/` and raw SQL). Deferred while there are no real users and no
  non-engineer operator — a back-office UI is pure liability until then. Note this is a
  *separate* need from model routing hot-config (see the Later item), which does **not** require
  an admin system and has an earlier trigger. Owner view 2026-07-21.

## Done

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
  browse IA, which waits on the learner model — `docs/english-studio-ia-design.md` §2.

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
