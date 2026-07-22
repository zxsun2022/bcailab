# Roadmap

**This file is the single source of truth for iteration planning.** Any AI coding tool
(Claude Code, Codex, etc.) or human working in this repo should:

1. Read this file before starting product work, to know what the current iteration is.
2. Move finished items to **Done** (with a date) in the same PR that finishes them.
3. Only add or reprioritize items after the owner (Z.Sun) confirms — never unilaterally.

Product direction (agreed 2026-07): bcailab is a studio; **English Studio** is the flagship
product (an AI English coach: read, write, listen, translate). Translate is the free,
no-account acquisition funnel into it.

## Now (current iteration — scoped 2026-07-21, confirmed by owner)

- [x] Material layer unification — done 2026-07-21, see Done.

- [x] English Studio repairs — done 2026-07-21, see Done. Was: the work in
      `docs/english-studio-ia-design.md` that does **not** depend on the learner model:
      persist partial dictation practice (today an unfinished passage is silently
      discarded, which is why production has zero dictation attempts), cross-module
      navigation (the tool logo leaves the product entirely), dictation's shell and
      Reading's index becoming catalogues, and a cross-mode handoff between dictation and
      reading. Deliberately excludes browse IA — see that doc §2.

- [x] Shared learner model + unified progress centre — done 2026-07-21, see Done.

The learner model's **matching** service (learner → passage) is still open — it is the
Dictation v2 work in Later. This iteration produced its learner-side inputs and stopped.
Accumulated reasoning is in `docs/learner-model-notes.md`; the design (with its open
questions now answered) is `docs/learner-model-design.md`.

Done in the iteration started 2026-07-20 (both shipped 2026-07-21, see Done):

- [x] Extend "try before sign-in" to Reading/Writing
- [x] Dictation v1

## Next

- **Grader variance spike** (do first — cheap, gates the reading-grader work below). Call the
  reading evaluator ~5× on the *same* (audio, passage) with identical params and record the
  stddev of each score dimension + the CEFR-guess agreement rate, over one short and one long
  recording. Output to `docs/spikes/`. The learner model currently **down-weights** reading
  observations on the *assumption* that LLM-judged reading is noisy (learner-model-notes §1) —
  this turns that assumption into a measured number and decides whether the split below is
  worth it. A half-day script, no product code. Confirmed 2026-07-21.
- **Reading grader — deterministic split** (depends on the variance spike). Reading evaluation
  is today a single Gemini call producing scores + CEFR + highlights + drills at once. If the
  spike shows the scores are noisy, split it the way dictation already is: a deterministic
  measurement layer (ASR transcription → word-level diff for accuracy/dropped words; pauses and
  rate from timestamps; optionally a calibrated pronunciation API for phoneme scores) feeding a
  coach layer where the LLM only interprets. Payoff: reading becomes a real measuring
  instrument, so the learner model no longer has to discount its observations. Confirmed
  2026-07-21; see the v1 diagnosis Phase 2.
- **`next_drills`: render or delete.** Reading evaluation generates `next_drills` on every
  attempt and stores it, but no page renders it — a pure dead output costing tokens. Either
  surface it (with a one-tap "practise this" that creates a passage from `target_text`) or drop
  it from the evaluation. Confirmed 2026-07-21.
- Unified feedback-language setting (currently duplicated per tool in localStorage).
- Fold **writing** into the unified progress centre. `/english/progress` shipped 2026-07-21
  across dictation + reading; writing contributes only counters so far because it has no tag
  vocabulary (writing material is a prompt, not a passage). Revisit when a writing vocabulary
  exists.
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
  (c) growing the library from 20 to several hundred passages. Reading/Writing migrate
  to the same interface gradually (interface migration, not a rewrite).
  Prerequisites: unified progress center (Next) + dictation v1.
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
- Writing prompt bank — graded essay prompts so writing has a cold start as good as
  reading's. Cheap (short text, no TTS) but expect less from it than the passage library:
  the friction in writing is producing 250 words, not choosing a topic. Discussed
  2026-07-21; see `docs/learner-model-notes.md` §5.
- Onboarding: one-tap level self-selection, skippable, corrected silently from real
  practice data. **Not** a placement test — dictation already is one. The storage and the
  silent-override rule shipped with the learner model (`cefr_declared` / `cefr_measured`,
  design §8); only the picker UI is left. Discussed 2026-07-21; see
  `docs/learner-model-notes.md` §1 and `docs/learner-model-design.md` §8.
- **vanmemo** (formerly vanbox) stays a permanently separate product — settled
  2026-07-21. It is getting its own top-level domain (vanmemo.com) and its own accounts,
  and its stack is Next.js + OpenNext on Workers with Auth.js, so a monorepo would share
  almost nothing while adding two build systems and two deploy pipelines. bcailab's only
  tie to it is a product link from the homepage. This is no longer a decision awaiting a
  trigger; treat it as closed.

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
