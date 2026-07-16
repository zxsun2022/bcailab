# Architecture Overview

bcailab is a small tools platform running on Cloudflare. A shared auth system gives users a consistent login experience across tools while each tool can keep isolated data and logic.

## Components
- **Remix app** (`apps/web`): Landing page, auth flows, tool UIs.
- **Shared packages** (`packages/*`): UI primitives, auth helpers, D1 access helpers.
- **D1**: Primary relational store for users, sessions, and tool data.
- **R2**: Private binary storage for generated tool assets (Speech MP3 + ESL reading attempt/reference audio).

## Design System
See [design-system.md](./design-system.md) for visual design guidelines including:
- Color palette, typography, spacing
- Border radius system (coordinated with serif fonts)
- Component patterns and usage examples

## LLM Calls
All model calls go through `apps/web/app/utils/llm.server.ts`, which owns the task → model
routing table (e.g. anonymous translation uses a cheaper model). The optional `GEMINI_BASE_URL`
env var can point calls at Cloudflare AI Gateway without code changes.

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
- `/english` English Studio product landing page (public; presents Reading, Writing, Translate, Speech as modules of one product)
- `/translate` LLM-powered translation tool (public with daily quota for anonymous users; signed-in users get higher limits — see docs/tools/translate.md)
- `/login` sign-in popup page (Google OAuth or email OTP code)
- `/auth/google`, `/auth/callback`, `/logout` auth endpoints
- `/posts` posts tool (compose + history rail + in-place editing)
- `/posts/:id` public post view
- `/posts/list` compatibility redirect to `/posts`
- `/posts/:id/edit` compatibility redirect to `/posts?editing=:id`
- `/speech` speech tool (generate + history panel on one page)
- `/speech/audio/:id` authenticated speech audio stream/download endpoint
- `/reading` ESL reading/recitation passage list + creation
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
