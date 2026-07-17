# Roadmap

**This file is the single source of truth for iteration planning.** Any AI coding tool
(Claude Code, Codex, etc.) or human working in this repo should:

1. Read this file before starting product work, to know what the current iteration is.
2. Move finished items to **Done** (with a date) in the same PR that finishes them.
3. Only add or reprioritize items after the owner (Z.Sun) confirms — never unilaterally.

Product direction (agreed 2026-07): bcailab is a studio; **English Studio** is the flagship
product (an AI English coach: read, write, listen, translate). Translate is the free,
no-account acquisition funnel into it.

## Now (current iteration — started 2026-07-15)

- [x] Unified LLM call layer `llm.server.ts`: task → model routing table, per-tier translate
      models (anonymous = flash-lite, signed-in = flash), optional `GEMINI_BASE_URL` override
      for Cloudflare AI Gateway.
- [x] Anonymous translation with quotas: 5,000 chars/request + 8 requests/day (anon cookie +
      IP counters in D1); signed-in 20,000 chars/request + 200/day invisible abuse cap;
      quota banner + sign-in CTA.
- [x] Email OTP login (for users who cannot use Google OAuth, e.g. mainland China):
      `/login` popup with Google + email code, Resend sender (dev fallback logs the code),
      identity decoupled from Google (email is the primary identity; Google merges by email).
- [x] Resend domain verification for bcailab.com (verified 2026-07-16 via Resend's
      Cloudflare integration).
- [ ] Real-delivery test of the sign-in code to QQ/163 mailboxes (owner action). Note:
      `wrangler pages secret put` only sets the **Production** env — set `RESEND_API_KEY`
      for the **Preview** env in the Pages dashboard to test email sign-in on preview URLs.

## Next

- Extend "try before sign-in" to Reading/Writing: one full sample evaluation for anonymous
  users (reuses the quota infrastructure from this iteration).
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
- Decided 2026-07-16: Translate stays inside English Studio as its free funnel (not a
  standalone homepage product); revisit only if usage data shows a distinct audience.
- Engineering quality: vitest for LLM-output parsers + ESLint; fix evaluation-history N+1
  query; audio Range request support; session cleanup cron; session secret rotation.

## Done

- 2026-07-15 — Homepage redesigned as studio page (every.to style); `/english` product
  landing page merging Reading/Writing/Translate/Speech as one product; `/translate`
  DeepL-style tool (Gemini-driven).
- 2026-04-02 — Reading progress dashboard; ESL reading compose layout refactor.
- 2026-03-05 — Reading/Recitation v2 redesign complete.
