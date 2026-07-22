# Architecture Overview

bcailab is a small tools platform running on Cloudflare. A shared auth system gives users a consistent login experience across tools while each tool can keep isolated data and logic.

## Components
- **Remix app** (`apps/web`): Landing page, auth flows, tool UIs.
- **Shared packages** (`packages/*`): UI primitives, auth helpers, D1 access helpers.
- **D1**: Primary relational store for users, sessions, and tool data.
- **Material layer**: Dictation and Reading share one graded passage store (`passages`,
  `passage_sentences`, `passage_tags`, `passage_stats`), so a single passage can drive both
  listening and reading-aloud practice. `user_id IS NULL` marks global library content.
  See docs/material-layer-design.md.
- **Learner model**: Every scored attempt writes deterministic per-tag observations
  (`learner_tag_observations`, keyed on the `passage_tags` vocabulary) which aggregate into a
  shared profile (`esl_learner_profiles`, generalised beyond reading: per-tag mastery + a CEFR
  estimate). Dictation is the precise signal (deterministic diff ops); reading is a
  down-weighted LLM-judged one. A background pass names patterns for the learner; it never
  decides them. Surfaced at `/english/progress`. See docs/learner-model-design.md.
- **R2**: Binary storage for generated tool assets (Speech MP3 + ESL reading attempt/reference audio).
  These are private user data served behind auth. The one exception is the `dictation/` prefix:
  global app content (pre-generated per-sentence MP3s), served publicly with immutable caching —
  see docs/tools/dictation.md.

## Design System
See [design-system.md](./design-system.md) for visual design guidelines including:
- Color palette, typography, spacing
- Border radius system (coordinated with serif fonts)
- Component patterns and usage examples

## LLM Calls
All model calls go through `apps/web/app/utils/llm.server.ts`, which owns the task → model
routing table (e.g. anonymous translation uses a cheaper model). The optional `GEMINI_BASE_URL`
env var can point calls at Cloudflare AI Gateway without code changes.

Model tiers (2026-07-21): most tasks use `gemini-2.5-flash` (pinned explicitly rather than the
`gemini-flash-latest` alias, which now tracks the pricier 3.6 Flash); the cheap tier
(`translate_anonymous`, `title_generation`) uses `gemini-2.5-flash-lite`; and the quality-critical
evaluation tasks (`reading_eval`, `writing_feedback`) opt into `gemini-3.6-flash`. `GEMINI_MODEL`
still overrides tasks flagged `envModelOverride`.

## Key Flows
- Sign-in happens in a popup at `/login`: Google OAuth, or an email one-time code (for users
  who cannot reach Google). Email is the primary identity; a Google login with a matching
  email attaches to the same account.
- Google OAuth handled in the Remix app; sessions are stored in D1 and referenced by a secure cookie.
- Email OTP codes are sent via Resend (`RESEND_API_KEY`); in local dev without the key, the
  code is logged to the server console and shown in the dev UI.
- Tools are protected behind login; public pages are selectively accessible (e.g. published post pages).
- Signed-in users can switch `Auto` / `Light` / `Dark` theme from the avatar menu or tool settings pages; the preference is stored locally in the browser.

## Routing
- `/` studio homepage (lab intro, product cards linking to landing pages, principles, team info)
- `/about` about page
- `/english` English Studio product landing page (public; presents Reading, Writing, Translate, Dictation, Speech as modules of one product)
- `/english/progress` unified learner progress centre (authenticated; one growth view across dictation and reading, reading the shared learner profile — see docs/learner-model-design.md)
- `/translate` LLM-powered translation tool (public with daily quota for anonymous users; signed-in users get higher limits — see docs/tools/translate.md)
- `/login` sign-in popup page (Google OAuth or email OTP code)
- `/auth/google`, `/auth/callback`, `/logout` auth endpoints
- `/posts` posts tool (compose + history rail + in-place editing)
- `/posts/:id` public post view
- `/posts/list` compatibility redirect to `/posts`
- `/posts/:id/edit` compatibility redirect to `/posts?editing=:id`
- `/speech` speech tool (generate + history panel on one page)
- `/speech/audio/:id` authenticated speech audio stream/download endpoint
- `/dictation` dictation library (public; passages grouped by CEFR band — see docs/tools/dictation.md)
- `/dictation/:passageId` dictation session (public, quota-gated; stepper + summary)
- `/dictation/audio/:sentenceId` **public** per-sentence MP3 stream (global content, immutable cache)
- `/dictation/attempt/:attemptId/status` authenticated feedback status polling endpoint
- `/reading/trial` **public** anonymous reading trial (fixed sample passage; nothing persisted — see docs/tools/esl.md)
- `/writing/trial` **public** anonymous writing trial (one feedback round; nothing persisted — see docs/tools/writing.md)
- `/reading` reading catalogue: the learner's own passages plus the graded library
- `/reading/new` create a passage from your own text
- `/reading/progress` ESL reading/recitation progress dashboard
- `/reading/:id` ESL reading/recitation practice page
- `/reading/:id/status` authenticated ESL reading status polling endpoint
- `/esl/audio/:id` authenticated ESL attempt audio stream/download endpoint
- `/esl/passage-audio/:id` authenticated ESL passage reference audio playback endpoint
- `/writing` writing tool layout (three-column shell with nav rail + canvas)
- `/writing` (index) new article creation with coach selection
- `/writing/:id` article detail: editor + feedback + revision rail
- `/writing/:id/status` authenticated feedback status polling endpoint
- `/writing/progress` writing progress dashboard
- `/writing/settings` writing-specific settings
- `/writing/dashboard` legacy redirect to `/writing/progress`
- Legacy compatibility: `/esl` redirects to `/reading`
- Legacy compatibility: `/esl/reading*` redirects to `/reading*`
- Legacy compatibility: `/tts`, `/tts/history`, `/tts/*` redirect to `/speech*`
- Legacy compatibility: `/text/*` redirects to the corresponding `/posts/*` route
