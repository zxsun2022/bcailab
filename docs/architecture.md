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
- Signed-in users can switch `Auto` / `Light` / `Dark` theme from the avatar menu; the preference is stored locally in the browser.

## Routing
- `/` landing page
- `/about` about page
- `/auth/google`, `/auth/callback`, `/logout` auth endpoints
- `/posts` posts tool (compose)
- `/posts/list` user's posts list
- `/posts/:id` public post view
- `/posts/:id/edit` edit UI (route file uses `_` to escape nesting: `posts.$id_.edit.tsx`)
- `/speech` speech tool (generate + history panel on one page)
- `/speech/audio/:id` authenticated speech audio stream/download endpoint
- `/esl` ESL tool home
- `/esl/reading` ESL reading/recitation passage list + creation
- `/esl/reading/:id` ESL reading/recitation practice page
- `/esl/reading/:id/status` authenticated ESL reading status polling endpoint
- `/esl/audio/:id` authenticated ESL attempt audio stream/download endpoint
- `/esl/passage-audio/:id` authenticated ESL passage reference audio playback endpoint
- Legacy compatibility: `/tts`, `/tts/history`, `/tts/*` redirect to `/speech*`
- Legacy compatibility: `/text/*` redirects to the corresponding `/posts/*` route
