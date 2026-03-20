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

## Key Flows
- Google OAuth handled in the Remix app; sessions are stored in D1 and referenced by a secure cookie.
- Tools are protected behind login; public pages are selectively accessible (e.g. published post pages).
- Signed-in users can switch `Auto` / `Light` / `Dark` theme from the avatar menu or tool settings pages; the preference is stored locally in the browser.

## Routing
- `/` landing page
- `/about` about page
- `/auth/google`, `/auth/callback`, `/logout` auth endpoints
- `/posts` posts tool (compose + history rail + in-place editing)
- `/posts/:id` public post view
- `/posts/list` compatibility redirect to `/posts`
- `/posts/:id/edit` compatibility redirect to `/posts?editing=:id`
- `/speech` speech tool (generate + history panel on one page)
- `/speech/audio/:id` authenticated speech audio stream/download endpoint
- `/reading` ESL reading/recitation passage list + creation
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
