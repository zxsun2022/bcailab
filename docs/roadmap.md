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
- [ ] Dictation v1 — fills the "listen" slot of the coach: pre-generated material library
      (LLM-written short passages at fixed difficulty bands, e.g. CEFR A2–C1) with
      per-sentence TTS reusing the Speech pipeline (Chirp3 → R2 + D1; per-sentence
      synthesis, since Chirp3 provides no word timepoints); sentence-by-sentence playback
      with replay + speed control; deterministic diff-based scoring (LLM only for
      error-pattern feedback); anonymous "try one passage" via the existing quota
      infrastructure. Technical design: `docs/dictation-v1-design.md` (its Appendix A
      also holds the try-before-sign-in implementation checklist).

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
- Dictation v2 — level-adaptive material generation (agreed 2026-07-20): elevate
  `learner_profile` into a shared learner-model layer (tools write observations, the
  profile layer aggregates) and add a unified material-generation service on the
  `llm.server.ts` routing table that consumes profile + task type. Dictation consumes it
  first; Reading/Writing migrate to the same interface gradually (interface migration,
  not a rewrite). Prerequisites: unified progress center (Next) + dictation v1.
- Decided 2026-07-16: Translate stays inside English Studio as its free funnel (not a
  standalone homepage product); revisit only if usage data shows a distinct audience.
- Engineering quality: vitest for LLM-output parsers + ESLint; fix evaluation-history N+1
  query; audio Range request support; session cleanup cron; session secret rotation.
- Profile settings (avatar + nickname) for email-OTP users, who have no Google profile
  data to fall back on — noted 2026-07-20, not urgent.

## Done

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
