# Roadmap

**This file is the single source of truth for iteration planning.** Any AI coding tool
(Claude Code, Codex, etc.) or human working in this repo should:

1. Read this file before starting product work, to know what the current iteration is.
2. Move finished items to **Done** (with a date) in the same PR that finishes them.
3. Only add or reprioritize items after the owner (Z.Sun) confirms — never unilaterally.

Product direction (agreed 2026-07): bcailab is a studio; **English Studio** is the flagship
product (an AI English coach: read, write, listen, translate). Translate is the free,
no-account acquisition funnel into it.

## Now (current iteration — started 2026-07-20, confirmed by owner)

- [ ] Extend "try before sign-in" to Reading/Writing: one full sample evaluation for
      anonymous users (reuses the quota infrastructure from the previous iteration).
- [x] Dictation v1 — done 2026-07-21, see Done.

## Next

- Unified feedback-language setting (currently duplicated per tool in localStorage).
- Unified progress center: make `learner_profile` a user-visible growth curve across
  reading and writing.
- Feedback wait experience: streaming or narrative loading instead of a spinner
  (the "magic moment" should not hide behind a spinner).
- Replace native `confirm()` dialogs with branded confirmation UI.

## Later

- Long-document translation: chunked parallel translation + streaming output; raise
  signed-in limit to ~100k chars.
- Faster first-token: evaluate Groq (or similar) for the translate task via the
  `llm.server.ts` routing table; adopt Cloudflare AI Gateway for cost/usage observability.
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

## Done

- 2026-07-21 — Dictation v1 shipped: pre-generated global material library (20 passages,
  5 each at CEFR A2–C1; 211 per-sentence Chirp3 MP3s in R2 under a public `dictation/`
  prefix), `/dictation` library + session workspace with replay and speed control,
  deterministic diff scoring (`dictation-diff.ts`, British/American spellings equivalent,
  flooding guard), signed-in attempt history with background LLM error-pattern feedback,
  and anonymous access via the new generic `feature_usage` quota table. Content is seeded
  offline by `scripts/dictation-seed/` (generate → owner review → publish); there is no
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
